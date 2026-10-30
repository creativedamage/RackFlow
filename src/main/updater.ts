// In-app updates from GitHub Releases.
//
// On launch (and every few hours) the app asks GitHub for the latest release of
// UPDATE_REPO. If it is newer than this build, the matching zip
// (RackFlow-<version>-mac-<arch>.zip) is downloaded and unpacked in the
// background, the user is told it's ready, and "Restart" swaps the new
// RackFlow.app into place and relaunches. If the user just quits, the new
// version is installed on quit so the next launch is current.
//
// This deliberately doesn't use Squirrel / electron-updater: those require an
// Apple Developer ID signature to install, and RackFlow is ad-hoc signed.

import { app, BrowserWindow, net, shell } from 'electron'
import { spawn, execFile } from 'node:child_process'
import { chmodSync, createWriteStream, existsSync, writeFileSync } from 'node:fs'
import { access, constants, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { isNewerVersion } from '../core/version'

export const UPDATE_REPO = 'creativedamage/RackFlow'
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
const run = promisify(execFile)

/** Mirrors UpdateStatus in preload/api.d.ts. */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string; notes: string }
  | { state: 'manual'; version: string; notes: string; url: string; reason: string }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'idle' }
let staged: { appPath: string; version: string } | null = null
let installOnQuit = false
let busy = false

export const newer = isNewerVersion

const broadcast = (s: UpdateStatus) => {
  status = s
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:status', s)
}
export const updateStatus = () => status

/** The .app bundle this process runs from, or null in development. */
function currentBundle(): string | null {
  if (!app.isPackaged || process.platform !== 'darwin') return null
  const p = dirname(dirname(dirname(process.execPath))) // …/RackFlow.app/Contents/MacOS/RackFlow
  return p.endsWith('.app') ? p : null
}

interface Release { tag_name: string; body?: string; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string; size: number }[] }

export async function checkForUpdates(opts: { userInitiated?: boolean } = {}): Promise<UpdateStatus> {
  if (busy) return status
  if (staged) { broadcast({ state: 'ready', version: staged.version, notes: status.state === 'ready' ? status.notes : '' }); return status }
  busy = true
  try {
    if (opts.userInitiated) broadcast({ state: 'checking' })
    const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `RackFlow/${app.getVersion()}` },
    })
    if (res.status === 404) { broadcast({ state: 'current', version: app.getVersion() }); return status }
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const rel = (await res.json()) as Release
    const version = rel.tag_name.replace(/^v/, '')
    if (rel.draft || rel.prerelease || !newer(version, app.getVersion())) {
      broadcast(opts.userInitiated ? { state: 'current', version: app.getVersion() } : { state: 'idle' })
      return status
    }
    const notes = (rel.body ?? '').slice(0, 2000)
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const zip = rel.assets.find((a) => a.name.endsWith(`mac-${arch}.zip`)) ?? rel.assets.find((a) => a.name.endsWith('.zip') && a.name.includes('mac'))
    const dmg = rel.assets.find((a) => a.name.endsWith(`${arch}.dmg`)) ?? rel.assets.find((a) => a.name.endsWith('.dmg'))
    const bundle = currentBundle()
    const manual = (reason: string) => { broadcast({ state: 'manual', version, notes, url: dmg?.browser_download_url ?? rel.html_url, reason }); return status }
    if (!bundle) return manual(app.isPackaged ? 'Automatic install is only available on macOS.' : 'Running from source: download the new version manually.')
    if (!zip) return manual('This release has no installable zip for your Mac.')
    try { await access(dirname(bundle), constants.W_OK) } catch { return manual(`RackFlow can’t write to ${dirname(bundle)}. Install the new DMG yourself.`) }

    // Download and unpack in the background.
    const dir = await mkdtemp(join(tmpdir(), 'rackflow-update-'))
    const file = join(dir, zip.name)
    const dl = await net.fetch(zip.browser_download_url, { headers: { 'User-Agent': `RackFlow/${app.getVersion()}` } })
    if (!dl.ok || !dl.body) throw new Error(`Download failed (${dl.status})`)
    const total = Number(dl.headers.get('content-length')) || zip.size || 0
    let got = 0, lastPct = -1
    const src = Readable.fromWeb(dl.body as never)
    src.on('data', (c: Buffer) => {
      got += c.length
      const pct = total ? Math.floor((got / total) * 100) : 0
      if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; broadcast({ state: 'downloading', version, percent: pct }) }
    })
    await pipeline(src, createWriteStream(file))
    await run('/usr/bin/ditto', ['-x', '-k', file, dir])
    const appPath = join(dir, 'RackFlow.app')
    if (!existsSync(appPath)) throw new Error('The downloaded update doesn’t contain RackFlow.app')
    const plist = await readFile(join(appPath, 'Contents', 'Info.plist'), 'utf8')
    const v = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1]
    if (v && v !== version) throw new Error(`Downloaded app is ${v}, expected ${version}`)
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appPath]).catch(() => undefined)
    staged = { appPath, version }
    installOnQuit = true
    broadcast({ state: 'ready', version, notes })
    return status
  } catch (err) {
    broadcast(opts.userInitiated ? { state: 'error', message: err instanceof Error ? err.message : String(err) } : { state: 'idle' })
    return status
  } finally {
    busy = false
  }
}

/** Swaps the staged app into place once this process exits; optionally relaunches it. */
function scheduleSwap(relaunch: boolean): boolean {
  const bundle = currentBundle()
  if (!staged || !bundle) return false
  const script = join(dirname(staged.appPath), 'install.sh')
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  writeFileSync(script, `#!/bin/bash
# RackFlow updater: wait for the app to quit, then replace it.
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done
OLD=${q(bundle)}
NEW=${q(staged.appPath)}
BAK="$OLD.previous"
rm -rf "$BAK"
if mv "$OLD" "$BAK" && mv "$NEW" "$OLD"; then
  rm -rf "$BAK"
else
  [ -d "$BAK" ] && [ ! -d "$OLD" ] && mv "$BAK" "$OLD"
fi
/usr/bin/xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
${relaunch ? '/usr/bin/open "$OLD"' : ''}
`, 'utf8')
  chmodSync(script, 0o755)
  spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref()
  staged = null
  installOnQuit = false
  return true
}

/** "Restart Now": quit (the window's save prompt still applies) and relaunch on the new version. */
export function installAndRestart() {
  if (scheduleSwap(true)) app.quit()
}

export function openReleasePage(url?: string) {
  void shell.openExternal(url ?? `https://github.com/${UPDATE_REPO}/releases/latest`)
}

export function startUpdater() {
  // Install a downloaded update when the user quits normally.
  app.on('will-quit', () => { if (installOnQuit && staged) scheduleSwap(false) })
  if (!app.isPackaged) return
  setTimeout(() => void checkForUpdates(), 8000)
  setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
}


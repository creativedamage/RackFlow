import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import type { MenuCommand, OpenedFile } from '../preload/api'
import { registerSpecIPC } from './specs'
import { checkForUpdates, installAndRestart, openReleasePage, startUpdater, updateStatus } from './updater'

const isMac = process.platform === 'darwin'
let win: BrowserWindow | null = null
let docState = { title: 'Untitled Project', dirty: false, path: null as string | null }
let allowClose = false
let pendingOpen: string | null = null

// MARK: Window

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640, show: false,
    title: 'RackFlow',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    // Liquid Glass: the sidebar and toolbar are translucent over the window's vibrancy.
    ...(isMac ? { vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const, backgroundColor: '#00000000' } : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#161618' : '#f5f5f7' }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.once('ready-to-show', () => win?.show())

  // External links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' } })

  win.on('close', (e) => {
    if (allowClose || !docState.dirty || !win) return
    e.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Save', 'Don’t Save', 'Cancel'], defaultId: 0, cancelId: 2,
      message: `Do you want to save the changes you made to “${docState.title}”?`,
      detail: 'Your changes will be lost if you don’t save them.',
    })
    if (choice === 0) {
      send('save-and-close')
      // If the page is stuck it never answers: don't trap the user in the app.
      const w = win
      setTimeout(() => {
        if (!w || w.isDestroyed() || allowClose) return
        if (dialog.showMessageBoxSync(w, { type: 'warning', buttons: ['Keep Waiting', 'Quit Without Saving'], defaultId: 0, cancelId: 0,
          message: 'RackFlow isn’t responding to Save.', detail: 'If you already chose where to save, wait a moment. Otherwise you can quit without saving.' }) === 1) { allowClose = true; w.destroy() }
      }, 15000)
    }
    else if (choice === 1) { allowClose = true; win.close() }
  })
  // A hung or crashed page: offer to reload or quit instead of freezing.
  win.webContents.on('unresponsive', () => {
    if (!win) return
    const c = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Wait', 'Reload Window', 'Quit RackFlow'], defaultId: 0, cancelId: 0,
      message: 'RackFlow is not responding.', detail: 'Reloading or quitting loses unsaved changes since your last save.' })
    if (c === 1) win.webContents.reload()
    if (c === 2) { allowClose = true; app.exit(0) }
  })
  win.webContents.on('render-process-gone', () => {
    if (!win) return
    const c = dialog.showMessageBoxSync(win, { type: 'error', buttons: ['Reload Window', 'Quit RackFlow'], defaultId: 0,
      message: 'RackFlow’s window crashed.', detail: 'Unsaved changes since your last save are lost.' })
    if (c === 0) win.webContents.reload(); else { allowClose = true; app.exit(0) }
  })
  win.on('closed', () => { win = null; allowClose = false })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  win.webContents.once('did-finish-load', () => {
    // A file double-clicked in Finder wins; otherwise pick up where you left off – the last project.
    const last = recent.find((p) => existsSync(p))
    const target = pendingOpen ?? (process.env.RACKFLOW_NO_REOPEN ? null : last ?? null)
    if (target) { void openPath(target); pendingOpen = null }
  })
}

const send = (cmd: MenuCommand) => win?.webContents.send('menu', cmd)

// MARK: Recent projects – our own list, so Open Recent works whether or not
// macOS has registered the .rackflow document type for an ad-hoc signed app.

// MARK: Appearance (System / Light / Dark) – nativeTheme drives the CSS colour scheme, menus and dialogs.

type Theme = 'system' | 'light' | 'dark'
const themeFile = () => join(app.getPath('userData'), 'Appearance.json')
async function loadTheme() {
  try { const t = JSON.parse(await readFile(themeFile(), 'utf8')).theme; if (t === 'light' || t === 'dark' || t === 'system') nativeTheme.themeSource = t } catch { /* first run */ }
}
function setTheme(t: Theme) {
  nativeTheme.themeSource = t
  if (!isMac) win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#161618' : '#f5f5f7')
  void mkdir(app.getPath('userData'), { recursive: true }).then(() => writeFile(themeFile(), JSON.stringify({ theme: t }), 'utf8')).catch(() => undefined)
  buildMenu()
  send(`theme:${t}`)
}

const recentFile = () => join(app.getPath('userData'), 'Recent.json')
let recent: string[] = []
async function loadRecent() { try { recent = (JSON.parse(await readFile(recentFile(), 'utf8')) as string[]).filter((x) => typeof x === 'string') } catch { recent = [] } }
function noteRecent(path: string) {
  recent = [path, ...recent.filter((x) => x !== path)].slice(0, 12)
  app.addRecentDocument(path)
  void mkdir(app.getPath('userData'), { recursive: true }).then(() => writeFile(recentFile(), JSON.stringify(recent), 'utf8')).catch(() => undefined)
  buildMenu()
}
function recentMenu(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = recent.map((p) => ({
    label: basename(p).replace(/\.rackflow$/, ''), sublabel: dirname(p),
    toolTip: p,
    click: () => { if (existsSync(p)) void openPath(p); else { dialog.showErrorBox('File not found', `${p}\n\nIt may have been moved or deleted.`); recent = recent.filter((x) => x !== p); buildMenu() } },
  }))
  if (!items.length) items.push({ label: 'No Recent Projects', enabled: false })
  items.push({ type: 'separator' }, { label: 'Clear Menu', enabled: recent.length > 0, click: () => { recent = []; app.clearRecentDocuments(); void writeFile(recentFile(), '[]', 'utf8').catch(() => undefined); buildMenu() } })
  return items
}

async function openPath(path: string) {
  try {
    const data = await readFile(path, 'utf8')
    const file: OpenedFile = { path, data }
    win?.webContents.send('open-file', file)
    noteRecent(path)
  } catch (err) {
    dialog.showErrorBox('Couldn’t open file', String(err))
  }
}

// MARK: Menu

function buildMenu() {
  const cmd = (label: string, command: MenuCommand, accelerator?: string): MenuItemConstructorOptions =>
    ({ label, accelerator, click: () => send(command) })

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { label: 'Check for Updates…', click: () => { void checkForUpdates({ userInitiated: true }) } },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const }, { role: 'hideOthers' as const }, { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        cmd('New Project', 'new', 'CmdOrCtrl+N'),
        cmd('Open…', 'open', 'CmdOrCtrl+O'),
        { label: 'Open Recent', submenu: recentMenu() },
        { type: 'separator' },
        cmd('Save', 'save', 'CmdOrCtrl+S'),
        cmd('Save As…', 'saveAs', 'Shift+CmdOrCtrl+S'),
        cmd('Auto Save On / Off', 'autosave:toggle'),
        { type: 'separator' },
        cmd('Quick Print', 'quickPrint', 'CmdOrCtrl+P'),
        cmd('Export Everything…', 'exportAll', 'Shift+CmdOrCtrl+E'),
        { type: 'separator' },
        cmd('Find Device…', 'findDevice', 'Shift+CmdOrCtrl+F'),
        cmd('New Custom Product…', 'newProduct', 'Alt+CmdOrCtrl+N'),
        cmd('New Patch Bay Template…', 'newTemplate'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Document undo is ours (snapshot history); text fields keep native undo
        // because the renderer only handles ⌘Z when focus isn't in an input.
        cmd('Undo', 'undo', 'CmdOrCtrl+Z'),
        cmd('Redo', 'redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        cmd('Delete', 'delete'),
        cmd('Select All Devices', 'selectAll', 'CmdOrCtrl+A'),
        { type: 'separator' },
        cmd('Edit Selected Device…', 'editDevice', 'CmdOrCtrl+E'),
        { type: 'separator' },
        cmd('Numbering Standards…', 'numbering'),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Wiring Diagram', 'mode:diagram', 'CmdOrCtrl+1'),
        cmd('Rack Elevation', 'mode:rack', 'CmdOrCtrl+2'),
        cmd('Patch Labels', 'mode:patch', 'CmdOrCtrl+3'),
        cmd('Schedule (Spreadsheet)', 'mode:sheet', 'CmdOrCtrl+4'),
        cmd('LED Walls', 'mode:led', 'CmdOrCtrl+5'),
        { type: 'separator' },
        cmd('Tidy Up Wiring Diagram', 'tidy', 'Alt+CmdOrCtrl+L'),
        { type: 'separator' },
        cmd('Zoom to Fit', 'zoomFit', 'CmdOrCtrl+0'),
        cmd('Toggle Inspector', 'toggleInspector', 'Alt+CmdOrCtrl+I'),
        { label: 'Units', submenu: [cmd('Imperial (in, ft, lb)', 'units:imperial'), cmd('Metric (mm, m, kg)', 'units:metric')] },
        {
          label: 'Appearance',
          submenu: (['system', 'light', 'dark'] as const).map((t): MenuItemConstructorOptions => ({
            label: t === 'system' ? 'Use System Setting' : t === 'light' ? 'Light' : 'Dark',
            type: 'radio', checked: nativeTheme.themeSource === t, click: () => setTheme(t),
          })),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }, { role: 'reload' as const }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: () => { void checkForUpdates({ userInitiated: true }) } },
        { label: 'RackFlow Releases on GitHub', click: () => openReleasePage() },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// MARK: User library (one JSON file per item – sync- and share-friendly)

const libDir = (kind: 'Products' | 'PatchTemplates') => join(app.getPath('userData'), kind)
const safe = (key: string) => key.replace(/[^a-zA-Z0-9.-]/g, '_')

async function readAll<T>(dir: string): Promise<T[]> {
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const out: T[] = []
    for (const f of files) {
      try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8')) as T) } catch { /* skip corrupt file */ }
    }
    return out
  } catch { return [] }
}

async function writeItem(dir: string, key: string, value: unknown) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${safe(key)}.json`), JSON.stringify(value, null, 2), 'utf8')
}

// MARK: Print / PDF – render the label HTML in a hidden window at 1:1

async function withPrintWindow<T>(html: string, fn: (w: BrowserWindow) => Promise<T>): Promise<T> {
  // A temp file (not a data: URL) so large multi-page jobs aren't size-limited.
  const dir = await mkdtemp(join(tmpdir(), 'rackflow-print-'))
  const file = join(dir, 'labels.html')
  await writeFile(file, html, 'utf8')
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
  try {
    await w.loadFile(file)
    return await fn(w)
  } finally {
    w.destroy()
    await rm(dir, { recursive: true, force: true })
  }
}

// MARK: IPC

function registerIPC() {
  registerSpecIPC()
  const projectFilters = [{ name: 'RackFlow Project', extensions: ['rackflow'] }]

  ipcMain.handle('project:open', async () => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: projectFilters })
    if (r.canceled || !r.filePaths[0]) return null
    const path = r.filePaths[0]
    noteRecent(path)
    return { path, data: await readFile(path, 'utf8') } satisfies OpenedFile
  })

  ipcMain.handle('project:save', async (_e, path: string | null, data: string, suggested: string) => {
    let target = path
    if (!target) {
      if (!win) return null
      const r = await dialog.showSaveDialog(win, { defaultPath: `${suggested}.rackflow`, filters: projectFilters })
      if (r.canceled || !r.filePath) return null
      target = extname(r.filePath) ? r.filePath : `${r.filePath}.rackflow`
    }
    // Write-then-rename keeps the previous file intact if the write fails.
    const tmp = join(dirname(target), `.${basename(target)}.tmp`)
    await writeFile(tmp, data, 'utf8')
    await rename(tmp, target)
    noteRecent(target)
    return target
  })

  ipcMain.on('doc:state', (_e, s: typeof docState) => {
    docState = s
    if (!win) return
    win.setTitle(`${s.title}${s.dirty && !isMac ? ' •' : ''} — RackFlow`)
    if (isMac) {
      win.setDocumentEdited(s.dirty)
      win.setRepresentedFilename(s.path ?? '')
    }
  })
  ipcMain.on('window:close', () => { allowClose = true; win?.close() })
  ipcMain.handle('dialog:saveChanges', async (_e, name: string) => {
    if (!win) return 'discard'
    const r = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Save', 'Don’t Save', 'Cancel'], defaultId: 0, cancelId: 2,
      message: `Do you want to save the changes you made to “${name}”?`,
      detail: 'Your changes will be lost if you don’t save them.',
    })
    return r.response === 0 ? 'save' : r.response === 1 ? 'discard' : 'cancel'
  })

  // Small app-wide JSON stores (title block templates, numbering standards) – shared across projects.
  const STORES = new Set(['TitleBlocks', 'NumberingStandards'])
  const storeFile = (name: string) => join(app.getPath('userData'), `${name}.json`)
  ipcMain.handle('store:get', async (_e, name: string) => {
    if (!STORES.has(name)) return null
    try { return JSON.parse(await readFile(storeFile(name), 'utf8')) } catch { return null }
  })
  ipcMain.handle('store:set', async (_e, name: string, data: unknown) => {
    if (!STORES.has(name)) return
    await mkdir(app.getPath('userData'), { recursive: true })
    const tmp = `${storeFile(name)}.tmp`
    await writeFile(tmp, JSON.stringify(data, null, 1), 'utf8')
    await rename(tmp, storeFile(name))
  })
  ipcMain.handle('library:products', () => readAll(libDir('Products')))
  ipcMain.handle('library:saveProduct', (_e, p: { key: string }) => writeItem(libDir('Products'), p.key, p))
  ipcMain.handle('library:deleteProduct', (_e, key: string) => rm(join(libDir('Products'), `${safe(key)}.json`), { force: true }))
  // User-added manufacturers: one small JSON array (names only, no specs).
  const makersFile = () => join(app.getPath('userData'), 'Manufacturers.json')
  const readMakers = async (): Promise<{ name: string }[]> => { try { return JSON.parse(await readFile(makersFile(), 'utf8')) } catch { return [] } }
  ipcMain.handle('library:makers', () => readMakers())
  ipcMain.handle('library:saveMaker', async (_e, m: { name: string }) => {
    const list = (await readMakers()).filter((x) => x.name.toLowerCase() !== m.name.toLowerCase())
    list.push(m)
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(makersFile(), JSON.stringify(list, null, 2), 'utf8')
  })
  ipcMain.handle('library:templates', () => readAll(libDir('PatchTemplates')))
  ipcMain.handle('library:deleteTemplate', (_e, key: string) => rm(join(libDir('PatchTemplates'), `${safe(key)}.json`), { force: true }))
  ipcMain.handle('library:saveTemplate', (_e, t: { key: string }) => writeItem(libDir('PatchTemplates'), t.key, t))

  ipcMain.handle('labels:svg', async (_e, pages: string[], name: string) => {
    if (!win) return null
    const r = await dialog.showSaveDialog(win, { defaultPath: `${name}.svg`, filters: [{ name: 'SVG', extensions: ['svg'] }] })
    if (r.canceled || !r.filePath) return null
    const base = r.filePath.replace(/\.svg$/i, '')
    await Promise.all(pages.map((svg, i) => writeFile(i === 0 ? `${base}.svg` : `${base}-${i + 1}.svg`, svg, 'utf8')))
    return r.filePath
  })

  // Export Everything: one folder with every PDF and CSV.
  ipcMain.handle('export:all', async (_e, files: { name: string; kind: 'pdf' | 'text'; content: string }[], folderName: string) => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to save the export', buttonLabel: 'Export Here', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = join(r.filePaths[0], folderName.replace(/[\\/:*?"<>|]/g, '-'))
    await mkdir(dir, { recursive: true })
    for (const f of files) {
      const target = join(dir, f.name)
      if (f.kind === 'text') { await writeFile(target, f.content, 'utf8'); continue }
      const pdf = await withPrintWindow(f.content, (w) => w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }))
      await writeFile(target, pdf)
    }
    void shell.openPath(dir)
    return dir
  })

  ipcMain.handle('labels:pdf', async (_e, html: string, name: string) => {
    if (!win) return null
    const r = await dialog.showSaveDialog(win, { defaultPath: `${name}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled || !r.filePath) return null
    const pdf = await withPrintWindow(html, (w) => w.webContents.printToPDF({
      preferCSSPageSize: true, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    }))
    await writeFile(r.filePath, pdf)
    void shell.openPath(r.filePath)
    return r.filePath
  })

  ipcMain.handle('labels:print', (_e, html: string) =>
    withPrintWindow(html, (w) => new Promise<void>((resolve) => {
      // Never "fit to page" – that would ruin the channel pitch.
      w.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, scaleFactor: 100 }, () => resolve())
    })))
}

// MARK: Lifecycle

// Double-clicking a .rackflow in Finder (macOS) or passing a path (Windows).
app.on('open-file', (e, path) => {
  e.preventDefault()
  if (win && !win.webContents.isLoading()) void openPath(path)
  else pendingOpen = path
})
const argPath = process.argv.find((a) => a.endsWith('.rackflow'))
if (argPath) pendingOpen = argPath

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (_e, argv) => {
  const p = argv.find((a) => a.endsWith('.rackflow'))
  if (p) void openPath(p)
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

app.whenReady().then(async () => {
  registerIPC()
  ipcMain.handle('update:check', () => checkForUpdates({ userInitiated: true }))
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:install', () => installAndRestart())
  ipcMain.handle('update:openPage', (_e, url?: string) => openReleasePage(url))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('theme:get', () => nativeTheme.themeSource)
  ipcMain.handle('theme:set', (_e, t: Theme) => { if (t === 'system' || t === 'light' || t === 'dark') setTheme(t) })
  await loadTheme()
  await loadRecent()
  buildMenu()
  createWindow()
  startUpdater()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })

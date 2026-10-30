// Spec lookups for the Find Device dialog: fetching a manufacturer page as
// text, and (optionally) asking Claude to read specs using the user's own
// Anthropic API key. The key is encrypted with the macOS keychain-backed
// safeStorage and never leaves this process except to api.anthropic.com.

import { app, ipcMain, net, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { htmlToText, specVocabulary } from '../core/specparse'

export const DEFAULT_AI_MODEL = 'claude-sonnet-4-5'
const MAX_PAGE_CHARS = 60_000

interface AiSettings { key?: string /* base64, encrypted */; model?: string }
const file = () => join(app.getPath('userData'), 'ai.json')
async function readSettings(): Promise<AiSettings> { try { return JSON.parse(await readFile(file(), 'utf8')) } catch { return {} } }
async function writeSettings(s: AiSettings) { await mkdir(app.getPath('userData'), { recursive: true }); await writeFile(file(), JSON.stringify(s), 'utf8') }
async function apiKey(): Promise<string | null> {
  const s = await readSettings()
  if (!s.key) return null
  try { return safeStorage.decryptString(Buffer.from(s.key, 'base64')) } catch { return null }
}

/** Downloads a product page and returns its readable text. */
async function fetchPage(url: string): Promise<{ text: string; title: string; url: string }> {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web addresses (https://…) can be fetched.')
  const res = await reach(u.toString(), { headers: { 'User-Agent': `Mozilla/5.0 (Macintosh) RackFlow/${app.getVersion()}`, Accept: 'text/html,*/*' } })
  if (!res.ok) throw new Error(`The page answered ${res.status}.`)
  const html = await res.text()
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  return { text: htmlToText(html).slice(0, MAX_PAGE_CHARS), title, url: res.url || u.toString() }
}

/** net.fetch with a readable message when the Mac is offline or a site is unreachable. */
async function reach(url: string, init?: RequestInit): Promise<Response> {
  try { return await net.fetch(url, init) } catch (e) {
    const host = new URL(url).host
    throw new Error(`Couldn’t reach ${host} (${e instanceof Error ? e.message.replace(/^net::/, '') : e}). Check your internet connection, or paste the specs instead.`)
  }
}

const SYSTEM = () => {
  const v = specVocabulary()
  return `You build device definitions for RackFlow, an AV system design app. Given a product name (and maybe page text), work out the device's physical connections from the manufacturer's published specifications.

Answer with ONE JSON object and nothing else:
{"manufacturer": string, "model": string (exact official model name), "category": one of the category keys, "summary": short description,
 "rackUnits": number or null (null if not rack-mountable), "weightKG": number, "widthMM": number, "heightMM": number, "depthMM": number,
 "typicalWatts": number, "maxWatts": number,
 "ports": [{"label": short panel label like "12G-SDI Out" or "Mic In", "count": number of identical connectors, "connector": connector key, "direction": "input"|"output"|"bidirectional", "signals": [signal keys, primary first], "group": "Video"|"Audio"|"Network"|"Control"|"Sync"|"Power"|"USB"|"Fiber"|"RF"|"DMX"}],
 "sourceUrl": the page you used, "confidence": "high"|"medium"|"low", "notes": anything uncertain}

Rules: list every physical connector on the device (including power input, reference, timecode, headphones, USB, Ethernet, remote). One entry per distinct connector type+direction with a count. Do not list formats/standards as ports. Omit unknown numbers instead of guessing.
Connector keys: ${v.connectors}
Signal keys: ${v.signals}
Category keys: ${v.categories}`
}

interface AnthropicContent { type: string; text?: string }

async function askClaude(query: string, pageText: string | undefined, useSearch: boolean): Promise<{ json: unknown; raw: string }> {
  const key = await apiKey()
  if (!key) throw new Error('Add your Anthropic API key first.')
  const { model = DEFAULT_AI_MODEL } = await readSettings()
  const user = pageText
    ? `Product: ${query}\n\nManufacturer page text:\n${pageText.slice(0, MAX_PAGE_CHARS)}`
    : `Product: ${query}\n\nSearch the manufacturer's official website for this product's technical specifications (connections section) and build the definition.`
  const body = {
    model, max_tokens: 4096, system: SYSTEM(),
    messages: [{ role: 'user', content: user }],
    ...(useSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {}),
  }
  const res = await reach('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { content?: AnthropicContent[]; error?: { message?: string } }
  if (!res.ok) {
    const msg = data.error?.message ?? `Anthropic API answered ${res.status}`
    // Accounts without web search: fall back to answering from page text / knowledge.
    if (useSearch && /web_search|tool/i.test(msg)) return askClaude(query, pageText, false)
    throw new Error(msg)
  }
  const raw = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The AI answer had no device data. Try pasting the specs instead.')
  return { json: JSON.parse(raw.slice(start, end + 1)), raw }
}

export function registerSpecIPC() {
  ipcMain.handle('specs:fetch', (_e, url: string) => fetchPage(url))
  ipcMain.handle('ai:status', async () => {
    const s = await readSettings()
    return { hasKey: !!s.key, model: s.model ?? DEFAULT_AI_MODEL, canEncrypt: safeStorage.isEncryptionAvailable() }
  })
  ipcMain.handle('ai:settings', async (_e, patch: { key?: string | null; model?: string }) => {
    const s = await readSettings()
    if (patch.key === null) delete s.key
    else if (typeof patch.key === 'string' && patch.key.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this Mac.')
      s.key = safeStorage.encryptString(patch.key.trim()).toString('base64')
    }
    if (typeof patch.model === 'string') s.model = patch.model.trim() || DEFAULT_AI_MODEL
    await writeSettings(s)
  })
  ipcMain.handle('ai:lookup', async (_e, req: { query: string; url?: string; text?: string }) => {
    let text = req.text?.trim() || undefined
    let via = 'AI web search'
    if (!text && req.url) { const page = await fetchPage(req.url); text = page.text; via = `AI reading ${page.url}` }
    else if (text) via = 'AI reading pasted specs'
    const { json } = await askClaude(req.query, text, !text)
    return { json, via }
  })
}

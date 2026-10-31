// The renderer's only gateway to the OS. In Electron this is `window.rackflow`
// (preload, contextIsolation). In a plain browser (tests, web preview) we fall
// back to a shim built on downloads, <input type=file> and localStorage, so the
// whole UI is usable and testable without Electron.

import type { MenuCommand, OpenedFile, RackflowAPI } from '../../preload/api'
import type { PatchBayTemplate, ProductDefinition } from '@core/model'
import type { Manufacturer } from '@core/manufacturers'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const store = {
  get<T>(k: string): T[] { try { return JSON.parse(localStorage.getItem(k) ?? '[]') as T[] } catch { return [] } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } },
}

const menuListeners = new Set<(c: MenuCommand) => void>()
const openListeners = new Set<(f: OpenedFile) => void>()

const browserShim: RackflowAPI = {
  platform: 'web',
  openProject: () => new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.rackflow,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { path: f.name, data: await f.text() } : null)
    }
    input.click()
  }),
  saveProject: async (_path, data, name) => { download(`${name}.rackflow`, data, 'application/json'); return `${name}.rackflow` },
  setDocumentState: (s) => { document.title = `${s.title}${s.dirty ? ' •' : ''} — RackFlow` },
  closeWindow: () => window.close(),

  listUserProducts: async () => store.get<ProductDefinition>('rf.products'),
  saveUserProduct: async (p) => store.set('rf.products', [...store.get<ProductDefinition>('rf.products').filter((x) => x.key !== p.key), p]),
  deleteUserProduct: async (k) => store.set('rf.products', store.get<ProductDefinition>('rf.products').filter((x) => x.key !== k)),
  listUserManufacturers: async () => store.get<Manufacturer>('rf.makers'),
  saveUserManufacturer: async (m) => store.set('rf.makers', [...store.get<Manufacturer>('rf.makers').filter((x) => x.name.toLowerCase() !== m.name.toLowerCase()), m]),
  listUserTemplates: async () => store.get<PatchBayTemplate>('rf.templates'),
  deleteUserTemplate: async (k) => store.set('rf.templates', store.get<PatchBayTemplate>('rf.templates').filter((x) => x.key !== k)),
  saveUserTemplate: async (t) => store.set('rf.templates', [...store.get<PatchBayTemplate>('rf.templates').filter((x) => x.key !== t.key), t]),

  exportSVG: async (pages, name) => { pages.forEach((svg, i) => download(i ? `${name}-${i + 1}.svg` : `${name}.svg`, svg, 'image/svg+xml')); return name },
  exportPDF: async (html) => { browserShim.print(html); return null },
  print: async (html) => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  },

  appVersion: async () => 'browser preview',
  checkForUpdates: async () => ({ state: 'manual', version: '', notes: '', url: 'https://github.com/creativedamage/RackFlow/releases/latest', reason: 'The browser preview can’t install updates.' }),
  updateStatus: async () => ({ state: 'idle' }),
  installUpdate: async () => {},
  openReleasePage: async (url) => { window.open(url ?? 'https://github.com/creativedamage/RackFlow/releases/latest', '_blank') },
  onUpdateStatus: () => () => {},
  fetchSpecPage: async () => { throw new Error('The browser preview can’t fetch pages – paste the specs instead.') },
  exportAll: async (files) => { for (const f of files) download(f.kind === 'pdf' ? f.name.replace(/\.pdf$/, '.html') : f.name, f.content, f.kind === 'pdf' ? 'text/html' : 'text/csv'); return 'Downloads' },
  askSaveChanges: async (name) => (confirm(`Save changes to “${name}” first?\n\nOK = Save · Cancel = choose whether to discard`) ? 'save' : confirm('Discard your changes and continue?') ? 'discard' : 'cancel'),
  aiStatus: async () => ({ hasKey: false, model: 'claude-sonnet-4-5', canEncrypt: false }),
  aiSettings: async () => { throw new Error('AI lookup needs the Mac app.') },
  aiLookup: async () => { throw new Error('AI lookup needs the Mac app.') },
  onMenu: (cb) => { menuListeners.add(cb); return () => menuListeners.delete(cb) },
  onOpenFile: (cb) => { openListeners.add(cb); return () => openListeners.delete(cb) },
}

export const api: RackflowAPI = window.rackflow ?? browserShim
export const isElectron = !!window.rackflow
export const isMac = api.platform === 'darwin'

/** In the browser there is no native menu, so map the same shortcuts here. */
if (!isElectron) {
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const k = e.key.toLowerCase()
    const map: Record<string, MenuCommand> = { n: 'new', o: 'open', s: e.shiftKey ? 'saveAs' : 'save', z: e.shiftKey ? 'redo' : 'undo', y: 'redo', 1: 'mode:diagram', 2: 'mode:rack', 3: 'mode:patch', 4: 'mode:sheet', 5: 'mode:led', 0: 'zoomFit', e: e.shiftKey ? 'exportAll' : 'editDevice', ...(e.shiftKey ? { f: 'findDevice' as MenuCommand } : {}), ...(e.altKey ? { l: 'tidy' as MenuCommand, '¬': 'tidy' as MenuCommand } : {}) }
    const cmd = map[k]
    if (!cmd) return
    e.preventDefault()
    menuListeners.forEach((l) => l(cmd))
  })
}

import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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
    backgroundColor: '#f5f5f7',
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
    if (choice === 0) send('save-and-close')
    else if (choice === 1) { allowClose = true; win.close() }
  })
  win.on('closed', () => { win = null; allowClose = false })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  win.webContents.once('did-finish-load', () => {
    if (pendingOpen) { void openPath(pendingOpen); pendingOpen = null }
  })
}

const send = (cmd: MenuCommand) => win?.webContents.send('menu', cmd)

async function openPath(path: string) {
  try {
    const data = await readFile(path, 'utf8')
    const file: OpenedFile = { path, data }
    win?.webContents.send('open-file', file)
    app.addRecentDocument(path)
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
        { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] } as MenuItemConstructorOptions,
        { type: 'separator' },
        cmd('Save', 'save', 'CmdOrCtrl+S'),
        cmd('Save As…', 'saveAs', 'Shift+CmdOrCtrl+S'),
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
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Wiring Diagram', 'mode:diagram', 'CmdOrCtrl+1'),
        cmd('Rack Elevation', 'mode:rack', 'CmdOrCtrl+2'),
        cmd('Patch Labels', 'mode:patch', 'CmdOrCtrl+3'),
        cmd('Schedule (Spreadsheet)', 'mode:sheet', 'CmdOrCtrl+4'),
        { type: 'separator' },
        cmd('Tidy Up Wiring Diagram', 'tidy', 'Alt+CmdOrCtrl+L'),
        { type: 'separator' },
        cmd('Zoom to Fit', 'zoomFit', 'CmdOrCtrl+0'),
        cmd('Toggle Inspector', 'toggleInspector', 'Alt+CmdOrCtrl+I'),
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
    app.addRecentDocument(path)
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
    app.addRecentDocument(target)
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

app.whenReady().then(() => {
  registerIPC()
  ipcMain.handle('update:check', () => checkForUpdates({ userInitiated: true }))
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:install', () => installAndRestart())
  ipcMain.handle('update:openPage', (_e, url?: string) => openReleasePage(url))
  ipcMain.handle('app:version', () => app.getVersion())
  buildMenu()
  createWindow()
  startUpdater()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (!isMac) app.quit() })

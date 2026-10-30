import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MenuCommand, OpenedFile, RackflowAPI, UpdateStatus } from './api'

const on = <T>(channel: string, cb: (v: T) => void) => {
  const listener = (_: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const api: RackflowAPI = {
  platform: process.platform,
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (path, data, name) => ipcRenderer.invoke('project:save', path, data, name),
  setDocumentState: (s) => ipcRenderer.send('doc:state', s),
  closeWindow: () => ipcRenderer.send('window:close'),

  listUserProducts: () => ipcRenderer.invoke('library:products'),
  saveUserProduct: (p) => ipcRenderer.invoke('library:saveProduct', p),
  deleteUserProduct: (k) => ipcRenderer.invoke('library:deleteProduct', k),
  listUserManufacturers: () => ipcRenderer.invoke('library:makers'),
  saveUserManufacturer: (m) => ipcRenderer.invoke('library:saveMaker', m),
  listUserTemplates: () => ipcRenderer.invoke('library:templates'),
  deleteUserTemplate: (k) => ipcRenderer.invoke('library:deleteTemplate', k),
  saveUserTemplate: (t) => ipcRenderer.invoke('library:saveTemplate', t),

  exportSVG: (pages, name) => ipcRenderer.invoke('labels:svg', pages, name),
  exportPDF: (html, name) => ipcRenderer.invoke('labels:pdf', html, name),
  print: (html) => ipcRenderer.invoke('labels:print', html),

  appVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleasePage: (url) => ipcRenderer.invoke('update:openPage', url),
  onUpdateStatus: (cb) => on<UpdateStatus>('update:status', cb),

  fetchSpecPage: (url) => ipcRenderer.invoke('specs:fetch', url),
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  aiSettings: (patch) => ipcRenderer.invoke('ai:settings', patch),
  aiLookup: (req) => ipcRenderer.invoke('ai:lookup', req),

  onMenu: (cb) => on<MenuCommand>('menu', cb),
  onOpenFile: (cb) => on<OpenedFile>('open-file', cb),
}

contextBridge.exposeInMainWorld('rackflow', api)

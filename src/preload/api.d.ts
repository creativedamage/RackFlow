// Contract between the renderer and the Electron main process.
// The renderer only ever talks to `window.rackflow` (exposed by the preload
// script with contextIsolation on); it has no Node access.

import type { PatchBayTemplate, ProductDefinition } from '../core/model'
import type { Manufacturer } from '../core/manufacturers'

export type MenuCommand =
  | 'new' | 'open' | 'save' | 'saveAs' | 'save-and-close' | 'autosave:toggle' | 'quickPrint'
  | 'undo' | 'redo' | 'delete' | 'selectAll' | 'zoomFit'
  | 'mode:diagram' | 'mode:rack' | 'mode:patch' | 'mode:sheet' | 'mode:led'
  | 'newProduct' | 'newTemplate' | 'toggleInspector' | 'toggleSidebar' | 'share' | 'editDevice' | 'findDevice' | 'tidy' | 'exportAll' | 'numbering' | 'units:imperial' | 'units:metric' | 'theme:system' | 'theme:light' | 'theme:dark'

export interface AiStatus { hasKey: boolean; model: string; canEncrypt: boolean }

export interface OpenedFile { path: string; data: string }

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string; notes: string }
  | { state: 'manual'; version: string; notes: string; url: string; reason: string }
  | { state: 'error'; message: string }

export interface RackflowAPI {
  platform: string
  openProject(): Promise<OpenedFile | null>
  saveProject(path: string | null, data: string, suggestedName: string): Promise<string | null>
  setDocumentState(state: { title: string; dirty: boolean; path: string | null }): void
  closeWindow(): void

  listUserProducts(): Promise<ProductDefinition[]>
  saveUserProduct(p: ProductDefinition): Promise<void>
  deleteUserProduct(key: string): Promise<void>
  listUserManufacturers(): Promise<Manufacturer[]>
  saveUserManufacturer(m: Manufacturer): Promise<void>
  listUserTemplates(): Promise<PatchBayTemplate[]>
  saveUserTemplate(t: PatchBayTemplate): Promise<void>
  deleteUserTemplate(key: string): Promise<void>

  /** Writes one SVG per page next to the chosen path. */
  exportSVG(pages: string[], suggestedName: string): Promise<string | null>
  /** `html` is a print document with CSS @page size; rendered 1:1 via printToPDF. */
  exportPDF(html: string, suggestedName: string): Promise<string | null>
  print(html: string): Promise<void>

  appVersion(): Promise<string>
  checkForUpdates(): Promise<UpdateStatus>
  updateStatus(): Promise<UpdateStatus>
  installUpdate(): Promise<void>
  openReleasePage(url?: string): Promise<void>
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void

  /** Find Device: fetch a product page as text. */
  fetchSpecPage(url: string): Promise<{ text: string; title: string; url: string }>
  aiStatus(): Promise<AiStatus>
  aiSettings(patch: { key?: string | null; model?: string }): Promise<void>
  aiLookup(req: { query: string; url?: string; text?: string }): Promise<{ json: unknown; via: string }>

  /** Native Save / Don't Save / Cancel sheet before replacing the open project. */
  /** Writes every export file into a new folder the user picks; returns the folder. */
  /** App-wide saved items (title block templates, numbering standards). */
  storeGet<T = unknown>(name: 'TitleBlocks' | 'NumberingStandards'): Promise<T | null>
  storeSet(name: 'TitleBlocks' | 'NumberingStandards', data: unknown): Promise<void>
  getTheme(): Promise<'system' | 'light' | 'dark'>
  setTheme(t: 'system' | 'light' | 'dark'): Promise<void>
  exportAll(files: { name: string; kind: 'pdf' | 'text'; content: string }[], folderName: string): Promise<string | null>
  askSaveChanges(name: string): Promise<'save' | 'discard' | 'cancel'>

  onMenu(cb: (cmd: MenuCommand) => void): () => void
  onOpenFile(cb: (file: OpenedFile) => void): () => void
}

declare global {
  interface Window { rackflow?: RackflowAPI }
}

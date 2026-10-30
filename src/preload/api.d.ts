// Contract between the renderer and the Electron main process.
// The renderer only ever talks to `window.rackflow` (exposed by the preload
// script with contextIsolation on); it has no Node access.

import type { PatchBayTemplate, ProductDefinition } from '../core/model'
import type { Manufacturer } from '../core/manufacturers'

export type MenuCommand =
  | 'new' | 'open' | 'save' | 'saveAs' | 'save-and-close'
  | 'undo' | 'redo' | 'delete' | 'selectAll' | 'zoomFit'
  | 'mode:diagram' | 'mode:rack' | 'mode:patch' | 'mode:sheet'
  | 'newProduct' | 'newTemplate' | 'toggleInspector' | 'editDevice'

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

  onMenu(cb: (cmd: MenuCommand) => void): () => void
  onOpenFile(cb: (file: OpenedFile) => void): () => void
}

declare global {
  interface Window { rackflow?: RackflowAPI }
}

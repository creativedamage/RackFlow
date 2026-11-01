// Single app store (zustand). The document is an immutable `Project`; every
// edit goes through `apply(label, draft => …)` (Immer), which pushes the
// previous snapshot onto the undo stack. Structural sharing keeps that cheap.

import { create } from 'zustand'
import { produce } from 'immer'
import {
  audit, upgradeBay, nodeGeom, spreadCards, BUILT_IN_MANUFACTURERS, ManufacturerDirectory, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, CURRENT_SCHEMA, newProject, ProductLibrary,
  type CableId, type EquipmentId, type PatchBayId, type PatchBayTemplate, type ProductDefinition, type Project, type RackId,
  type ValidationIssue, type IssueSubject,
} from '@core/index'
import { api } from './platform'

export type Mode = 'diagram' | 'rack' | 'patch' | 'sheet' | 'led'

interface HistoryEntry { project: Project; label: string }

// The last saved (or opened) document. "Unsaved changes" means different from this,
// so adding something and deleting it again doesn't count.
let savedRef: unknown = null
let savedJson = ''
function rememberSaved(p: Project) { savedRef = p; savedJson = JSON.stringify(p) }
/** Updates derived data in the project without an undo step or marking it changed (e.g. logo analysis). */
export function patchQuietly(fn: (p: Project) => Project) {
  const s = useStore.getState()
  const wasClean = !changedSinceSave(s.project)
  const next = fn(s.project)
  if (next === s.project) return
  if (wasClean) rememberSaved(next)
  useStore.setState({ project: next, dirty: changedSinceSave(next) })
}
export function changedSinceSave(p: Project): boolean {
  if (p === savedRef) return false
  return JSON.stringify(p) !== savedJson
}

export interface AppState {
  project: Project
  path: string | null
  dirty: boolean
  past: HistoryEntry[]
  future: HistoryEntry[]

  mode: Mode
  selection: EquipmentId[]
  selectedCable: CableId | null
  selectedRack: RackId | null
  selectedBay: PatchBayId | null
  /** Rack panel (blank, brush, logo…) selected on the Rack page. */
  selectedAccessory: { rack: string; id: string } | null
  /** Wiring diagram page shown (group id); null = all pages. */
  diagramPage: string | null
  exportingAll: boolean
  selectedLedWall: string | null
  ledPicking: boolean
  /** Signal view shown on the diagram (null = normal pages). */
  diagramView: string | null
  /** View being created / edited ('new' or an id). */
  editingView: string | null
  editingNumbers: boolean
  editingNumbering: boolean
  /** Appearance: follow macOS, or force light / dark. */
  theme: 'system' | 'light' | 'dark'
  /** Display units (data is always stored metric). */
  units: 'imperial' | 'metric'
  showInspector: boolean
  issues: ValidationIssue[]
  /** Bumped to ask the diagram to fit view. */
  fitRequest: number

  library: ProductLibrary
  makers: ManufacturerDirectory
  userProducts: ProductDefinition[]
  templates: PatchBayTemplate[]
  editingProduct: ProductDefinition | null
  /** When editing a placed device: its equipment id (enables "this device only"). */
  editingInstance: string | null
  /** Wall plate / floor box builder: product being edited and, if any, the placed device. */
  editingPlate: { product: ProductDefinition; instanceId: string | null } | null
  editingTemplate: PatchBayTemplate | null
  /** When set, the template editor changes this placed bay's layout. */
  editingTemplateBay: string | null
  /** Find Device dialog (search text it opened with). */
  finding: { query: string } | null
  toast: string | null

  apply: (label: string, fn: (draft: Project) => void) => void
  /** Changes the document without a new undo step (folds into the last one). */
  amend: (fn: (draft: Project) => void) => void
  undo: () => void
  redo: () => void
  load: (project: Project, path: string | null) => void
  markSaved: (path: string) => void
  set: (patch: Partial<AppState>) => void
  select: (ids: EquipmentId[], cable?: CableId | null) => void
  focusIssue: (s: IssueSubject) => void
  reloadLibrary: () => Promise<void>
  notify: (msg: string, opts?: NotifyOptions) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
}

export type ToastKind = 'success' | 'info' | 'warning' | 'error'
export interface NotifyOptions { kind?: ToastKind; /** Offer an Undo button (for bulk changes). */ undo?: boolean; ms?: number }
export interface Toast { id: number; msg: string; kind: ToastKind; undo: boolean }
let toastSeq = 0


const MAX_HISTORY = 200

export const useStore = create<AppState>((set, get) => ({
  project: newProject(),
  path: null,
  dirty: false,
  past: [],
  future: [],

  mode: 'diagram',
  selection: [],
  selectedCable: null,
  selectedRack: null,
  selectedBay: null,
  selectedAccessory: null,
  diagramPage: null,
  exportingAll: false,
  selectedLedWall: null,
  ledPicking: false,
  diagramView: null,
  editingView: null,
  editingNumbers: false,
  editingNumbering: false,
  theme: 'system',
  units: 'imperial',
  showInspector: true,
  issues: [],
  fitRequest: 0,

  library: new ProductLibrary(BUILT_IN_PRODUCTS, []),
  makers: new ManufacturerDirectory(BUILT_IN_MANUFACTURERS),
  userProducts: [],
  templates: BUILT_IN_PATCH_TEMPLATES,
  editingProduct: null,
  editingInstance: null,
  editingPlate: null,
  editingTemplate: null,
  editingTemplateBay: null,
  finding: null,
  toast: null,

  apply: (label, fn) => {
    const prev = get().project
    const next = produce(prev, fn)
    if (next === prev) return
    set({ project: next, dirty: changedSinceSave(next), past: [...get().past.slice(-MAX_HISTORY + 1), { project: prev, label }], future: [] })
  },
  amend: (fn) => {
    const prev = get().project
    const next = produce(prev, fn)
    if (next !== prev) set({ project: next, dirty: changedSinceSave(next) })
  },
  undo: () => {
    const { past, project, future } = get()
    const last = past[past.length - 1]
    if (!last) return
    set({ project: last.project, past: past.slice(0, -1), future: [{ project, label: last.label }, ...future], dirty: changedSinceSave(last.project) })
  },
  redo: () => {
    const { past, project, future } = get()
    const next = future[0]
    if (!next) return
    set({ project: next.project, future: future.slice(1), past: [...past, { project, label: next.label }], dirty: changedSinceSave(next.project) })
  },
  load: (project, path) => { rememberSaved(project); set({
    project, path, dirty: false, past: [], future: [], selection: [], selectedCable: null,
    selectedRack: project.racks[0]?.id ?? null, selectedBay: project.patchBays[0]?.id ?? null, fitRequest: get().fitRequest + 1,
  }) },
  markSaved: (path) => { rememberSaved(get().project); set({ path, dirty: false }) },
  set: (patch) => set(patch),
  select: (ids, cable = null) => set({ selection: ids, selectedCable: cable, selectedAccessory: null }),
  focusIssue: (s) => {
    switch (s.kind) {
      case 'equipment': set({ mode: 'diagram', selection: [s.id], selectedCable: null }); break
      case 'cable': set({ mode: 'diagram', selection: [], selectedCable: s.id }); break
      case 'rack': set({ mode: 'rack', selectedRack: s.id }); break
      case 'port': set({ mode: 'diagram', selection: [s.a.equipment], selectedCable: null }); break
      case 'ports': set({ mode: 'diagram', selection: [s.a.equipment, s.b.equipment], selectedCable: null }); break
    }
  },
  reloadLibrary: async () => {
    const [userProducts, userTemplates, userMakers] = await Promise.all([api.listUserProducts(), api.listUserTemplates(), api.listUserManufacturers()])
    set({
      userProducts,
      makers: new ManufacturerDirectory(BUILT_IN_MANUFACTURERS, userMakers, userProducts.map((p) => p.manufacturer)),
      library: new ProductLibrary(BUILT_IN_PRODUCTS, userProducts),
      templates: [...BUILT_IN_PATCH_TEMPLATES, ...userTemplates],
    })
  },
  toasts: [],
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id), toast: null }),
  notify: (msg, opts = {}) => {
    const kind = opts.kind ?? (/^(couldn|can|that file|no |not )/i.test(msg) ? 'warning' : 'success')
    const t: Toast = { id: ++toastSeq, msg, kind, undo: !!opts.undo }
    set({ toast: msg, toasts: [...get().toasts.filter((x) => x.msg !== msg), t].slice(-3) })
    setTimeout(() => get().dismissToast(t.id), opts.ms ?? (opts.undo ? 6000 : 3800))
  },
}))
rememberSaved(useStore.getState().project)


/** Debounced design-rule check (150 ms after the last edit). */
let auditTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return
  clearTimeout(auditTimer)
  auditTimer = setTimeout(() => useStore.setState({ issues: audit(useStore.getState().project) }), 150)
})

// MARK: File operations

export function parseProject(data: string): Project {
  const p = JSON.parse(data) as Project
  if (typeof p !== 'object' || !Array.isArray(p.equipment)) throw new Error('Not a RackFlow project file.')
  if ((p.schemaVersion ?? 0) > CURRENT_SCHEMA) throw new Error('This project was saved by a newer version of RackFlow.')
  // Migrations go here as the schema evolves (v1 → v2 …).
  p.patchBays ??= []
  p.racks ??= []
  p.patchBays.forEach(upgradeBay)
  // 1.8 cards are taller (sections): nudge apart anything that now overlaps.
  if ((p.diagram?.cards ?? 1) < 2) { spreadCards(p, nodeGeom); p.diagram = { ...(p.diagram ?? {}), cards: 2 } }
  return p
}

export async function saveDocument(saveAs = false): Promise<boolean> {
  const { project, path, markSaved, notify } = useStore.getState()
  const target = await api.saveProject(saveAs ? null : path, JSON.stringify(project, null, 2), project.info.name || 'Untitled Project')
  if (!target) return false
  markSaved(target)
  notify(`Saved ${target.split(/[\\/]/).pop()}`)
  return true
}

/**
 * Before replacing the open project: if it has real unsaved changes, ask
 * Save / Don't Save / Cancel. Resolves true when it's OK to continue.
 */
export async function confirmDiscard(): Promise<boolean> {
  const s = useStore.getState()
  if (!s.dirty || !changedSinceSave(s.project)) { if (s.dirty) s.set({ dirty: false }); return true }
  const choice = await api.askSaveChanges(s.project.info.name || 'Untitled Project')
  if (choice === 'cancel') return false
  if (choice === 'save') return saveDocument()
  return true
}

export async function openDocument() {
  if (!(await confirmDiscard())) return
  const file = await api.openProject()
  if (file) loadFile(file.path, file.data)
}

export function loadFile(path: string, data: string) {
  try {
    const p = parseProject(data)
    const name = path.split(/[\\/]/).pop()?.replace(/\.rackflow$/, '')
    if (name && p.info.name === 'Untitled Project') p.info.name = name
    useStore.getState().load(p, path)
  } catch (err) {
    alert(`Couldn’t open ${path}: ${(err as Error).message}`)
  }
}

export async function newDocument() {
  if (!(await confirmDiscard())) return
  useStore.getState().load(newProject(), null)
}

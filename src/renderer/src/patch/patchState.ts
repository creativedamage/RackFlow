import { create } from 'zustand'
import { normalsShown, type CellRange, type PatchBay } from '@core/index'
import { useStore } from '../store'

/** Selection & editing state for the patch label editor (UI only, not saved). */
export interface PatchSel extends CellRange { bay: string }

interface PatchUIState {
  sel: PatchSel | null
  /** Title (span) currently selected, if any. */
  title: string | null
  editing: { bay: string; row: number; channel: number; seed?: string } | { bay: string; title: string } | null
  preview: boolean
  /** Patch Labels page: patch bay strips, or button-cap sheets. */
  tab: 'bays' | 'caps'
  /** Minimum column width in px (0 = fit to window). */
  colw: number
  setSel: (s: PatchSel | null, title?: string | null) => void
  set: (p: Partial<PatchUIState>) => void
}

export const usePatchUI = create<PatchUIState>((set) => ({
  sel: null,
  title: null,
  editing: null,
  preview: false,
  tab: 'bays',
  colw: 0,
  setSel: (sel, title = null) => set({ sel, title }),
  set: (p) => set(p),
}))

/** Apply an undoable edit to one bay. */
export function editBay(bayId: string, label: string, fn: (b: PatchBay) => void) {
  useStore.getState().apply(label, (d) => {
    const b = d.patchBays.find((x) => x.id === bayId)
    if (b) fn(b)
  })
}

/** Edit the bay that holds the current selection. */
export function editSelection(label: string, fn: (b: PatchBay, sel: PatchSel) => void) {
  const sel = usePatchUI.getState().sel
  if (!sel) return
  editBay(sel.bay, label, (b) => fn(b, sel))
}

/** The normalling band a selection row belongs to (row above or below the band). */
export function bandForRow(bay: PatchBay, row: number): number | null {
  if (!normalsShown(bay)) return null
  if (bay.normals.some((n) => n.afterRow === row)) return row
  const idx = bay.template.rows.findIndex((r) => r.id === row)
  const above = idx > 0 ? bay.template.rows[idx - 1].id : null
  return above != null && bay.normals.some((n) => n.afterRow === above) ? above : null
}

export const PALETTE = [
  '#ffffff', '#f8d7da', '#fde2e2', '#ffe8cc', '#fff3bf', '#e6f4d7', '#d3f9d8', '#d0ebff',
  '#dbe4ff', '#e5dbff', '#f3d9fa', '#e9ecef', '#ced4da', '#fa5252', '#fd7e14', '#fab005',
  '#40c057', '#228be6', '#7950f2', '#000000',
]

export const FONTS = ['Helvetica, Arial, sans-serif', 'Arial, sans-serif', 'Arial Narrow, Arial, sans-serif', 'Futura, sans-serif', 'Gill Sans, sans-serif', 'Verdana, sans-serif', 'Menlo, monospace']
export const fontLabel = (f: string) => f.split(',')[0]

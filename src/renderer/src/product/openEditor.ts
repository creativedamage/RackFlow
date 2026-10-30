import type { ProductDefinition } from '@core/index'
import { useStore } from '../store'

/**
 * Opens the right editor for a product: the plate builder for wall plates /
 * floor boxes, the product editor for everything else. With an instance id the
 * editor can also save changes to just that placed device.
 * Patch bays are edited on the Patch Labels page instead.
 */
export function openProductEditor(p: ProductDefinition, instanceId: string | null = null) {
  const s = useStore.getState()
  if (p.category === 'patchBay') {
    s.set({ mode: 'patch' })
    s.notify('Patch bays are edited on the Patch Labels page', { kind: 'info' })
    return
  }
  s.set(p.plate
    ? { editingPlate: { product: structuredClone(p), instanceId }, editingProduct: null, editingInstance: null }
    : { editingProduct: structuredClone(p), editingInstance: instanceId, editingPlate: null })
}

/** Edits a placed device by id (diagram double-click, ⌘E, context menus). */
export function editPlacedDevice(id: string) {
  const eq = useStore.getState().project.equipment.find((e) => e.id === id)
  if (eq) openProductEditor(eq.product, eq.id)
}

/** ⌘E: edit the single selected device. */
export function editSelection() {
  const s = useStore.getState()
  if (s.editingProduct || s.editingPlate) return
  if (s.selection.length === 1) editPlacedDevice(s.selection[0])
  else s.notify(s.selection.length ? 'Select just one device to edit' : 'Select a device to edit — or right-click any product in the library', { kind: 'info' })
}

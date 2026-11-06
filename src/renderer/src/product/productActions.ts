import { BUILT_IN_KEYS, duplicateDevices, nodeGeom, placeInFreeSpace, defaultFabrication, fabricationSheets, sheetsToHTML, sheetSize, type ProductDefinition } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { addProductToDiagram } from '../diagram/placement'
import type { MenuItem } from '../components/ContextMenu'
import { editPlacedDevice, openProductEditor } from './openEditor'

/** Opens the editor on a copy saved under a new key ("Duplicate as custom"). */
export function duplicateProduct(p: ProductDefinition) {
  openProductEditor({ ...structuredClone(p), key: `user.${p.key.split('@')[0]}.${Date.now().toString(36)}`, model: `${p.model} (Custom)`, source: 'user' })
}

/** Reverts an edited built-in, or deletes a custom product. */
export async function removeUserProduct(p: ProductDefinition): Promise<boolean> {
  const edited = BUILT_IN_KEYS.has(p.key)
  const placed = useStore.getState().project.equipment.filter((e) => e.product.key === p.key).length
  const keep = placed ? ` The ${placed} placed ${placed === 1 ? 'copy keeps its' : 'copies keep their'} current specs.` : ''
  if (!confirm(edited ? `Revert “${p.model}” to the built-in version?${keep}` : `Delete “${p.model}” from your library?${keep}`)) return false
  await api.deleteUserProduct(p.key)
  await useStore.getState().reloadLibrary()
  useStore.getState().notify(edited ? `Reverted “${p.model}”` : `Deleted “${p.model}”`)
  return true
}

/** Right-click menu for a product in the library / Makers lists. */
export function productMenu(p: ProductDefinition): MenuItem[] {
  const user = p.source === 'user'
  return [
    { label: 'Add to Wiring Diagram', onClick: () => addProductToDiagram(p) },
    { label: p.category === 'patchBay' ? 'Open Patch Labels' : user ? 'Edit Product…' : 'Edit Product… (saved as your version)', onClick: () => openProductEditor(p) },
    { label: 'Duplicate as Custom…', onClick: () => duplicateProduct(p), disabled: p.category === 'patchBay' },
    ...(user ? ['sep' as const, { label: BUILT_IN_KEYS.has(p.key) ? 'Revert to Built-in' : 'Delete Product…', danger: true, onClick: () => void removeUserProduct(p) }] : []),
  ]
}

/** Right-click menu for a placed device (diagram, rack). */
export function deviceMenu(id: string): MenuItem[] {
  const s = useStore.getState()
  const eq = s.project.equipment.find((e) => e.id === id)
  if (!eq) return []
  const lib = s.library.get(eq.product.key.split('@')[0])
  return [
    { label: eq.product.category === 'patchBay' ? 'Change Panel Layout…' : 'Edit Device…', hint: '⌘E', onClick: () => editPlacedDevice(id) },
    ...(lib ? [{ label: 'Edit Library Product…', onClick: () => openProductEditor(lib) }] : []),
    { label: s.selection.length > 1 && s.selection.includes(id as never) ? `Duplicate ${s.selection.length} Devices` : 'Duplicate', onClick: () => duplicatePlaced(id) },
    { label: 'Duplicate as Custom Product…', onClick: () => duplicateProduct(eq.product), disabled: eq.product.category === 'patchBay' },
    ...(eq.product.plate ? [{ label: 'Print Fabrication Drawing…', onClick: () => {
      const st = useStore.getState(), sel = st.selection.filter((x) => st.project.equipment.find((e) => e.id === x)?.product.plate).map(String)
      const o = { ...defaultFabrication(), only: sel.includes(String(id)) ? sel : [String(id)] }
      void api.print(sheetsToHTML(fabricationSheets(st.project, o), sheetSize(o)))
    } }] : []),
  ]
}

/** Duplicates a placed device (or the selection it belongs to) onto the wiring diagram, next to the original. */
export function duplicatePlaced(id: string) {
  const s = useStore.getState()
  const ids = s.selection.includes(id as never) ? s.selection.map(String) : [id]
  // On the diagram the copies follow the pointer – click where they should go.
  if (s.mode === 'diagram' && !s.diagramView) { s.set({ placing: { ids } }); return }
  let made: string[] = [], tags: string[] = []
  s.apply(ids.length > 1 ? `Duplicate ${ids.length} Devices` : 'Duplicate Device', (d) => {
    const copies = duplicateDevices(d, ids)
    // Out of anyone's way when not in a signal view (views keep their own layout).
    if (copies.length === 1 && !s.diagramView) placeInFreeSpace(d, copies[0].id, nodeGeom)
    made = copies.map((c) => c.id); tags = copies.map((c) => c.tag)
  })
  if (made.length) {
    useStore.getState().select(made as never)
    s.notify(`Duplicated as ${tags.join(', ')}`, { undo: true, kind: 'success' })
  }
}

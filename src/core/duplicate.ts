// Duplicating placed devices: a copy of each with a new tag, next to the original,
// on the same page, in the same views and room – unwired, with no IP addresses
// and not in a rack slot. Patch bays bring their layout, format and normals.

import { newId, type EquipmentId, type EquipmentInstance, type PatchBay, type Project } from './model'
import { nextTag } from './project'
import { isBox, numberBoxPorts, boxNumberingOf } from './boxports'
import { viewsOf } from './views'

// Plain data copy (works on Immer drafts, which structuredClone can't copy).
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function duplicateDevices(p: Project, ids: string[], offset = { x: 60, y: 60 }): EquipmentInstance[] {
  const made: EquipmentInstance[] = []
  for (const id of ids) {
    const src = p.equipment.find((e) => e.id === id)
    if (!src) continue
    const copy: EquipmentInstance = {
      ...clone(src),
      id: newId<EquipmentId>(), tag: nextTag(p, src.product.category),
      position: { x: src.position.x + offset.x, y: src.position.y + offset.y },
      rackPlacement: null,
    }
    delete copy.portNumbers
    // Same VLAN / mode settings, but no IP or manual switch port (those belong to the original).
    if (copy.network) for (const k of Object.keys(copy.network)) { const n = copy.network[k]; delete n.ip; delete n.switchTag; delete n.switchPort; if (!Object.keys(n).length) delete copy.network[k] }
    p.equipment.push(copy)
    // Patch bay: its own label sheet, same layout, blank labels.
    const bay = p.patchBays.find((b) => b.equipment === src.id)
    if (bay) {
      const nb: PatchBay = { ...clone(bay), id: newId(), name: copy.tag, equipment: copy.id, cells: bay.cells.map((c) => ({ ...c, text: '', manual: false, fill: null })), spans: bay.spans.filter((s) => !s.auto) }
      p.patchBays.splice(p.patchBays.indexOf(bay) + 1, 0, nb)
    }
    // In every view the original is in (placed beside it there too).
    for (const v of viewsOf(p)) {
      if (v.include.includes(src.id)) v.include.push(copy.id)
      const at = v.positions[src.id]
      if (at) v.positions[copy.id] = { x: at.x + offset.x, y: at.y + offset.y }
    }
    if (isBox(copy) && boxNumberingOf(p).on) numberBoxPorts(p, { ids: [copy.id] })
    made.push(copy)
  }
  return made
}

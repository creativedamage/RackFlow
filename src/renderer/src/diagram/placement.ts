import { addEquipment, type EquipmentId, type ProductDefinition } from '@core/index'
import { useStore } from '../store'

const GRID = 20
/** Returns the flow-space centre of the visible diagram; set by DiagramView while it is mounted. */
let viewCenter: (() => { x: number; y: number }) | null = null
export const setViewCenterProvider = (fn: typeof viewCenter) => { viewCenter = fn }

let lastAt = { x: NaN, y: NaN }, cascade = 0

/** Adds a product to the wiring diagram without dragging: centred in the current
 *  view (cascading so repeated clicks don't stack), or beside existing gear. */
export function addProductToDiagram(product: ProductDefinition): EquipmentId | undefined {
  const s = useStore.getState()
  let base = viewCenter?.()
  if (!base) {
    const xs = s.project.equipment.map((e) => e.position)
    base = xs.length ? { x: Math.max(...xs.map((p) => p.x)) + 320, y: Math.min(...xs.map((p) => p.y)) } : { x: 0, y: 0 }
  }
  const snapped = { x: Math.round(base.x / GRID) * GRID - 100, y: Math.round(base.y / GRID) * GRID - 60 }
  cascade = snapped.x === lastAt.x && snapped.y === lastAt.y ? cascade + 1 : 0
  lastAt = snapped
  const at = { x: snapped.x + cascade * 40, y: snapped.y + cascade * 40 }
  let id: EquipmentId | undefined, tag = ''
  s.apply(`Add ${product.model}`, (d) => { const e = addEquipment(d, product, at); id = e.id; tag = e.tag })
  if (id) {
    s.select([id])
    s.notify(s.mode === 'diagram' ? `Added ${tag}` : `Added ${tag} to the Wiring Diagram`, { undo: true })
  }
  return id
}

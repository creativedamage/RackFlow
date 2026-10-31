// Geometry of a device card on the wiring diagram, shared by the on-screen
// diagram, auto layout and printed schematics so they line up exactly.

import type { EquipmentInstance } from './model'
import type { NodeGeom } from './autolayout'
import { plateAspect } from './platelayout'

export const NODE_WIDTH = 240
export const HEADER_H = 40
export const ROW_H = 18

export const SMALL_W = 170
export const SMALL_HEAD = 24
const PREVIEW_W = NODE_WIDTH - 20

/** Height of the plate / box / panel drawing shown on the card (0 when the device has none). */
export function previewHeight(eq: EquipmentInstance): number {
  const plate = eq.product.plate
  if (!plate) return 0
  const size = eq.nodeSize ?? 'medium'
  const asp = plateAspect(plate)
  if (size === 'small') return Math.round(Math.max(24, Math.min(130, (SMALL_W - 12) * asp)))
  return Math.round(Math.max(22, Math.min(size === 'full' ? 260 : 84, PREVIEW_W * asp))) + 8
}

/** Header height: taller when the device shows its room / location, and its plate drawing. */
export const headerHeight = (eq: EquipmentInstance) => (eq.room?.trim() ? HEADER_H + 14 : HEADER_H) + ((eq.nodeSize ?? 'medium') === 'small' ? 0 : previewHeight(eq))

/** Small cards: tag + drawing only; ports spread down the edges. */
function smallGeom(eq: EquipmentInstance): NodeGeom {
  const { left, right } = splitPorts(eq)
  const body = Math.max(previewHeight(eq) || 30, Math.max(left.length, right.length) * 7)
  const li = new Map(left.map((p, i) => [p.id, i])), ri = new Map(right.map((p, i) => [p.id, i]))
  const at = (i: number, n: number) => SMALL_HEAD + ((i + 0.5) * body) / Math.max(1, n)
  return {
    width: SMALL_W,
    height: SMALL_HEAD + body + 6,
    port: (id) => {
      const l = li.get(id)
      if (l != null) return { x: 0, y: at(l, left.length), side: 'left' }
      const r = ri.get(id)
      return r != null ? { x: SMALL_W, y: at(r, right.length), side: 'right' } : null
    },
  }
}

export function splitPorts(eq: EquipmentInstance) {
  // Wall plates / floor boxes: room-side jacks on the left, tie lines and outlets on the right.
  if (eq.product.category === 'wallBox' || eq.product.category === 'wallPlate' || eq.product.category === 'floorBox' || eq.product.category === 'connectorPanel' || (eq.product.category === 'patchBay' && eq.product.ports.some((p) => p.face === 'front'))) {
    const left = eq.product.ports.filter((p) => p.face === 'front' && p.group !== 'Power')
    return { left, right: eq.product.ports.filter((p) => !left.includes(p)) }
  }
  const left = eq.product.ports.filter((p) => p.direction === 'input')
  const right = eq.product.ports.filter((p) => p.direction !== 'input')
  return { left, right }
}

/** Exact card geometry (ports at the card edges). */
export function nodeGeom(eq: EquipmentInstance): NodeGeom {
  if (eq.nodeSize === 'small') return smallGeom(eq)
  const { left, right } = splitPorts(eq)
  const h = headerHeight(eq)
  const li = new Map(left.map((p, i) => [p.id, i])), ri = new Map(right.map((p, i) => [p.id, i]))
  return {
    width: NODE_WIDTH,
    height: h + Math.max(left.length, right.length, 1) * ROW_H + 8,
    port: (id) => {
      const l = li.get(id)
      if (l != null) return { x: 0, y: h + l * ROW_H + ROW_H / 2, side: 'left' }
      const r = ri.get(id)
      return r != null ? { x: NODE_WIDTH, y: h + r * ROW_H + ROW_H / 2, side: 'right' } : null
    },
  }
}

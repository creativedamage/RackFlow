// Geometry of a device card on the wiring diagram, shared by the on-screen
// diagram, auto layout and printed schematics so they line up exactly.

import type { EquipmentInstance } from './model'
import type { NodeGeom } from './autolayout'

export const NODE_WIDTH = 240
export const HEADER_H = 40
export const ROW_H = 18

/** Header height: taller when the device shows its room / location. */
export const headerHeight = (eq: EquipmentInstance) => (eq.room?.trim() ? HEADER_H + 14 : HEADER_H)

export function splitPorts(eq: EquipmentInstance) {
  // Wall plates / floor boxes: room-side jacks on the left, tie lines and outlets on the right.
  if (eq.product.category === 'wallPlate' || eq.product.category === 'floorBox' || (eq.product.category === 'patchBay' && eq.product.ports.some((p) => p.face === 'front'))) {
    const left = eq.product.ports.filter((p) => p.face === 'front' && p.group !== 'Power')
    return { left, right: eq.product.ports.filter((p) => !left.includes(p)) }
  }
  const left = eq.product.ports.filter((p) => p.direction === 'input')
  const right = eq.product.ports.filter((p) => p.direction !== 'input')
  return { left, right }
}

/** Exact card geometry (ports at the card edges). */
export function nodeGeom(eq: EquipmentInstance): NodeGeom {
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

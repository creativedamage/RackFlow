// Geometry of a device card on the wiring diagram, shared by the on-screen
// diagram, auto layout and printed schematics so they line up exactly.

import type { EquipmentInstance, PortTemplate } from './model'
import { DOMAINS, SIGNALS, type SignalDomain } from './signals'

const portDomain = (p: PortTemplate): SignalDomain | null => (p.signals[0] ? SIGNALS[p.signals[0]]?.domain ?? null : null)
import type { NodeGeom } from './autolayout'
import { productFace } from './platelayout'

export const NODE_WIDTH = 260
/** Header: type chip, tag, maker · model. */
export const HEADER_H = 66
export const ROW_H = 24
/** The "I/O · Hide" bar under the header. */
export const IO_H = 22
/** Port section: header bar, padding below the rows, gap between sections, inset from the card edge. */
export const SEC_HEAD = 22
export const SEC_PAD = 5
export const SEC_GAP = 6
export const SEC_INSET = 8

export const SMALL_W = 170
export const SMALL_HEAD = 24
const PREVIEW_W = NODE_WIDTH - 24

/** Height of the plate / box / panel drawing shown on the card (0 when the device has none). */
export function previewHeight(eq: EquipmentInstance): number {
  if (eq.noFace) return 0
  const face = productFace(eq.product)
  if (!face) return 0
  const size = eq.nodeSize ?? 'medium'
  const asp = face.h / face.w
  if (size === 'small') return Math.round(Math.max(24, Math.min(130, (SMALL_W - 12) * asp)))
  return Math.round(Math.max(22, Math.min(size === 'full' ? 260 : 84, PREVIEW_W * asp))) + 8
}

/** Header height: taller when the device shows its room / location, and its plate drawing. */
/** Printed blocks (noFace) have a compact two-line header: maker, model (+ room). */
export const headerHeight = (eq: EquipmentInstance) => eq.noFace ? (eq.room?.trim() ? 44 : 32) : (eq.room?.trim() ? HEADER_H + 14 : HEADER_H) + ((eq.nodeSize ?? 'medium') === 'small' ? 0 : previewHeight(eq))

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
  if (eq.product.category === 'wallBox' || eq.product.category === 'wallPlate' || eq.product.category === 'floorBox' || eq.product.category === 'connectorPanel' || eq.product.category === 'fiberEnclosure' || (eq.product.category === 'patchBay' && eq.product.ports.some((p) => p.face === 'front'))) {
    const left = eq.product.ports.filter((p) => p.face === 'front' && p.group !== 'Power')
    return { left, right: eq.product.ports.filter((p) => !left.includes(p)) }
  }
  const left = eq.product.ports.filter((p) => p.direction === 'input')
  const right = eq.product.ports.filter((p) => p.direction !== 'input')
  return { left, right }
}

export interface CardRow { left?: PortTemplate; right?: PortTemplate; li: number; ri: number; y: number }
export interface CardSection { key: string; name: string; domain: SignalDomain | null; y: number; h: number; collapsed: boolean; rows: CardRow[]; ports: PortTemplate[]; /** Front | Rear column headings (panels, boxes, fiber, patch bays). */ faces: boolean }

/** Height of the Front | Rear heading row. */
export const FACE_H = 14

/** Devices whose card columns are the panel's front and rear rather than in / out. */
export const isFaceSplit = (eq: EquipmentInstance) => ['wallBox', 'wallPlate', 'floorBox', 'connectorPanel', 'fiberEnclosure'].includes(eq.product.category) || (eq.product.category === 'patchBay' && eq.product.ports.some((p) => p.face === 'front'))
export interface CardLayout {
  width: number
  height: number
  /** Top of the I/O bar (= bottom of the header incl. drawing). */
  ioY: number
  sections: CardSection[]
  /** Port centre y (card coordinates) and side. */
  ports: Map<string, { y: number; side: 'left' | 'right' }>
  /** Each side's ports in the order they appear on the card (for cascading). */
  order: { left: PortTemplate[]; right: PortTemplate[] }
}

/** Section name for a port: its group, else its signal type. */
/** "Analog In" and "Analog Out" share the "Analog" section; plain "Inputs" / "Outputs" fall back to the signal type. */
export function sectionOf(p: PortTemplate): string {
  const g = (p.group ?? '').trim().replace(/[\s\-–·]*\b(ins?|outs?|inputs?|outputs?|i\/o)$/i, '').trim()
  return g || (portDomain(p) ? DOMAINS[portDomain(p)!].name : 'Other')
}

const layoutCache = new WeakMap<EquipmentInstance, CardLayout>()

/**
 * The full card: header, I/O bar, then one boxed section per port group
 * (Analog, Network…) with inputs on the left, outputs on the right, paired row
 * by row. Folded sections keep their ports at the section bar.
 */
export function cardLayout(eq: EquipmentInstance): CardLayout {
  const hit = layoutCache.get(eq)
  if (hit) return hit
  const { left, right } = splitPorts(eq)
  const side = new Map<string, 'left' | 'right'>([...left.map((p) => [p.id, 'left'] as const), ...right.map((p) => [p.id, 'right'] as const)])
  const keys: string[] = []
  const by = new Map<string, { left: PortTemplate[]; right: PortTemplate[] }>()
  for (const p of eq.product.ports) {
    const sd = side.get(p.id)
    if (!sd) continue
    const k = sectionOf(p)
    if (!by.has(k)) { by.set(k, { left: [], right: [] }); keys.push(k) }
    by.get(k)![sd].push(p)
  }
  // One-sided sections of the same signal type pair up (patch bay "Top" inputs
  // with "Bottom" outputs) so the card reads as in ← → out, row by row.
  const dom = (k: string) => { const g = by.get(k)!; return [...g.left, ...g.right].map(portDomain).find(Boolean) ?? null }
  for (let i = 0; i < keys.length; i++) {
    const a = by.get(keys[i])!
    if (a.right.length || !a.left.length) continue
    const j = keys.findIndex((k, jj) => jj !== i && !by.get(k)!.left.length && by.get(k)!.right.length > 0 && dom(k) === dom(keys[i]))
    if (j < 0) continue
    const name = `${keys[i]} / ${keys[j]}`
    by.set(name, { left: a.left, right: by.get(keys[j])!.right })
    by.delete(keys[i]); by.delete(keys[j])
    const kj = keys[j]
    keys[i] = name
    keys.splice(keys.indexOf(kj), 1)
  }
  const faceSplit = isFaceSplit(eq)
  const ioY = headerHeight(eq)
  const ports = new Map<string, { y: number; side: 'left' | 'right' }>()
  const sections: CardSection[] = []
  const order = { left: [] as PortTemplate[], right: [] as PortTemplate[] }
  // Printed blocks have no I/O bar.
  const ioH = eq.noFace ? 0 : IO_H
  let y = ioY + ioH
  const folded = new Set(eq.collapsed ?? [])
  for (const k of keys) {
    const g = by.get(k)!
    order.left.push(...g.left); order.right.push(...g.right)
    const all = [...g.left, ...g.right]
    const d = all.map(portDomain).find(Boolean) ?? null
    const collapsed = !!eq.ioHidden || folded.has(k)
    const n = Math.max(g.left.length, g.right.length)
    const rows: CardRow[] = []
    const faces = faceSplit && g.left.length > 0 && g.right.length > 0
    const top = SEC_HEAD + (faces ? FACE_H : 0)
    for (let i = 0; i < n; i++) rows.push({ left: g.left[i], right: g.right[i], li: i, ri: i, y: y + top + i * ROW_H + ROW_H / 2 })
    const h = collapsed ? SEC_HEAD : top + n * ROW_H + SEC_PAD
    if (eq.ioHidden) {
      for (const p of all) ports.set(p.id, { y: ioY + ioH / 2, side: side.get(p.id)! })
      sections.push({ key: k, name: k, domain: d, y, h: 0, collapsed: true, rows, ports: all, faces })
      continue
    }
    for (const r of rows) {
      if (r.left) ports.set(r.left.id, { y: collapsed ? y + SEC_HEAD / 2 : r.y, side: 'left' })
      if (r.right) ports.set(r.right.id, { y: collapsed ? y + SEC_HEAD / 2 : r.y, side: 'right' })
    }
    sections.push({ key: k, name: k, domain: d, y, h, collapsed, rows, ports: all, faces })
    y += h + SEC_GAP
  }
  const height = eq.ioHidden || !keys.length ? ioY + ioH + 6 : y - SEC_GAP + 8
  const out: CardLayout = { width: NODE_WIDTH, height, ioY, sections, ports, order }
  // Only cache settled (frozen) project state – drafts can still change.
  if (Object.isFrozen(eq)) layoutCache.set(eq, out)
  return out
}

/** Exact card geometry (ports at the card edges). */
export function nodeGeom(eq: EquipmentInstance): NodeGeom {
  if (eq.nodeSize === 'small') return smallGeom(eq)
  const L = cardLayout(eq)
  return {
    width: NODE_WIDTH,
    height: L.height,
    port: (id) => {
      const q = L.ports.get(id)
      return q ? { x: q.side === 'left' ? 0 : NODE_WIDTH, y: q.y, side: q.side } : null
    },
  }
}

/** The ports on the same side of the card as `portId`, in card order (for cascading). */
export function cardSide(eq: EquipmentInstance, portId: string): PortTemplate[] {
  const L = cardLayout(eq)
  return L.order.left.some((p) => p.id === portId) ? L.order.left : L.order.right
}

/** On front / rear cards, a port's name inside its section: without the section name in front ("Slot 1 LC 3" → "LC 3") or "(rear)" – the heading already says so. */
export function cardPortLabel(label: string, section: string, faces: boolean): string {
  let t = label
  if (faces && section && t.toLowerCase().startsWith(section.toLowerCase() + ' ') && t.length > section.length + 1) t = t.slice(section.length + 1)
  if (faces) t = t.replace(/\s*\(rear\)$/i, '').replace(/\s*\(trunk\)$/i, ' trunk')
  return t
}

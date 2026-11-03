// Wiring-diagram auto layout ("Tidy Up") and wire channel planning.
//
// Layout is a layered (Sugiyama-style) signal-flow arrangement: sources on the
// left, destinations on the right, one column per stage. Groups stay together
// as one block. Rows inside each column are ordered to minimise crossings and
// nudged to line up with what they connect to, so most wires run straight.
// Network and power cables don't set the flow (switches and PDUs connect to
// everything); devices that only have those go in a utility row underneath.
//
// Channel planning gives every left-to-right wire its own vertical track in
// the gap it turns in, ordered so wires sharing a gap don't cross each other.

import type { CanvasPoint, EquipmentId, EquipmentInstance, Project } from './model'
import { portDomain, resolve } from './project'

export interface NodeGeom {
  width: number
  height: number
  /** Port centre relative to the node's top-left. */
  port(portId: string): { x: number; y: number; side: 'left' | 'right' } | null
}

export interface LayoutOptions {
  /** Keep each group's devices together as one block (default true). */
  keepGroups?: boolean
  /** Only move these devices (default: all). */
  only?: ReadonlySet<string>
  /** Top-left of the layout (default: top-left of the current drawing). */
  origin?: CanvasPoint
  grid?: number
}

interface Unit {
  id: string
  members: EquipmentInstance[]
  /** Member offsets inside the unit. */
  offsets: Map<string, CanvasPoint>
  width: number
  height: number
  layer: number
  order: number
  y: number
  x: number
  utility: boolean
}

const COL_GAP = 180       // minimum gap between columns
/** Wire tracks: distance from a device before the first track, and between parallel tracks. */
export const WIRE_TRACK_GAP = 26
export const WIRE_TRACK_SPACING = 12
const TRACK = 12          // extra gap per wire turning in a column gap
const ROW_GAP = 48        // vertical gap between blocks in a column
const MEMBER_GAP = 28     // gap between devices inside a group block
const GROUP_PAD = 22, GROUP_LABEL = 26 // matches the diagram's group frame

const flowDomains = new Set(['video', 'audio', 'control', 'lighting', 'rf', 'usb'])

/** Which way signal flows along a cable: from → to, or reversed. Null for network/power. */
function flowOf(p: Project, c: Project['cables'][number]): [EquipmentId, EquipmentId, string, string] | null {
  const a = resolve(p, c.from), b = resolve(p, c.to)
  if (!a || !b || a.equipment.id === b.equipment.id) return null
  const d = portDomain(a.port) ?? portDomain(b.port)
  if (!d || !flowDomains.has(d)) return null
  if (a.port.direction === 'input' && b.port.direction !== 'input') return [b.equipment.id, a.equipment.id, c.to.port, c.from.port]
  return [a.equipment.id, b.equipment.id, c.from.port, c.to.port]
}

/** New positions for the devices (only moved ones are returned). */
export function autoLayout(p: Project, geom: (eq: EquipmentInstance) => NodeGeom, opts: LayoutOptions = {}): Map<EquipmentId, CanvasPoint> {
  const keepGroups = opts.keepGroups ?? true
  const grid = opts.grid ?? 8
  const movable = p.equipment.filter((e) => !opts.only || opts.only.has(e.id))
  if (!movable.length) return new Map()
  const geo = new Map<string, NodeGeom>(movable.map((e) => [e.id, geom(e)]))

  // 1. Units: one per group (if kept together) or per device.
  const unitOf = new Map<string, Unit>()
  const units: Unit[] = []
  const mk = (id: string, members: EquipmentInstance[]): Unit => {
    const u: Unit = { id, members, offsets: new Map(), width: 0, height: 0, layer: 0, order: 0, y: 0, x: 0, utility: false }
    units.push(u)
    for (const m of members) unitOf.set(m.id, u)
    return u
  }
  const byGroup = new Map<string, EquipmentInstance[]>()
  for (const e of movable) {
    if (keepGroups && e.groupId) byGroup.set(e.groupId, [...(byGroup.get(e.groupId) ?? []), e])
    else mk(e.id, [e])
  }
  for (const [g, ms] of byGroup) mk(`group:${g}`, ms)

  // 2. Flow edges between units.
  const flows = p.cables.map((c) => flowOf(p, c)).filter((x): x is NonNullable<typeof x> => !!x)
  const out = new Map<Unit, Set<Unit>>(), inn = new Map<Unit, Set<Unit>>()
  for (const u of units) { out.set(u, new Set()); inn.set(u, new Set()) }
  const linked = new Set<Unit>()
  for (const [a, b] of flows) {
    const ua = unitOf.get(a), ub = unitOf.get(b)
    if (ua) linked.add(ua)
    if (ub) linked.add(ub)
    if (!ua || !ub || ua === ub) continue
    out.get(ua)!.add(ub); inn.get(ub)!.add(ua)
  }
  // Break cycles (feedback loops, tie lines both ways): drop DFS back edges.
  const state = new Map<Unit, 0 | 1 | 2>()
  const visit = (u: Unit) => {
    state.set(u, 1)
    for (const v of [...out.get(u)!]) {
      const s = state.get(v) ?? 0
      if (s === 1) { out.get(u)!.delete(v); inn.get(v)!.delete(u) } else if (s === 0) visit(v)
    }
    state.set(u, 2)
  }
  const startOrder = [...units].sort((a, b) => inn.get(a)!.size - inn.get(b)!.size || minX(a) - minX(b))
  for (const u of startOrder) if (!state.get(u)) visit(u)

  // 3. Layers: longest path from the sources.
  const layerOf = (u: Unit, seen = new Set<Unit>()): number => {
    if (seen.has(u)) return u.layer
    seen.add(u)
    let l = 0
    for (const v of inn.get(u)!) l = Math.max(l, layerOf(v, seen) + 1)
    u.layer = l
    return l
  }
  for (const u of units) layerOf(u)
  // Pull pure sinks of a single source next to it is already the case; push sources right
  // toward their first consumer so a lone source doesn't sit columns away from it.
  for (const u of units) {
    if (inn.get(u)!.size === 0 && out.get(u)!.size > 0) u.layer = Math.max(0, Math.min(...[...out.get(u)!].map((v) => v.layer)) - 1)
  }
  for (const u of units) u.utility = !linked.has(u)

  // 4. Unit sizes (group blocks stack members vertically by flow then current position).
  for (const u of units) {
    const ms = [...u.members].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    let y = u.members.length > 1 || u.id.startsWith('group:') ? GROUP_PAD + GROUP_LABEL : 0
    const padX = u.id.startsWith('group:') ? GROUP_PAD : 0
    let w = 0
    for (const m of ms) {
      const g = geo.get(m.id)!
      u.offsets.set(m.id, { x: padX, y })
      y += g.height + MEMBER_GAP
      w = Math.max(w, g.width)
    }
    u.width = w + padX * 2
    u.height = y - MEMBER_GAP + (u.id.startsWith('group:') ? GROUP_PAD : 0)
  }

  const origin = opts.origin ?? { x: Math.min(...movable.map((e) => e.position.x)), y: Math.min(...movable.map((e) => e.position.y)) }
  const flowUnits = units.filter((u) => !u.utility)
  // Separate signal chains are laid out one under another, biggest first.
  const compOf = new Map<Unit, number>()
  let nComp = 0
  for (const u of flowUnits) {
    if (compOf.has(u)) continue
    const stack = [u]; compOf.set(u, nComp)
    while (stack.length) {
      const v = stack.pop()!
      for (const w of [...out.get(v)!, ...inn.get(v)!]) if (!compOf.has(w)) { compOf.set(w, nComp); stack.push(w) }
    }
    nComp++
  }
  const comps = Array.from({ length: nComp }, (_, i) => flowUnits.filter((u) => compOf.get(u) === i))
    .sort((a, b) => b.length - a.length || Math.min(...a.map(minY)) - Math.min(...b.map(minY)))
  const layoutComponent = (cu: Unit[], top: number): number => {
    // 5. Order inside layers: barycentre sweeps on port positions.
    const layers: Unit[][] = []
    const base = Math.min(...cu.map((u) => u.layer))
    for (const u of cu) { u.layer -= base; (layers[u.layer] ??= []).push(u) }
    for (let i = 0; i < layers.length; i++) layers[i] = (layers[i] ?? []).sort((a, b) => minY(a) - minY(b))
    layers.forEach((l) => l.forEach((u, i) => { u.order = i }))
    // Port-level weights: where along a unit a wire attaches (0..1).
    const attach = (unit: Unit, eqId: string, portId: string) => {
      const g = geo.get(eqId), off = unit.offsets.get(eqId)
      const pt = g?.port(portId)
      return pt && off ? (off.y + pt.y) / Math.max(1, unit.height) : 0.5
    }
    const neighbours = (u: Unit, dir: 'in' | 'out') => {
      const res: number[] = []
      for (const [a, b, pa, pb] of flows) {
        const ua = unitOf.get(a), ub = unitOf.get(b)
        if (!ua || !ub || ua === ub || ua.utility || ub.utility) continue
        if (dir === 'in' && ub === u) res.push(ua.order + attach(ua, a, pa) - attach(ub, b, pb) * 0.5)
        if (dir === 'out' && ua === u) res.push(ub.order + attach(ub, b, pb) - attach(ua, a, pa) * 0.5)
      }
      return res
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    for (let iter = 0; iter < 10; iter++) {
      const down = iter % 2 === 0
      const seq = down ? layers.map((_, i) => i) : layers.map((_, i) => layers.length - 1 - i)
      for (const li of seq) {
        const l = layers[li]
        if (!l || l.length < 2) continue
        const key = new Map(l.map((u) => {
          const ns = neighbours(u, down ? 'in' : 'out')
          const alt = ns.length ? ns : neighbours(u, down ? 'out' : 'in')
          return [u, alt.length ? avg(alt) : u.order] as const
        }))
        l.sort((a, b) => key.get(a)! - key.get(b)! || a.order - b.order)
        l.forEach((u, i) => { u.order = i })
      }
    }

    // 6. Coordinates. Column gaps grow with the number of wires turning in them.
    const turning = new Array(layers.length).fill(0)
    for (const [a, b] of flows) {
      const ua = unitOf.get(a), ub = unitOf.get(b)
      if (ua && ub && cu.includes(ua) && cu.includes(ub) && ua.layer < ub.layer) turning[ua.layer]++
    }
    let x = origin.x
    layers.forEach((l, i) => {
      const w = Math.max(0, ...(l ?? []).map((u) => u.width))
      for (const u of l ?? []) u.x = x + (u.id.startsWith('group:') ? 0 : (w - u.width) / 2 * 0)
      x += w + COL_GAP + Math.min(60, turning[i]) * TRACK
    })
    // Rows: stack each column, pulling each block toward the average height of what feeds it.
    const portAbsY = (u: Unit, eqId: string, portId: string) => u.y + (u.offsets.get(eqId)?.y ?? 0) + (geo.get(eqId)?.port(portId)?.y ?? 0)
    for (let pass = 0; pass < 3; pass++) {
      layers.forEach((l, li) => {
        let cursor = top
        for (const u of l ?? []) {
          const wants: number[] = []
          for (const [a, b, pa, pb] of flows) {
            const ua = unitOf.get(a), ub = unitOf.get(b)
            if (!ua || !ub || ua === ub || ua.utility || ub.utility) continue
            // First pass: align to the left neighbour; later passes also to the right.
            if (ub === u && ua.layer < li) wants.push(portAbsY(ua, a, pa) - (u.offsets.get(b)?.y ?? 0) - (geo.get(b)?.port(pb)?.y ?? 0))
            if (pass > 0 && ua === u && ub.layer > li) wants.push(portAbsY(ub, b, pb) - (u.offsets.get(a)?.y ?? 0) - (geo.get(a)?.port(pa)?.y ?? 0))
          }
          const want = wants.length ? median(wants) : cursor
          u.y = Math.max(cursor, want)
          cursor = u.y + u.height + ROW_GAP
        }
      })
    }
    return Math.max(top, ...cu.map((u) => u.y + u.height))
  }
  let top = origin.y
  for (const cu of comps) top = layoutComponent(cu, top) + 140

  // Utility row underneath (network switches, PDUs, unconnected gear), sorted by kind.
  const bottom = top
  let ux = origin.x
  for (const u of units.filter((v) => v.utility).sort((a, b) => cat(a).localeCompare(cat(b)) || minX(a) - minX(b))) {
    u.x = ux; u.y = bottom
    ux += u.width + 80
  }

  const snap = (v: number) => Math.round(v / grid) * grid
  const res = new Map<EquipmentId, CanvasPoint>()
  for (const u of units) for (const m of u.members) {
    const o = u.offsets.get(m.id)!
    res.set(m.id, { x: snap(u.x + o.x), y: snap(u.y + o.y) })
  }
  return res
}

const minX = (u: Unit) => Math.min(...u.members.map((m) => m.position.x))
const minY = (u: Unit) => Math.min(...u.members.map((m) => m.position.y))
const cat = (u: Unit) => u.members[0]?.product.category ?? ''
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }

// MARK: Channels

export interface ChannelWire { id: string; sx: number; sy: number; tx: number; ty: number; /** Right edge of the source device. */ sourceRight: number }

/**
 * A vertical track (x) for each left-to-right wire. Every wire turning in the
 * same gap gets its own track, ordered so the bundle crosses itself as little
 * as possible: a wire never runs across another's turn when an order exists
 * that avoids it (down-going wires that start lower sit further left, etc.).
 * Tracks are squeezed (down to 5 px apart) to fit a narrow gap.
 */
export function planChannels(wires: ChannelWire[], gap = WIRE_TRACK_GAP, spacing = WIRE_TRACK_SPACING): Map<string, number> {
  const res = new Map<string, number>()
  const buckets = new Map<number, ChannelWire[]>()
  for (const w of wires) {
    if (w.tx - w.sx < gap * 2 || Math.abs(w.ty - w.sy) < 1) continue
    const k = Math.round((w.sourceRight + gap) / 24)
    buckets.set(k, [...(buckets.get(k) ?? []), w])
  }
  // Crossings if a sits left of b: a horizontal reaching past the other wire's track inside its vertical run.
  const inside = (v: number, w: ChannelWire) => v > Math.min(w.sy, w.ty) + 0.5 && v < Math.max(w.sy, w.ty) - 0.5
  const cross = (a: ChannelWire, b: ChannelWire) => (inside(a.ty, b) ? 1 : 0) + (inside(b.sy, a) ? 1 : 0)
  for (const ws of buckets.values()) {
    const left = Math.max(...ws.map((w) => w.sourceRight)) + gap
    const right = Math.min(...ws.map((w) => w.tx)) - gap
    const order: ChannelWire[] = []
    // Insertion with the pairwise rule, seeded in a good global order.
    const seed = [...ws].sort((a, b) => (Math.sign(b.ty - b.sy) - Math.sign(a.ty - a.sy)) || (a.ty > a.sy ? b.sy - a.sy : a.sy - b.sy) || a.ty - b.ty)
    for (const w of seed) {
      let at = order.length
      while (at > 0 && cross(w, order[at - 1]) < cross(order[at - 1], w)) at--
      order.splice(at, 0, w)
    }
    // Tracks: each wire takes the leftmost track that adds no crossings (sharing one only with
    // wires whose runs don't overlap), else a new track on the right.
    const track = new Map<string, number>(), byTrack: ChannelWire[][] = []
    for (const w of order) {
      let best = byTrack.length, bestCost = Infinity
      for (let k = 0; k <= byTrack.length; k++) {
        if (k < byTrack.length && byTrack[k].some((u) => Math.min(u.sy, u.ty) - 4 < Math.max(w.sy, w.ty) && Math.min(w.sy, w.ty) - 4 < Math.max(u.sy, u.ty))) continue
        let c = 0
        for (const [id, t] of track) { const u = ws.find((x) => x.id === id)!; if (t < k) c += cross(u, w); else if (t > k) c += cross(w, u) }
        if (c < bestCost) { bestCost = c; best = k }
      }
      ;(byTrack[best] ??= []).push(w)
      track.set(w.id, best)
    }
    const n = byTrack.length
    const room = right - left
    const step = n > 1 ? Math.max(5, Math.min(spacing, room / (n - 1))) : spacing
    for (const w of ws) {
      const x = left + track.get(w.id)! * step
      if (x <= w.tx - gap) res.set(w.id, Math.round(x * 2) / 2)
    }
  }
  return res
}

// MARK: Free space

/**
 * Nearest spot to `preferred` where a device of size w×h doesn't overlap any
 * other device (with a margin for ports, labels and wires). Searches outward
 * in rings, trying right / below first.
 */
export function freeSpot(p: Project, size: { width: number; height: number }, preferred: CanvasPoint,
  geom: (eq: EquipmentInstance) => NodeGeom, opts: { ignore?: string | string[]; margin?: number; grid?: number; among?: (e: EquipmentInstance) => boolean } = {}): CanvasPoint {
  const margin = opts.margin ?? 60, grid = opts.grid ?? 20
  const ignore = new Set(Array.isArray(opts.ignore) ? opts.ignore : opts.ignore ? [opts.ignore] : [])
  const boxes = p.equipment.filter((e) => !ignore.has(e.id) && (!opts.among || opts.among(e))).map((e) => {
    const g = geom(e)
    return { x0: e.position.x - margin, y0: e.position.y - margin - 30, x1: e.position.x + g.width + margin, y1: e.position.y + g.height + margin }
  })
  const fits = (x: number, y: number) => boxes.every((b) => x + size.width <= b.x0 || x >= b.x1 || y + size.height <= b.y0 || y >= b.y1)
  const snap = (v: number) => Math.round(v / grid) * grid
  const px = snap(preferred.x), py = snap(preferred.y)
  if (fits(px, py)) return { x: px, y: py }
  const step = 40
  for (let r = 1; r < 400; r++) {
    // Ring of radius r (in steps): right side, bottom, left, top – nearest first.
    const cands: CanvasPoint[] = []
    for (let k = -r; k <= r; k++) {
      cands.push({ x: px + r * step, y: py + k * step }, { x: px + k * step, y: py + r * step }, { x: px - r * step, y: py + k * step }, { x: px + k * step, y: py - r * step })
    }
    cands.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))
    const hit = cands.find((c) => fits(c.x, c.y))
    if (hit) return hit
  }
  // Fallback: below everything.
  return { x: px, y: Math.max(py, ...boxes.map((b) => b.y1)) + margin }
}

/** Moves a just-added device into the nearest open space. */
export function placeInFreeSpace(p: Project, eqId: string, geom: (eq: EquipmentInstance) => NodeGeom, preferred?: CanvasPoint) {
  const eq = p.equipment.find((e) => e.id === eqId)
  if (!eq) return
  // Only devices on the same page can overlap it on screen / on its sheet.
  eq.position = freeSpot(p, geom(eq), preferred ?? eq.position, geom, { ignore: eqId, among: (e) => (e.groupId ?? null) === (eq.groupId ?? null) || !eq.groupId })
}

/**
 * Moves devices to another page (null = off every page), keeping their layout
 * relative to each other and dropping the block into open space on that page.
 * Wires to devices left behind become off-page flags automatically.
 */
export function moveToPage(p: Project, ids: string[], pageId: string | null, geom: (eq: EquipmentInstance) => NodeGeom) {
  const moving = p.equipment.filter((e) => ids.includes(e.id))
  if (!moving.length) return 0
  if (pageId && !(p.groups ?? []).some((g) => g.id === pageId)) return 0
  for (const e of moving) { if (pageId) e.groupId = pageId; else delete e.groupId }
  // Bounding box of the moved block.
  const x0 = Math.min(...moving.map((e) => e.position.x)), y0 = Math.min(...moving.map((e) => e.position.y))
  const x1 = Math.max(...moving.map((e) => e.position.x + geom(e).width)), y1 = Math.max(...moving.map((e) => e.position.y + geom(e).height))
  const others = p.equipment.filter((e) => !ids.includes(e.id) && (pageId ? e.groupId === pageId : !e.groupId))
  // Prefer to the right of what's already on the page, top-aligned; else keep the spot.
  const preferred = others.length
    ? { x: Math.max(...others.map((e) => e.position.x + geom(e).width)) + 300, y: Math.min(...others.map((e) => e.position.y)) }
    : { x: x0, y: y0 }
  // Wide margin: wires to other pages end in flags beside the ports.
  const at = freeSpot(p, { width: x1 - x0, height: y1 - y0 }, preferred, geom, { ignore: ids, among: (e) => others.includes(e), margin: 150 })
  for (const e of moving) e.position = { x: Math.round(e.position.x - x0 + at.x), y: Math.round(e.position.y - y0 + at.y) }
  return moving.length
}

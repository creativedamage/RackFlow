import { newId, type AccessoryKind, type Project, type Rack, type RackAccessory, type RackFace } from './model'
import { RackLayout } from './rack'

export const ACCESSORY_KINDS: Record<AccessoryKind, { name: string; label: string; heights: number[]; depthMM: number }> = {
  blank: { name: 'Blank Panel', label: 'BLANK PANEL', heights: [1, 2, 3, 4, 5, 6, 8], depthMM: 25 },
  logo: { name: 'Logo Blank', label: '', heights: [1, 2, 3, 4], depthMM: 25 },
  vent: { name: 'Vent Panel', label: 'VENT PANEL', heights: [1, 2, 3, 4], depthMM: 25 },
  brush: { name: 'Brush Panel', label: 'BRUSH PANEL', heights: [1, 2], depthMM: 40 },
  lacing: { name: 'Lacing Bar', label: 'LACING BAR', heights: [1], depthMM: 60 },
  cableManager: { name: 'Cable Manager', label: 'CABLE MANAGER', heights: [1, 2], depthMM: 90 },
  shelf: { name: 'Shelf', label: 'SHELF', heights: [1, 2, 3, 4], depthMM: 400 },
  drawer: { name: 'Drawer', label: 'DRAWER', heights: [1, 2, 3, 4, 5, 6], depthMM: 400 },
}
export const ACCESSORY_KEYS = Object.keys(ACCESSORY_KINDS) as AccessoryKind[]

/** Panels that can carry a logo (any flat panel face). */
export const LOGO_KINDS: AccessoryKind[] = ['blank', 'logo', 'vent', 'drawer']
export const canHaveLogo = (k: AccessoryKind) => LOGO_KINDS.includes(k)

export const accessoryLabel = (a: RackAccessory) => a.label?.trim() || ACCESSORY_KINDS[a.kind]?.label || a.kind.toUpperCase()

/** Adds a panel at the nearest free position to `start`; returns it, or null if it doesn't fit. */
export function addAccessory(p: Project, rackId: string, kind: AccessoryKind, height: number, start: number, face: RackFace, extra: Partial<RackAccessory> = {}): RackAccessory | null {
  const rack = p.racks.find((r) => r.id === rackId)
  if (!rack) return null
  const layout = RackLayout.of(p, rack.id)
  const half = extra.half && height === 1 ? extra.half : undefined
  const spot = half ? layout?.nearestSpot(1, ACCESSORY_KINDS[kind].depthMM, start, face, undefined, true, half) : null
  const at = half ? spot?.start : layout?.nearestFreeStart(height, ACCESSORY_KINDS[kind].depthMM, start, face)
  if (at == null) return null
  const a: RackAccessory = { id: newId<RackAccessory['id']>(), kind, startUnit: at, height, face, ...extra, ...(half ? { half: spot!.slot ?? half } : {}) }
  rack.accessories.push(a)
  return a
}

/** Empty unit spans on one face, top to bottom: [low, high]. */
export function emptySpans(p: Project, rack: Rack, face: RackFace): [number, number][] {
  const layout = RackLayout.of(p, rack.id)
  if (!layout) return []
  const used = new Set<number>()
  for (const o of layout.occupants) if (o.face === face || o.depthMM > rack.spec.mountingDepthMM * 0.8) for (let u = o.low; u <= o.high; u++) used.add(u)
  const spans: [number, number][] = []
  let hi: number | null = null
  for (let u = rack.spec.rackUnits; u >= 0; u--) {
    const free = u >= 1 && !used.has(u)
    if (free && hi == null) hi = u
    if (!free && hi != null) { spans.push([u + 1, hi]); hi = null }
  }
  return spans
}

/** Fills empty spaces with blank panels (largest standard sizes first). Returns how many were added. */
export function fillWithBlanks(p: Project, rackId: string, face: RackFace, opts: { maxHeight?: number; onlyBetween?: boolean } = {}): number {
  const rack = p.racks.find((r) => r.id === rackId)
  if (!rack) return 0
  const max = opts.maxHeight ?? 4
  let spans = emptySpans(p, rack, face)
  if (opts.onlyBetween) {
    // Skip the open space above the top device and below the bottom one.
    const layout = RackLayout.of(p, rack.id)!
    const occ = layout.occupants.filter((o) => o.face === face)
    if (!occ.length) return 0
    const top = Math.max(...occ.map((o) => o.high)), bottom = Math.min(...occ.map((o) => o.low))
    spans = spans.filter(([lo, hi]) => lo > bottom && hi < top)
  }
  let n = 0
  // Units with only one half filled (½-width gear or panels) get a ½ blank in the other half.
  const layout = RackLayout.of(p, rack.id)!
  const mine = layout.occupants.filter((o) => o.face === face || o.depthMM > rack.spec.mountingDepthMM * 0.8)
  const occ = layout.occupants.filter((o) => o.face === face)
  const top = occ.length ? Math.max(...occ.map((o) => o.high)) : 0, bottom = occ.length ? Math.min(...occ.map((o) => o.low)) : 0
  for (let u = 1; u <= rack.spec.rackUnits; u++) {
    const here = mine.filter((o) => o.low <= u && o.high >= u)
    if (!here.length || here.some((o) => !o.halfSlot)) continue
    const taken = new Set(here.map((o) => o.halfSlot))
    if (taken.size !== 1 || (opts.onlyBetween && !(u >= bottom && u <= top))) continue
    rack.accessories.push({ id: newId<RackAccessory['id']>(), kind: 'blank', startUnit: u, height: 1, face, half: taken.has('left') ? 'right' : 'left' })
    n++
  }
  for (const [lo, hi] of spans) {
    let u = hi
    while (u >= lo) {
      const h = Math.min(max, u - lo + 1)
      rack.accessories.push({ id: newId<RackAccessory['id']>(), kind: 'blank', startUnit: u - h + 1, height: h, face })
      u -= h; n++
    }
  }
  return n
}

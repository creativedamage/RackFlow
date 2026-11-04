import type { EquipmentId, Project, Rack, RackFace, RackId } from './model'
import { fmtLen, fmtWt } from './units'
import { findRack, heatBTU } from './project'
import { ACCESSORY_KINDS, accessoryLabel } from './rackpanels'
import type { ValidationIssue } from './validation/issues'

/** Anything occupying units: equipment or accessory, normalised. */
export interface RackOccupant {
  ref: { kind: 'equipment'; id: EquipmentId } | { kind: 'accessory'; id: string }
  name: string
  low: number
  high: number
  face: RackFace
  halfSlot: 'left' | 'right' | null
  depthMM: number
  weightKG: number
  heatBTU: number
  typicalWatts: number
  maxWatts: number
}

const overlaps = (a: { low: number; high: number }, b: { low: number; high: number }) => a.low <= b.high && b.low <= a.high
const refKey = (r: RackOccupant['ref']) => `${r.kind}:${r.id}`

export function conflict(x: RackOccupant, y: RackOccupant, rackDepth: number): boolean {
  if (!overlaps(x, y)) return false
  if (x.face === y.face) {
    // Two half-width items in opposite slots may share a unit.
    return !(x.halfSlot && y.halfSlot && x.halfSlot !== y.halfSlot)
  }
  // Front vs rear only collide if their depths meet in the middle.
  return x.depthMM + y.depthMM > rackDepth
}

/** Computed view of one rack: occupancy, conflicts, analytics, checks. */
export class RackLayout {
  readonly rack: Rack
  readonly occupants: RackOccupant[]

  private constructor(rack: Rack, occupants: RackOccupant[]) {
    this.rack = rack
    this.occupants = occupants
  }

  static of(project: Project, id: RackId): RackLayout | null {
    const rack = findRack(project, id)
    if (!rack) return null
    const occ: RackOccupant[] = []
    for (const eq of project.equipment) {
      const p = eq.rackPlacement, h = eq.product.physical.rackUnits
      if (!p || p.rack !== id || !h) continue
      occ.push({
        ref: { kind: 'equipment', id: eq.id }, name: eq.tag, low: p.startUnit, high: p.startUnit + h - 1, face: p.face,
        halfSlot: eq.product.physical.halfWidth ? p.halfSlot ?? 'left' : null,
        depthMM: eq.product.physical.depthMM, weightKG: eq.product.physical.weightKG,
        heatBTU: heatBTU(eq.product.power), typicalWatts: eq.product.power.typicalWatts, maxWatts: eq.product.power.maxWatts,
      })
    }
    for (const a of rack.accessories) {
      occ.push({
        ref: { kind: 'accessory', id: a.id }, name: accessoryLabel(a) || 'LOGO PANEL', low: a.startUnit, high: a.startUnit + Math.max(a.height, 1) - 1,
        face: a.face, halfSlot: null, depthMM: a.kind === 'shelf' || a.kind === 'drawer' ? rack.spec.mountingDepthMM / 2 : ACCESSORY_KINDS[a.kind]?.depthMM ?? 25,
        weightKG: 1, heatBTU: 0, typicalWatts: 0, maxWatts: 0,
      })
    }
    occ.sort((a, b) => b.low - a.low)
    return new RackLayout(rack, occ)
  }

  // MARK: Placement

  /**
   * Can these units go here together (moving a group)? Each item is checked
   * against what stays put – and against each other – ignoring where the moving
   * ones are now. Returns false if any doesn't fit.
   */
  canPlaceGroup(items: { id: string; height: number; depthMM: number; start: number; halfSlot?: 'left' | 'right' | null }[], face: RackFace): boolean {
    const moving = new Set(items.map((i) => `equipment:${i.id}`))
    const placed: RackOccupant[] = []
    for (const it of items) {
      const low = it.start, high = it.start + it.height - 1
      if (low < 1 || high > this.rack.spec.rackUnits) return false
      const cand: RackOccupant = { ref: { kind: 'equipment', id: it.id as never }, name: '', low, high, face, halfSlot: it.halfSlot ?? null, depthMM: it.depthMM, weightKG: 0, heatBTU: 0, typicalWatts: 0, maxWatts: 0 }
      if (this.occupants.some((o) => !moving.has(refKey(o.ref)) && conflict(o, cand, this.rack.spec.mountingDepthMM))) return false
      if (placed.some((o) => conflict(o, cand, this.rack.spec.mountingDepthMM))) return false
      placed.push(cand)
    }
    return true
  }

  canPlace(height: number, depthMM: number, start: number, face: RackFace, ignoring?: RackOccupant['ref'], halfSlot: 'left' | 'right' | null = null): boolean {
    const low = start, high = start + height - 1
    if (low < 1 || high > this.rack.spec.rackUnits) return false
    const cand: RackOccupant = { ref: { kind: 'accessory', id: '_' }, name: '', low, high, face, halfSlot, depthMM, weightKG: 0, heatBTU: 0, typicalWatts: 0, maxWatts: 0 }
    const ig = ignoring ? refKey(ignoring) : null
    return !this.occupants.some((o) => refKey(o.ref) !== ig && conflict(o, cand, this.rack.spec.mountingDepthMM))
  }

  /**
   * Nearest legal spot for a device: start unit and, for half-width (½ 1RU) gear,
   * which half – the preferred side first, then the other, so two halves sit side by side.
   */
  nearestSpot(height: number, depthMM: number, proposed: number, face: RackFace, ignoring: RackOccupant['ref'] | undefined, half: boolean, prefer: 'left' | 'right' = 'left'): { start: number; slot: 'left' | 'right' | null } | null {
    const maxStart = this.rack.spec.rackUnits - height + 1
    if (maxStart < 1) return null
    const slots: ('left' | 'right' | null)[] = half ? [prefer, prefer === 'left' ? 'right' : 'left'] : [null]
    for (let d = 0; d <= this.rack.spec.rackUnits; d++) {
      for (const c of [proposed - d, proposed + d]) {
        if (c < 1 || c > maxStart) continue
        for (const slot of slots) if (this.canPlace(height, depthMM, c, face, ignoring, slot)) return { start: c, slot }
      }
    }
    return null
  }

  /** Nearest valid start unit to `proposed`, searching outward (snap). */
  nearestFreeStart(height: number, depthMM: number, proposed: number, face: RackFace, ignoring?: RackOccupant['ref']): number | null {
    const maxStart = this.rack.spec.rackUnits - height + 1
    if (maxStart < 1) return null
    for (let d = 0; d <= this.rack.spec.rackUnits; d++) {
      for (const c of [proposed - d, proposed + d]) {
        if (c >= 1 && c <= maxStart && this.canPlace(height, depthMM, c, face, ignoring)) return c
      }
    }
    return null
  }

  // MARK: Analytics

  get usedUnits(): number {
    const s = new Set<number>()
    for (const o of this.occupants) for (let u = o.low; u <= o.high; u++) s.add(u)
    return s.size
  }
  get totalWeightKG() { return this.occupants.reduce((a, o) => a + o.weightKG, 0) }
  get totalTypicalWatts() { return this.occupants.reduce((a, o) => a + o.typicalWatts, 0) }
  get totalMaxWatts() { return this.occupants.reduce((a, o) => a + o.maxWatts, 0) }
  get totalHeatBTU() { return this.occupants.reduce((a, o) => a + o.heatBTU, 0) }
  amps(volts: number, useMax = false) { return (useMax ? this.totalMaxWatts : this.totalTypicalWatts) / volts }

  /** Centre of gravity height in U from the bottom. */
  get centerOfGravityU(): number | null {
    const w = this.totalWeightKG
    if (w <= 0) return null
    return this.occupants.reduce((a, o) => a + o.weightKG * ((o.low + o.high) / 2), 0) / w
  }

  private perUnit(value: (o: RackOccupant) => number): number[] {
    const map = new Array<number>(this.rack.spec.rackUnits).fill(0)
    for (const o of this.occupants) {
      const v = value(o)
      if (v <= 0) continue
      const share = v / (o.high - o.low + 1)
      for (let u = o.low; u <= o.high; u++) if (u >= 1 && u <= map.length) map[u - 1] += share
    }
    return map
  }
  /** Index 0 = U1. */
  get heatPerUnit() { return this.perUnit((o) => o.heatBTU) }
  get weightPerUnit() { return this.perUnit((o) => o.weightKG) }

  // MARK: Checks

  validate(): ValidationIssue[] {
    const out: ValidationIssue[] = []
    const subject = { kind: 'rack' as const, id: this.rack.id }
    const { rackUnits, mountingDepthMM: depth, maxLoadKG, coolingCapacityBTU } = this.rack.spec
    for (const o of this.occupants) {
      if (o.low < 1 || o.high > rackUnits)
        out.push({ rule: 'rack-bounds', severity: 'error', message: `${o.name} extends outside ${this.rack.name} (U${o.low}–U${o.high}).`, subject })
      if (o.depthMM > depth)
        out.push({ rule: 'rack-depth', severity: 'error', message: `${o.name} is ${fmtLen(o.depthMM, 1)} deep; ${this.rack.name} mounting depth is ${fmtLen(depth, 1)}.`, subject })
    }
    this.occupants.forEach((x, i) => {
      for (const y of this.occupants.slice(i + 1)) {
        if (!conflict(x, y, depth)) continue
        const why = x.face === y.face ? 'overlap' : 'collide front-to-rear (combined depth exceeds rack)'
        out.push({ rule: 'rack-overlap', severity: 'error', message: `${x.name} and ${y.name} ${why} at U${Math.max(x.low, y.low)}.`, subject })
      }
    })
    if (this.totalWeightKG > maxLoadKG)
      out.push({ rule: 'rack-weight', severity: 'error', message: `Load ${fmtWt(this.totalWeightKG, 0)} exceeds the ${fmtWt(maxLoadKG, 0)} rating.`, subject })
    const cog = this.centerOfGravityU
    if (cog != null && cog / rackUnits > 0.5)
      out.push({ rule: 'rack-cog', severity: 'warning', message: `Top-heavy: centre of gravity at U${cog.toFixed(1)}.`, suggestion: 'Move heavy items (amplifiers, UPS) toward the bottom.', subject })
    if (coolingCapacityBTU != null && this.totalHeatBTU > coolingCapacityBTU)
      out.push({ rule: 'rack-thermal', severity: 'warning', message: `Heat load ${this.totalHeatBTU.toFixed(0)} BTU/hr exceeds cooling capacity ${coolingCapacityBTU} BTU/hr.`, subject })
    const heat = this.heatPerUnit
    for (let u = 0; u + 2 < heat.length; u++) {
      if (heat[u] > 500 && heat[u + 1] > 500 && heat[u + 2] > 500) {
        out.push({ rule: 'rack-hotspot', severity: 'warning', message: `Thermal hot spot around U${u + 2}.`, suggestion: 'Add a 1U vent panel between high-dissipation devices.', subject })
        break
      }
    }
    return out
  }
}

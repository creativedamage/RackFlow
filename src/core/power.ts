// Building power: sources (receptacles, panel feeds, generators), circuits and
// load roll-up through PDUs / UPSs down to every device they feed.

import type { Cable, CircuitInfo, EquipmentInstance, PowerSupply, Project } from './model'
import { isPowerPort } from './project'

export const isPowerSource = (eq: EquipmentInstance) => eq.product.category === 'powerSource' || !!eq.product.supply

export interface SourceRating {
  volts: number
  amps: number
  phases: 1 | 3
  /** V × A (× √3 for three-phase). */
  ratedWatts: number
  /** Continuous limit, 80 % of rated by default. */
  continuousWatts: number
  factor: number
}

export function sourceRating(eq: EquipmentInstance): SourceRating | null {
  const s: PowerSupply | undefined = eq.product.supply
  if (!s && !isPowerSource(eq)) return null
  const c: CircuitInfo | undefined = eq.circuit
  const volts = c?.volts ?? s?.volts ?? 120
  const amps = c?.breakerAmps ?? s?.amps ?? 20
  const phases = s?.phases ?? 1
  const factor = c?.continuousFactor ?? 0.8
  const ratedWatts = Math.round(volts * amps * (phases === 3 ? Math.sqrt(3) : 1))
  return { volts, amps, phases, ratedWatts, continuousWatts: Math.round(ratedWatts * factor), factor }
}

/** Display name for a source's circuit, e.g. "LP-1 / 12". */
export const circuitName = (eq: EquipmentInstance) => {
  const c = eq.circuit
  if (!c || (!c.panel && !c.circuit)) return ''
  return [c.panel, c.circuit].filter(Boolean).join(' / ')
}

interface Feed { cable: Cable; feeder: EquipmentInstance; load: EquipmentInstance }

/** Power cables oriented feeder → load (outlet side → inlet side). */
export function powerFeeds(p: Project): Feed[] {
  const byId = new Map(p.equipment.map((e) => [e.id, e]))
  const out: Feed[] = []
  for (const cable of p.cables) {
    const ea = byId.get(cable.from.equipment), eb = byId.get(cable.to.equipment)
    if (!ea || !eb) continue
    const pa = ea.product.ports.find((x) => x.id === cable.from.port), pb = eb.product.ports.find((x) => x.id === cable.to.port)
    if (!pa || !pb || !isPowerPort(pa) || !isPowerPort(pb)) continue
    if (pa.direction === 'output' || pb.direction === 'input') out.push({ cable, feeder: ea, load: eb })
    else if (pb.direction === 'output' || pa.direction === 'input') out.push({ cable, feeder: eb, load: ea })
  }
  return out
}

export interface CircuitLoad {
  source: EquipmentInstance
  rating: SourceRating | null
  /** Every device downstream (through PDUs, UPSs, daisy chains). */
  devices: EquipmentInstance[]
  typicalWatts: number
  maxWatts: number
  /** maxWatts / continuousWatts. */
  ratio: number | null
}

/** Load on every building source, rolled up through distribution. */
export function circuitLoads(p: Project): CircuitLoad[] {
  const feeds = powerFeeds(p)
  const children = new Map<string, EquipmentInstance[]>()
  for (const f of feeds) children.set(f.feeder.id, [...(children.get(f.feeder.id) ?? []), f.load])
  return p.equipment.filter(isPowerSource).map((source) => {
    const seen = new Set<string>([source.id])
    const devices: EquipmentInstance[] = []
    const walk = (id: string) => {
      for (const d of children.get(id) ?? []) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        devices.push(d)
        walk(d.id)
      }
    }
    walk(source.id)
    const typicalWatts = devices.reduce((a, d) => a + d.product.power.typicalWatts, 0)
    const maxWatts = devices.reduce((a, d) => a + d.product.power.maxWatts, 0)
    const rating = sourceRating(source)
    return { source, rating, devices, typicalWatts, maxWatts, ratio: rating ? maxWatts / rating.continuousWatts : null }
  })
}

/** Ids of every device that traces back to a building source. */
export function fedFromBuilding(p: Project): Set<string> {
  return new Set(circuitLoads(p).flatMap((l) => l.devices.map((d) => d.id)))
}

/** The source(s) a device ultimately draws from. */
export function sourcesFor(p: Project, eqId: string): EquipmentInstance[] {
  return circuitLoads(p).filter((l) => l.devices.some((d) => d.id === eqId)).map((l) => l.source)
}

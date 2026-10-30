// Project helpers. Mutating functions are designed to run on Immer drafts
// (store) or on plain objects (tests); read helpers are pure.

import { cableSpec } from './cables'
import {
  addrKey, CATEGORIES, CURRENT_SCHEMA, newId,
  type Cable, type CanvasPoint, type EquipmentCategory, type EquipmentId, type EquipmentInstance,
  type PortAddress, type PortTemplate, type PowerSpec, type ProductDefinition, type Project, type Rack, type RackId,
} from './model'
import { DOMAINS, SIGNALS, type SignalDomain } from './signals'
import { validate, type ConnectionVerdict } from './validation/validator'

export const RACK_UNIT_MM = 44.45
export const WATTS_TO_BTU = 3.41214163

export function newProject(name = 'Untitled Project'): Project {
  return { schemaVersion: CURRENT_SCHEMA, info: { name, client: '', designer: '', revision: 'A' }, equipment: [], cables: [], racks: [], patchBays: [] }
}

// MARK: Lookup

export const findEquipment = (p: Project, id: EquipmentId) => p.equipment.find((e) => e.id === id)
export const findRack = (p: Project, id: RackId) => p.racks.find((r) => r.id === id)
export const findPort = (product: ProductDefinition, id: string) => product.ports.find((x) => x.id === id)

export interface ResolvedPort { equipment: EquipmentInstance; port: PortTemplate; address: PortAddress }

export function resolve(p: Project, a: PortAddress): ResolvedPort | null {
  const eq = findEquipment(p, a.equipment)
  const port = eq && findPort(eq.product, a.port)
  return eq && port ? { equipment: eq, port, address: a } : null
}

export const cablesAt = (p: Project, a: PortAddress) => {
  const k = addrKey(a)
  return p.cables.filter((c) => addrKey(c.from) === k || addrKey(c.to) === k)
}

export const portDomain = (port: PortTemplate): SignalDomain | null => (port.signals[0] ? SIGNALS[port.signals[0]].domain : null)
export const isPowerPort = (port: PortTemplate) => portDomain(port) === 'power'
export const domainColor = (d: SignalDomain | null) => (d ? DOMAINS[d].color : '#888888')

/** Heat dissipated inside the enclosure, BTU/hr. */
export function heatBTU(power: PowerSpec): number {
  if (power.publishedBTU != null) return power.publishedBTU
  const local = power.efficiency != null ? 1 - power.efficiency : 1
  return power.typicalWatts * local * WATTS_TO_BTU
}

// MARK: Naming

export function nextTag(p: Project, category: EquipmentCategory): string {
  const prefix = CATEGORIES[category].tag
  const used = new Set(p.equipment.map((e) => e.tag))
  for (let n = 1; ; n++) {
    const t = `${prefix}-${String(n).padStart(2, '0')}`
    if (!used.has(t)) return t
  }
}

export function nextCableLabel(p: Project, prefix: string): string {
  const used = new Set(p.cables.map((c) => c.label))
  for (let n = 1; ; n++) {
    const l = `${prefix}-${String(n).padStart(4, '0')}`
    if (!used.has(l)) return l
  }
}

export const CABLE_PREFIX: Record<SignalDomain, string> = { video: 'V', audio: 'A', network: 'N', control: 'C', lighting: 'L', rf: 'RF', usb: 'U', power: 'P' }

// MARK: Mutations

export function addEquipment(p: Project, product: ProductDefinition, at: CanvasPoint): EquipmentInstance {
  const inst: EquipmentInstance = {
    id: newId<EquipmentId>(), tag: nextTag(p, product.category),
    product: structuredClone(product), position: { ...at }, rackPlacement: null, room: '', notes: '',
  }
  p.equipment.push(inst)
  return inst
}

/** Removes equipment, every cable attached to it and its patch-bay record. */
export function removeEquipment(p: Project, ids: Set<EquipmentId> | EquipmentId[]) {
  const set = new Set(ids)
  p.equipment = p.equipment.filter((e) => !set.has(e.id))
  p.cables = p.cables.filter((c) => !set.has(c.from.equipment) && !set.has(c.to.equipment))
  p.patchBays = p.patchBays.filter((b) => !set.has(b.equipment))
  if (p.groups) { const used = new Set(p.equipment.map((e) => e.groupId)); p.groups = p.groups.filter((g) => used.has(g.id)) }
}

export function updateEquipment(p: Project, id: EquipmentId, fn: (e: EquipmentInstance) => void) {
  const e = p.equipment.find((x) => x.id === id)
  if (e) fn(e)
}

/** Validates, then appends a cable. Returns the verdict either way. */
export function connect(p: Project, a: PortAddress, b: PortAddress, specKey: string | null = null): ConnectionVerdict {
  const verdict = validate(p, a, b, { specKey })
  if (!verdict.allowed) return verdict
  const [from, to] = verdict.normalized ?? [a, b]
  const spec = cableSpec(specKey) ?? verdict.suggestedCables[0]
  const prefix = spec?.labelPrefix ?? (verdict.signal ? CABLE_PREFIX[SIGNALS[verdict.signal].domain] : 'X')
  const c: Cable = {
    id: newId(), label: nextCableLabel(p, prefix), from: { ...from }, to: { ...to },
    specKey: spec?.key ?? null, lengthMeters: null, notes: '',
  }
  p.cables.push(c)
  verdict.cableId = c.id
  return verdict
}

export function addRack(p: Project, name?: string): Rack {
  const r: Rack = { id: newId(), name: name ?? `Rack ${p.racks.length + 1}`, spec: { rackUnits: 42, mountingDepthMM: 600, maxLoadKG: 900, coolingCapacityBTU: null }, accessories: [] }
  p.racks.push(r)
  return r
}

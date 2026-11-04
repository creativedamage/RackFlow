// Project helpers. Mutating functions are designed to run on Immer drafts
// (store) or on plain objects (tests); read helpers are pure.

import { boxNumberingOf, isBox, numberBoxPorts } from './boxports'
import { cableRule, nextNumber, tagRule, type CableSystem } from './numbering'
import { cableSpec, fittingCables } from './cables'
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
  return { schemaVersion: CURRENT_SCHEMA, info: { name, client: '', designer: '', revision: 'A' }, equipment: [], cables: [], racks: [], patchBays: [], diagram: { cards: 3 } }
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

/** Next free device tag for a category, following the project's numbering standard (PB-001…). */
export function nextTag(p: Project, category: EquipmentCategory): string {
  return nextNumber(tagRule(p, category), new Set(p.equipment.map((e) => e.tag)))
}

/** Next free cable label for a system (A-0001…); `prefix` is the default from the cable type. */
export function nextCableLabel(p: Project, prefix: string, system?: CableSystem): string {
  return nextNumber(cableRule(p, system ?? 'other', prefix), new Set(p.cables.map((c) => c.label)))
}

export const CABLE_PREFIX: Record<SignalDomain, string> = { video: 'V', audio: 'A', network: 'N', control: 'C', lighting: 'L', rf: 'RF', usb: 'U', power: 'P' }

// MARK: Mutations

export function addEquipment(p: Project, product: ProductDefinition, at: CanvasPoint): EquipmentInstance {
  const inst: EquipmentInstance = {
    id: newId<EquipmentId>(), tag: nextTag(p, product.category),
    product: structuredClone(product), position: { ...at }, rackPlacement: null, room: '', notes: '',
  }
  p.equipment.push(inst)
  if (isBox(inst) && boxNumberingOf(p).on) numberBoxPorts(p, { ids: [inst.id] })
  return inst
}

/** Removes equipment, every cable attached to it and its patch-bay record. */
export function removeEquipment(p: Project, ids: Set<EquipmentId> | EquipmentId[]) {
  const set = new Set(ids)
  p.equipment = p.equipment.filter((e) => !set.has(e.id))
  p.cables = p.cables.filter((c) => !set.has(c.from.equipment) && !set.has(c.to.equipment))
  p.patchBays = p.patchBays.filter((b) => !set.has(b.equipment))
  // Pages (groups) stay even when their last device is removed.
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
  // Twisted pair: use the category of the panel it lands on (else Cat6A).
  const cats = ['cat5e', 'cat6', 'cat6a', 'cat8']
  const tags = [a, b].flatMap((x) => findEquipment(p, x.equipment)?.product.tags ?? [])
  const cat = cats.filter((c) => tags.includes(c)).sort((x, y) => cats.indexOf(y) - cats.indexOf(x))[0] ?? 'cat6a'
  const preferred = verdict.suggestedCables.find((s) => s.key === cat || s.key.startsWith(`${cat}.`))
  const tp = verdict.suggestedCables[0] && /^cat\d/.test(verdict.suggestedCables[0].key)
  // Fiber: single-mode (OS2) or multimode (OM3/4/5) from the panels it lands on.
  const fiberMode = tags.includes('multimode') ? '.mm' : tags.includes('singlemode') ? '.sm' : null
  const fiberPick = fiberMode && verdict.suggestedCables.find((s) => s.key.startsWith('fiber.') && s.key.endsWith(fiberMode))
  // Nothing in the catalog fits? Fall back to the made-to-order cable for these two ports, never TBD.
  const ra = resolve(p, from), rb = resolve(p, to)
  const spec = cableSpec(specKey) ?? (fiberPick || (tp && preferred ? preferred : verdict.suggestedCables[0])) ?? (ra && rb ? fittingCables(ra.port, rb.port)[0] : undefined)
  const prefix = spec?.labelPrefix ?? (verdict.signal ? CABLE_PREFIX[SIGNALS[verdict.signal].domain] : 'X')
  const c: Cable = {
    id: newId(), label: nextCableLabel(p, prefix, verdict.signal ? SIGNALS[verdict.signal].domain : 'other'), from: { ...from }, to: { ...to },
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

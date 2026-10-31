// Diagram groups ("systems"): named, colour-coded sets of devices such as
// "FOH Audio" or "Stage Video". Membership lives on each device (groupId).

import { newId, type DeviceGroup, type EquipmentId, type EquipmentInstance, type Project } from './model'
import { portDomain } from './project'
import { DOMAINS, type SignalDomain } from './signals'

export const groupColor = (g: DeviceGroup) => (g.system === 'custom' ? g.color ?? '#868e96' : DOMAINS[g.system].color)
export const groupsOf = (p: Project) => p.groups ?? []
export const membersOf = (p: Project, groupId: string) => p.equipment.filter((e) => e.groupId === groupId)

/** The signal family a device mostly deals in (cabled ports count double; power ignored). */
export function dominantSystem(p: Project, eq: EquipmentInstance): SignalDomain | null {
  const score = new Map<SignalDomain, number>()
  const cabled = new Set(p.cables.flatMap((c) => [c.from, c.to]).filter((a) => a.equipment === eq.id).map((a) => a.port))
  for (const port of eq.product.ports) {
    const d = portDomain(port)
    if (!d || d === 'power') continue
    score.set(d, (score.get(d) ?? 0) + (cabled.has(port.id) ? 2 : 1))
  }
  let best: SignalDomain | null = null, n = 0
  for (const [d, v] of score) if (v > n) { best = d; n = v }
  return best ?? (eq.product.ports.some((x) => portDomain(x) === 'power') ? 'power' : null)
}

/** Creates a group from devices (moving them out of any other group). */
export function createGroup(p: Project, ids: EquipmentId[], opts: { name?: string; system?: DeviceGroup['system']; color?: string } = {}): DeviceGroup {
  const members = p.equipment.filter((e) => ids.includes(e.id))
  const votes = new Map<SignalDomain, number>()
  for (const e of members) { const d = dominantSystem(p, e); if (d) votes.set(d, (votes.get(d) ?? 0) + 1) }
  const guess = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const system = opts.system ?? guess ?? 'custom'
  const base = opts.name?.trim() || (system === 'custom' ? 'Group' : DOMAINS[system].name)
  const names = new Set(groupsOf(p).map((g) => g.name))
  let name = base
  for (let n = 2; names.has(name); n++) name = `${base} ${n}`
  const g: DeviceGroup = { id: newId(), name, system, color: opts.color }
  p.groups = [...groupsOf(p), g]
  for (const e of members) e.groupId = g.id
  pruneGroups(p)
  return g
}

export function ungroup(p: Project, groupId: string) {
  for (const e of p.equipment) if (e.groupId === groupId) delete e.groupId
  p.groups = groupsOf(p).filter((g) => g.id !== groupId)
}

export function removeFromGroup(p: Project, ids: EquipmentId[]) {
  for (const e of p.equipment) if (ids.includes(e.id)) delete e.groupId
  pruneGroups(p)
}

export function addToGroup(p: Project, ids: EquipmentId[], groupId: string) {
  if (!groupsOf(p).some((g) => g.id === groupId)) return
  for (const e of p.equipment) if (ids.includes(e.id)) e.groupId = groupId
  pruneGroups(p)
}

/** Drops dangling memberships (devices pointing at a deleted page). */
export function pruneGroups(p: Project) {
  const ids = new Set(groupsOf(p).map((g) => g.id))
  for (const e of p.equipment) if (e.groupId && !ids.has(e.groupId)) delete e.groupId
  // Pages stay even when empty (a new page starts empty); delete them explicitly.
}

/** Puts every ungrouped device into a group for its main system (Audio, Video, Lighting…). */
export function autoGroupBySystem(p: Project, opts: { includePower?: boolean } = {}): number {
  const bySys = new Map<SignalDomain, EquipmentId[]>()
  for (const e of p.equipment) {
    if (e.groupId) continue
    const d = dominantSystem(p, e)
    if (!d || (d === 'power' && !opts.includePower)) continue
    bySys.set(d, [...(bySys.get(d) ?? []), e.id])
  }
  let n = 0
  for (const [sys, ids] of bySys) {
    const existing = groupsOf(p).find((g) => g.system === sys && g.name === DOMAINS[sys].name)
    if (existing) addToGroup(p, ids, existing.id)
    else createGroup(p, ids, { system: sys, name: DOMAINS[sys].name })
    n += ids.length
  }
  return n
}

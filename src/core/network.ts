// Network sheet: one row per network interface (IP, device, location, the
// switch and port it lands on, notes). The switch / port come from the wiring,
// traced through patch panels, wall plates and floor boxes.

import type { EquipmentInstance, NetInfo, PortAddress, PortTemplate, Project } from './model'
import { cablesAt, resolve } from './project'
import { SIGNALS } from './signals'

const PASSIVE = new Set(['patchBay', 'wallBox', 'wallPlate', 'floorBox', 'connectorPanel', 'fiberEnclosure'])
export const MGMT = 'mgmt'

export interface SwitchLink {
  /** The switch (or, for a direct link, the other device). */
  eq: EquipmentInstance
  port: PortTemplate
  /** Passive hops on the way, e.g. ["WP-01 RJ45 1", "PP-01 Port 12"]. */
  via: string[]
  direct: boolean
  cable: string
}

export interface NetworkRow {
  key: string
  eq: EquipmentInstance
  portId: string
  interface: string
  info: NetInfo
  link: SwitchLink | null
  isSwitch: boolean
}

const isNetworkPort = (p: PortTemplate) => p.signals.some((s) => SIGNALS[s].domain === 'network') && !p.signals.some((s) => SIGNALS[s].domain === 'power')

/** The other side of a passive jack (front ↔ rear). */
function throughPort(eq: EquipmentInstance, portId: string): string | null {
  const has = (id: string) => eq.product.ports.some((p) => p.id === id)
  const cands = portId.endsWith('.f') ? [`${portId.slice(0, -2)}.r`, portId.slice(0, -2)] : portId.endsWith('.r') ? [`${portId.slice(0, -2)}.f`] : [`${portId}.f`]
  return cands.find(has) ?? null
}

/** Follows the cable from a device port through passive panels to a switch (or another device). */
export function traceToSwitch(p: Project, from: PortAddress): SwitchLink | null {
  let at = from
  const via: string[] = []
  let firstCable = ''
  for (let hop = 0; hop < 10; hop++) {
    const cable = cablesAt(p, at)[0]
    if (!cable) return null
    if (!firstCable) firstCable = cable.label
    const otherAddr = cable.from.equipment === at.equipment && cable.from.port === at.port ? cable.to : cable.from
    const other = resolve(p, otherAddr)
    if (!other) return null
    if (PASSIVE.has(other.equipment.product.category)) {
      via.push(`${other.equipment.tag} ${other.port.label.replace(/ \(rear\)$/, '')}`)
      const next = throughPort(other.equipment, other.port.id)
      if (!next) return null
      at = { equipment: other.equipment.id, port: next }
      continue
    }
    return { eq: other.equipment, port: other.port, via, direct: other.equipment.product.category !== 'networkSwitch', cable: firstCable }
  }
  return null
}

export function networkRows(p: Project): NetworkRow[] {
  const rows: NetworkRow[] = []
  for (const eq of p.equipment) {
    const cat = eq.product.category
    if (PASSIVE.has(cat) || cat === 'powerSource') continue
    if (cat === 'networkSwitch') {
      rows.push({ key: `${eq.id}/${MGMT}`, eq, portId: MGMT, interface: 'Management', info: eq.network?.[MGMT] ?? {}, link: null, isSwitch: true })
      continue
    }
    for (const port of eq.product.ports.filter(isNetworkPort)) {
      rows.push({ key: `${eq.id}/${port.id}`, eq, portId: port.id, interface: port.label, info: eq.network?.[port.id] ?? {}, link: traceToSwitch(p, { equipment: eq.id, port: port.id }), isSwitch: false })
    }
  }
  return rows
}

/** Switch and port shown on the sheet: manual entry wins, else the traced link. */
export const rowSwitch = (r: NetworkRow) => r.info.switchTag ?? (r.link ? r.link.eq.tag : '')
export const rowSwitchPort = (r: NetworkRow) => r.info.switchPort ?? (r.link ? r.link.port.label : '')

export const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(\/([0-9]|[12]\d|3[0-2]))?$/
export const validIp = (s: string) => IPV4.test(s.trim())

/** Row keys whose IP is used more than once. */
export function duplicateIps(rows: NetworkRow[]): Set<string> {
  const by = new Map<string, string[]>()
  for (const r of rows) { const ip = r.info.ip?.trim().split('/')[0]; if (ip) by.set(ip, [...(by.get(ip) ?? []), r.key]) }
  return new Set([...by.values()].filter((k) => k.length > 1).flat())
}

const toInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
const toIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.')

/** Sets an IP on a device port (creating the record). */
export function setNet(eq: EquipmentInstance, portId: string, patch: Partial<NetInfo>) {
  eq.network ??= {}
  const cur = { ...(eq.network[portId] ?? {}), ...patch }
  for (const k of Object.keys(cur) as (keyof NetInfo)[]) if (cur[k] == null || cur[k] === '') delete cur[k]
  if (Object.keys(cur).length) eq.network[portId] = cur
  else delete eq.network[portId]
}

/**
 * Numbers the given rows from `start` (e.g. 192.168.10.20) in order, skipping
 * addresses already used elsewhere in the project. Returns how many were set.
 */
export function autoAssignIps(p: Project, keys: string[], start: string, step = 1, onlyEmpty = true): number {
  if (!validIp(start)) return 0
  const [base, mask] = start.split('/')
  // Every address already in use stays reserved, except ones about to be overwritten.
  const used = new Set(networkRows(p).filter((r) => onlyEmpty || !keys.includes(r.key)).map((r) => r.info.ip?.split('/')[0]).filter(Boolean))
  let n = toInt(base), count = 0
  for (const key of keys) {
    const [eqId, portId] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)]
    const eq = p.equipment.find((e) => e.id === eqId)
    if (!eq) continue
    if (onlyEmpty && eq.network?.[portId]?.ip) continue
    while (used.has(toIp(n)) || n % 256 === 0 || n % 256 === 255) n += Math.max(1, step)
    setNet(eq, portId, { ip: mask ? `${toIp(n)}/${mask}` : toIp(n) })
    used.add(toIp(n)); n += Math.max(1, step); count++
  }
  return count
}

// MARK: Switch ports & VLANs

export interface SwitchPortRow {
  key: string
  sw: EquipmentInstance
  port: PortTemplate
  info: NetInfo
  /** The device interface this port reaches through the wiring (patch panels and wall plates followed). */
  device: NetworkRow | null
}

/** One row per network port on every switch, with what it's wired to. */
export function switchPortRows(p: Project, rows: NetworkRow[] = networkRows(p)): SwitchPortRow[] {
  const reach = new Map<string, NetworkRow>()
  for (const r of rows) if (r.link && !r.link.direct) reach.set(`${r.link.eq.id}/${r.link.port.id}`, r)
  const out: SwitchPortRow[] = []
  for (const sw of p.equipment) {
    if (sw.product.category !== 'networkSwitch') continue
    for (const port of sw.product.ports.filter(isNetworkPort)) {
      out.push({ key: `${sw.id}/${port.id}`, sw, port, info: sw.network?.[port.id] ?? {}, device: reach.get(`${sw.id}/${port.id}`) ?? null })
    }
  }
  return out
}

/** A device interface's VLAN: its own, else the access VLAN of the switch port it's wired to. */
export function rowVlan(r: NetworkRow): { vlan: string; inherited: boolean } {
  if (r.info.vlan) return { vlan: r.info.vlan, inherited: false }
  const sp = r.link && !r.link.direct ? r.link.eq.network?.[r.link.port.id] : undefined
  return { vlan: sp && sp.mode !== 'trunk' && sp.vlan ? sp.vlan : '', inherited: true }
}

/** Valid VLAN list: IDs 1–4094, comma separated, ranges allowed ("10,20,100-110"). */
export function validVlans(s: string): boolean {
  const t = s.trim()
  if (!t) return true
  return t.split(/\s*,\s*/).every((part) => {
    const m = /^(\d{1,4})(?:\s*-\s*(\d{1,4}))?$/.exec(part)
    if (!m) return false
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a
    return a >= 1 && b <= 4094 && a <= b
  })
}

/** Short tag for a switch port on the diagram: "V10", or "T 10,20" for a trunk. */
export function vlanTag(info: NetInfo | undefined): string {
  if (!info) return ''
  if (info.mode === 'trunk') return info.tagged ? `T ${info.tagged}` : info.vlan ? `T (${info.vlan})` : 'T'
  return info.vlan ? `V${info.vlan}` : ''
}

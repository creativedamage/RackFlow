// VLAN IP plan: each VLAN's subnet (gateway + prefix) and handing out addresses
// to devices by the VLAN their port is on.

import type { Project, VlanPlan } from './model'
import { networkRows, rowVlan, setNet, validIp } from './network'

export const vlansOf = (p: Project): VlanPlan[] => p.vlans ?? []
export const vlanPlan = (p: Project, vlan: string | undefined) => (vlan ? vlansOf(p).find((v) => v.vlan.trim() === vlan.trim()) : undefined)

export const ipToInt = (ip: string) => ip.split('/')[0].split('.').reduce((a, o) => a * 256 + Number(o), 0)
export const intToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.')
const maskInt = (prefix: number) => (prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)
export const prefixMask = (prefix: number) => intToIp(maskInt(prefix))

export interface Subnet { network: string; broadcast: string; mask: string; first: string; last: string; hosts: number; cidr: string }

/** The subnet a VLAN plan describes (null if its gateway isn't a valid address). */
export function subnetOf(plan: Pick<VlanPlan, 'gateway' | 'prefix'>): Subnet | null {
  if (!validIp(plan.gateway) || !(plan.prefix >= 8 && plan.prefix <= 30)) return null
  const m = maskInt(plan.prefix), net = (ipToInt(plan.gateway) & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0
  return { network: intToIp(net), broadcast: intToIp(bc), mask: intToIp(m), first: intToIp(net + 1), last: intToIp(bc - 1), hosts: bc - net - 1, cidr: `${intToIp(net)}/${plan.prefix}` }
}

export const inSubnet = (ip: string, plan: Pick<VlanPlan, 'gateway' | 'prefix'>) => {
  const s = subnetOf(plan)
  if (!s || !validIp(ip)) return false
  const n = ipToInt(ip)
  return n > ipToInt(s.network) && n < ipToInt(s.broadcast)
}

/** Where device addresses start: the plan's own start, else 9 above the gateway (.1 → .10). */
export function startOf(plan: VlanPlan): number {
  const s = subnetOf(plan)!
  if (plan.start && inSubnet(plan.start, plan)) return ipToInt(plan.start)
  // Next to the gateway: 10.10.20.1 → devices from 10.10.20.10 (else the 10th host of the subnet).
  const g = ipToInt(plan.gateway) + 9
  return g > ipToInt(s.network) && g < ipToInt(s.broadcast) ? g : Math.min(ipToInt(s.network) + 10, ipToInt(s.broadcast) - 1)
}

export interface VlanAssignResult { assigned: number; noVlan: number; noPlan: string[]; full: string[] }

/**
 * Gives each of these interfaces an address in its VLAN's subnet (the VLAN set on
 * the interface, or on the switch port it lands on), in order, skipping the
 * gateway, the network / broadcast addresses and anything already used.
 * Interfaces with no VLAN use `fallback` (a VLAN ID) if given.
 */
export function autoAssignByVlan(p: Project, keys: string[], o: { onlyEmpty?: boolean; fallback?: string } = {}): VlanAssignResult {
  const onlyEmpty = o.onlyEmpty !== false
  const rows = networkRows(p)
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const used = new Set(rows.filter((r) => onlyEmpty || !keys.includes(r.key)).map((r) => r.info.ip?.split('/')[0]).filter(Boolean) as string[])
  const next = new Map<string, number>()
  const res: VlanAssignResult = { assigned: 0, noVlan: 0, noPlan: [], full: [] }
  for (const key of keys) {
    const r = byKey.get(key)
    if (!r) continue
    if (onlyEmpty && r.info.ip) continue
    const own = rowVlan(r).vlan
    const vlan = own || o.fallback || ''
    if (!vlan) { res.noVlan++; continue }
    const plan = vlanPlan(p, vlan)
    const sub = plan && subnetOf(plan)
    if (!plan || !sub) { if (!res.noPlan.includes(vlan)) res.noPlan.push(vlan); continue }
    for (const x of [plan.gateway, sub.network, sub.broadcast]) used.add(x.split('/')[0])
    let n = next.get(vlan) ?? startOf(plan)
    const last = ipToInt(sub.last)
    while (n <= last && used.has(intToIp(n))) n++
    if (n > last) { if (!res.full.includes(vlan)) res.full.push(vlan); continue }
    const eq = p.equipment.find((e) => e.id === r.eq.id)
    if (!eq) continue
    // Interfaces that had no VLAN are put on the one they were numbered in.
    setNet(eq, r.portId, own ? { ip: intToIp(n) } : { ip: intToIp(n), vlan })
    used.add(intToIp(n)); next.set(vlan, n + 1); res.assigned++
  }
  return res
}

/** Problems with an address against its VLAN's plan (for the sheet). */
export function ipVlanIssue(p: Project, ip: string | undefined, vlan: string): string | null {
  const plan = vlanPlan(p, vlan)
  if (!ip || !plan || !subnetOf(plan) || !validIp(ip)) return null
  const bare = ip.split('/')[0]
  if (bare === plan.gateway.split('/')[0]) return `This is VLAN ${vlan}'s gateway address`
  return inSubnet(bare, plan) ? null : `Outside VLAN ${vlan}'s subnet (${subnetOf(plan)!.cidr})`
}

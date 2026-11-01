// Pull schedule: the installer's list. One row per cable with where both ends
// are (room, rack and RU, device, port, connector), the cable type and length,
// its pathway, and pulled / terminated / tested check-offs. Optionally every
// port that has no cable yet, so spares and unfinished runs are on the list too.

import { cableSpec, pullName } from './cables'
import { addrKey, type Cable, type EquipmentInstance, type PortTemplate, type Project } from './model'
import { portDomain } from './project'
import { cableSystem } from './schedule'
import { connectorName, DOMAINS, type SignalDomain } from './signals'
import { longUnit, toLong } from './units'

export interface PullEnd {
  tag: string
  device: string
  port: string
  connector: string
  room: string
  /** Rack and unit ("AVR-1 U12"), or empty when not rack mounted. */
  rack: string
}
export interface PullRow {
  key: string
  /** The row's first cable (null for an unwired port). */
  cable: Cable | null
  /** Every cable in this pull – more than one when channels share a snake. */
  cables: Cable[]
  /** Snakes: channels used / available. */
  channels?: { used: number; of: number }
  /** Device ids of both ends (for editing rooms). */
  fromId: string
  toId: string | null
  label: string
  system: SignalDomain | null
  type: string
  from: PullEnd
  to: PullEnd | null
}

const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

function end(p: Project, eq: EquipmentInstance, port: PortTemplate): PullEnd {
  const pl = eq.rackPlacement
  const rack = pl ? p.racks.find((r) => r.id === pl.rack) : undefined
  return {
    tag: eq.tag,
    device: [eq.product.manufacturer, eq.product.model].filter(Boolean).join(' '),
    port: port.label,
    connector: `${connectorName(port.connector)}${port.gender === 'genderless' ? '' : port.gender === 'male' ? ' M' : ' F'}`,
    room: eq.room?.trim() ?? '',
    rack: rack ? `${rack.name} U${pl!.startUnit}${pl!.face === 'rear' ? ' rear' : ''}` : '',
  }
}

export function pullRows(p: Project, opts: { unwired?: boolean } = {}): PullRow[] {
  const byId = new Map(p.equipment.map((e) => [e.id as string, e]))
  const rows: PullRow[] = []
  // Snakes: connections between the same two devices on the same snake type are one pull,
  // split into as many snakes as the channel count needs.
  const snakes = new Map<string, Cable[]>()
  for (const c of p.cables) {
    const spec = cableSpec(c.specKey)
    if (!spec?.channels) continue
    const k = `${spec.key}|${c.from.equipment}|${c.to.equipment}`
    snakes.set(k, [...(snakes.get(k) ?? []), c])
  }
  const inSnake = new Set<string>()
  for (const [k, list] of snakes) {
    const of = cableSpec(k.split('|')[0])!.channels!
    list.sort((x, y) => nat(x.label, y.label))
    for (let i = 0; i < list.length; i += of) {
      const part = list.slice(i, i + of)
      const c = part[0], z = part[part.length - 1]
      const a = byId.get(c.from.equipment), b = byId.get(c.to.equipment)
      const ports = (side: 'from' | 'to', eq: EquipmentInstance | undefined) => part.map((x) => eq?.product.ports.find((q) => q.id === x[side].port)).filter(Boolean) as PortTemplate[]
      const pf = ports('from', a), pt = ports('to', b)
      if (!a || !b || !pf.length || !pt.length) continue
      const span = (ps: PortTemplate[]) => (ps.length > 1 ? `${ps[0].label} … ${ps[ps.length - 1].label} (${ps.length})` : ps[0].label)
      part.forEach((x) => inSnake.add(x.id))
      rows.push({
        key: `snake:${k}:${i}`, cable: c, cables: part, channels: { used: part.length, of },
        label: part.length > 1 ? `${c.label} … ${z.label}` : c.label, system: cableSystem(p, c), type: pullName(cableSpec(c.specKey)),
        from: { ...end(p, a, pf[0]), port: span(pf) }, to: { ...end(p, b, pt[0]), port: span(pt) }, fromId: a.id, toId: b.id,
      })
    }
  }
  for (const c of p.cables) {
    if (inSnake.has(c.id)) continue
    const a = byId.get(c.from.equipment), b = byId.get(c.to.equipment)
    const pa = a?.product.ports.find((x) => x.id === c.from.port), pb = b?.product.ports.find((x) => x.id === c.to.port)
    if (!a || !b || !pa || !pb) continue
    rows.push({ key: c.id, cable: c, cables: [c], label: c.label, system: cableSystem(p, c), type: pullName(cableSpec(c.specKey) ?? undefined), from: end(p, a, pa), to: end(p, b, pb), fromId: a.id, toId: b.id })
  }
  if (opts.unwired) {
    const used = new Set(p.cables.flatMap((c) => [addrKey(c.from), addrKey(c.to)]))
    for (const e of p.equipment) for (const port of e.product.ports) {
      if (used.has(`${e.id}/${port.id}`)) continue
      rows.push({ key: `${e.id}/${port.id}`, cable: null, cables: [], label: '', system: portDomain(port), type: '', from: end(p, e, port), to: null, fromId: e.id, toId: null })
    }
  }
  // Room by room, then device and port – the way a crew walks the job.
  return rows.sort((x, y) => nat(x.from.room, y.from.room) || nat(x.from.tag, y.from.tag) || nat(x.from.port, y.from.port) || nat(x.label, y.label))
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const yes = (b?: boolean) => (b ? 'Yes' : '')

export const PULL_HEAD = () => ['Cable #', 'System', 'Cable', 'Color', `Length (${longUnit()})`,
  'From Room', 'From Rack', 'From Device', 'From Model', 'From Port', 'From Connector',
  'To Room', 'To Rack', 'To Device', 'To Model', 'To Port', 'To Connector',
  'Pathway', 'Pulled', 'Terminated', 'Tested', 'Notes']

export const pullDone = (r: PullRow, k: 'pulled' | 'terminated' | 'tested') => r.cables.length > 0 && r.cables.every((c) => c.pull?.[k])

export function pullCells(r: PullRow): string[] {
  const c = r.cable
  const e = (x: PullEnd | null) => (x ? [x.room, x.rack, x.tag, x.device, x.port, x.connector] : ['', '', '', '', '', ''])
  return [r.label || (c ? '' : 'UNWIRED'), r.system ? DOMAINS[r.system].name : '', r.channels ? `${r.type} (${r.channels.used} of ${r.channels.of} ch)` : r.type, c?.color ?? '', c?.lengthMeters == null ? '' : String(Number(toLong(c.lengthMeters).toFixed(1))),
    ...e(r.from), ...e(r.to), c?.pull?.pathway ?? '', yes(pullDone(r, 'pulled')), yes(pullDone(r, 'terminated')), yes(pullDone(r, 'tested')), c?.notes ?? '']
}

export function pullScheduleCSV(p: Project, opts: { unwired?: boolean } = {}): string {
  return [PULL_HEAD().map(csvCell).join(','), ...pullRows(p, opts).map((r) => pullCells(r).map(csvCell).join(','))].join('\n')
}

// Pull schedule: the installer's list. One row per cable with where both ends
// are (room, rack and RU, device, port, connector), the cable type and length,
// its pathway, and pulled / terminated / tested check-offs. Optionally every
// port that has no cable yet, so spares and unfinished runs are on the list too.

import { cableSpec } from './cables'
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
  cable: Cable | null
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
  for (const c of p.cables) {
    const a = byId.get(c.from.equipment), b = byId.get(c.to.equipment)
    const pa = a?.product.ports.find((x) => x.id === c.from.port), pb = b?.product.ports.find((x) => x.id === c.to.port)
    if (!a || !b || !pa || !pb) continue
    rows.push({ key: c.id, cable: c, label: c.label, system: cableSystem(p, c), type: cableSpec(c.specKey)?.name ?? 'TBD', from: end(p, a, pa), to: end(p, b, pb), fromId: a.id, toId: b.id })
  }
  if (opts.unwired) {
    const used = new Set(p.cables.flatMap((c) => [addrKey(c.from), addrKey(c.to)]))
    for (const e of p.equipment) for (const port of e.product.ports) {
      if (used.has(`${e.id}/${port.id}`)) continue
      rows.push({ key: `${e.id}/${port.id}`, cable: null, label: '', system: portDomain(port), type: '', from: end(p, e, port), to: null, fromId: e.id, toId: null })
    }
  }
  // Room by room, then device and port – the way a crew walks the job.
  return rows.sort((x, y) => nat(x.from.room, y.from.room) || nat(x.from.tag, y.from.tag) || nat(x.from.port, y.from.port) || nat(x.label, y.label))
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const yes = (b?: boolean) => (b ? 'Yes' : '')

export const PULL_HEAD = () => ['Cable', 'System', 'Cable Type', `Length (${longUnit()})`,
  'From Room', 'From Rack', 'From Device', 'From Model', 'From Port', 'From Connector',
  'To Room', 'To Rack', 'To Device', 'To Model', 'To Port', 'To Connector',
  'Pathway', 'Pulled', 'Terminated', 'Tested', 'Notes']

export function pullCells(r: PullRow): string[] {
  const c = r.cable
  const e = (x: PullEnd | null) => (x ? [x.room, x.rack, x.tag, x.device, x.port, x.connector] : ['', '', '', '', '', ''])
  return [r.label || (c ? '' : 'UNWIRED'), r.system ? DOMAINS[r.system].name : '', r.type, c?.lengthMeters == null ? '' : String(Number(toLong(c.lengthMeters).toFixed(1))),
    ...e(r.from), ...e(r.to), c?.pull?.pathway ?? '', yes(c?.pull?.pulled), yes(c?.pull?.terminated), yes(c?.pull?.tested), c?.notes ?? '']
}

export function pullScheduleCSV(p: Project, opts: { unwired?: boolean } = {}): string {
  return [PULL_HEAD().map(csvCell).join(','), ...pullRows(p, opts).map((r) => pullCells(r).map(csvCell).join(','))].join('\n')
}

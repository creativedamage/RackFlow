// Cable schedule: one row per cable, bulk renumbering by system, CSV export.

import { longUnit, toLong } from './units'
import { cableRule } from './numbering'
import { cableSpec } from './cables'
import { addrKey, type Cable, type CableId, type Project } from './model'
import { CABLE_PREFIX, portDomain, resolve } from './project'
import { DOMAINS, SIGNALS, type SignalDomain } from './signals'
import { validateCable } from './validation/validator'

export interface CableRow {
  cable: Cable
  system: SignalDomain | null
  fromTag: string
  fromPort: string
  toTag: string
  toPort: string
  signal: string
  cableType: string
  severity: 'error' | 'warning' | 'info' | null
  message: string
}

/** The system (video, audio, …) a cable belongs to: its signal, else its ports' domain. */
export function cableSystem(p: Project, c: Cable): SignalDomain | null {
  const v = validateCable(p, c)
  if (v.signal) return SIGNALS[v.signal].domain
  const a = resolve(p, c.from), b = resolve(p, c.to)
  return (a && portDomain(a.port)) ?? (b && portDomain(b.port)) ?? null
}

export function cableRows(p: Project): CableRow[] {
  return p.cables.map((cable) => {
    const v = validateCable(p, cable)
    const a = resolve(p, cable.from), b = resolve(p, cable.to)
    const worst = v.issues.find((i) => i.severity === 'error') ?? v.issues.find((i) => i.severity === 'warning') ?? null
    const system = v.signal ? SIGNALS[v.signal].domain : (a && portDomain(a.port)) ?? (b && portDomain(b.port)) ?? null
    return {
      cable, system,
      fromTag: a?.equipment.tag ?? '?', fromPort: a?.port.label ?? '?',
      toTag: b?.equipment.tag ?? '?', toPort: b?.port.label ?? '?',
      signal: v.signal ? SIGNALS[v.signal].name : '',
      cableType: cableSpec(cable.specKey)?.name ?? '',
      severity: worst ? worst.severity as CableRow['severity'] : null,
      message: worst?.message ?? '',
    }
  })
}

export interface NumberScheme { prefix: string; start: number; digits: number }
export type RenumberOrder = 'diagram' | 'from' | 'to' | 'label'

/** Renumber schemes per system – from the project's numbering standard when given. */
export const defaultSchemes = (p?: Project): Record<SignalDomain, NumberScheme> =>
  Object.fromEntries((Object.keys(DOMAINS) as SignalDomain[]).map((d) => {
    const r = p ? cableRule(p, d) : { prefix: CABLE_PREFIX[d], start: 1, digits: 4 }
    return [d, { prefix: r.prefix, start: r.start, digits: r.digits }]
  })) as Record<SignalDomain, NumberScheme>

const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * Renumbers cables system by system (V-0001…, A-0001…). Only `ids` are touched
 * (all cables when omitted); numbers still used by cables outside the set are skipped
 * so labels stay unique. Cables with no system use `other`.
 */
export function renumberCables(p: Project, opts: {
  ids?: Set<CableId>
  schemes: Partial<Record<SignalDomain, NumberScheme>>
  other?: NumberScheme
  order?: RenumberOrder
  separator?: string
  systems?: Set<SignalDomain | 'other'>
}): number {
  const sep = opts.separator ?? '-'
  const rows = cableRows(p)
  const rowOf = new Map(rows.map((r) => [r.cable.id, r]))
  const portIndex = (c: Cable, side: 'from' | 'to') => {
    const addr = c[side]
    const eq = p.equipment.find((e) => e.id === addr.equipment)
    return eq ? eq.product.ports.findIndex((x) => x.id === addr.port) : 0
  }
  const sortKey = (c: Cable): [string, number] => {
    const r = rowOf.get(c.id)!
    switch (opts.order ?? 'diagram') {
      case 'from': return [r.fromTag, portIndex(c, 'from')]
      case 'to': return [r.toTag, portIndex(c, 'to')]
      case 'label': return [c.label, 0]
      default: return ['', p.cables.indexOf(c)]
    }
  }
  const targets = p.cables.filter((c) => !opts.ids || opts.ids.has(c.id))
  const groups = new Map<SignalDomain | 'other', Cable[]>()
  for (const c of targets) {
    const sys = rowOf.get(c.id)?.system ?? 'other'
    if (opts.systems && !opts.systems.has(sys)) continue
    groups.set(sys, [...(groups.get(sys) ?? []), c])
  }
  const changing = new Set([...groups.values()].flat().map((c) => c.id))
  const keep = new Set(p.cables.filter((c) => !changing.has(c.id)).map((c) => c.label))
  let n = 0
  for (const [sys, cables] of groups) {
    const scheme = sys === 'other' ? opts.other ?? { prefix: 'X', start: 1, digits: 4 } : opts.schemes[sys] ?? { prefix: CABLE_PREFIX[sys], start: 1, digits: 4 }
    cables.sort((a, b) => { const [ka, ia] = sortKey(a), [kb, ib] = sortKey(b); return nat(ka, kb) || ia - ib })
    let k = scheme.start
    for (const c of cables) {
      let label: string
      do { label = `${scheme.prefix}${scheme.prefix ? sep : ''}${String(k++).padStart(scheme.digits, '0')}` } while (keep.has(label))
      keep.add(label)
      if (c.label !== label) { c.label = label; n++ }
    }
  }
  return n
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export function cablesToCSV(p: Project): string {
  const head = ['Label', 'System', 'From', 'From Port', 'To', 'To Port', 'Signal', 'Cable Type', `Length (${longUnit()})`, 'Notes', 'Status']
  const lines = cableRows(p).map((r) => [r.cable.label, r.system ? DOMAINS[r.system].name : '', r.fromTag, r.fromPort, r.toTag, r.toPort, r.signal, r.cableType,
    r.cable.lengthMeters == null ? '' : Number(toLong(r.cable.lengthMeters).toFixed(1)), r.cable.notes, r.message].map(csvCell).join(','))
  return [head.join(','), ...lines].join('\n')
}

export const cableKey = (c: Cable) => `${addrKey(c.from)}>${addrKey(c.to)}`

import type { Project } from '../model'
import { duplicatePortNumbers } from '../boxports'
import { addrKey } from '../model'
import { staleCells } from '../patchbay/binder'
import { isPowerPort } from '../project'
import { RackLayout } from '../rack'
import { circuitLoads, circuitName, isPowerSource } from '../power'
import { sortIssues, type ValidationIssue } from './issues'
import { validateCable } from './validator'

/** Whole-document design-rule check. Pure; the renderer runs it debounced. */
export function audit(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = []

  for (const cable of p.cables) {
    out.push(...validateCable(p, cable).issues)
    if (!cable.specKey) out.push({ rule: 'cable-tbd', severity: 'info', message: `${cable.label}: cable type not chosen.`, subject: { kind: 'cable', id: cable.id } })
  }

  const dupes = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
    return [...m.entries()].filter(([, v]) => v.length > 1)
  }
  for (const [tag, items] of dupes(p.equipment, (e) => e.tag))
    out.push({ rule: 'dup-tag', severity: 'error', message: `Tag ${tag} is used by ${items.length} devices.`, subject: { kind: 'equipment', id: items[0].id } })
  for (const [label, items] of dupes(p.cables, (c) => c.label))
    out.push({ rule: 'dup-cable', severity: 'error', message: `Cable label ${label} is used ${items.length} times.`, subject: { kind: 'cable', id: items[0].id } })

  for (const d of duplicatePortNumbers(p))
    out.push({ rule: 'dup-port-number', severity: 'error', message: `Port number ${d.number} is used ${d.where.length} times (${[...new Set(d.where.map((w) => w.eq.tag))].join(', ')}).`, subject: { kind: 'equipment', id: d.where[1].eq.id } })

  const connected = new Set(p.cables.flatMap((c) => [addrKey(c.from), addrKey(c.to)]))
  for (const eq of p.equipment) {
    if (!eq.product.power.poweredByPoE) {
      const inlets = eq.product.ports.filter((x) => isPowerPort(x) && x.direction === 'input')
      if (inlets.length && !inlets.some((x) => connected.has(`${eq.id}/${x.id}`)))
        out.push({ rule: 'unpowered', severity: 'warning', message: `${eq.tag} has no power connection.`, subject: { kind: 'equipment', id: eq.id } })
    }
    if (eq.rackPlacement && eq.product.physical.rackUnits == null)
      out.push({ rule: 'not-rackable', severity: 'error', message: `${eq.tag} is placed in a rack but is not rack-mountable.`, subject: { kind: 'equipment', id: eq.id } })
  }

  // Building power: circuit loading, and devices that never reach a source.
  const loads = circuitLoads(p)
  for (const l of loads) {
    if (!l.rating) continue
    const where = circuitName(l.source) ? ` (${circuitName(l.source)})` : ''
    const subject = { kind: 'equipment' as const, id: l.source.id }
    const pct = Math.round((l.maxWatts / l.rating.ratedWatts) * 100)
    if (l.maxWatts > l.rating.ratedWatts)
      out.push({ rule: 'circuit-overload', severity: 'error', subject,
        message: `${l.source.tag}${where}: connected load ${l.maxWatts.toLocaleString()} W exceeds the ${l.rating.amps} A breaker (${l.rating.ratedWatts.toLocaleString()} W, ${pct}%).`,
        suggestion: 'Move loads to another circuit or use a higher-rated feed.' })
    else if (l.maxWatts > l.rating.continuousWatts)
      out.push({ rule: 'circuit-continuous', severity: 'warning', subject,
        message: `${l.source.tag}${where}: ${l.maxWatts.toLocaleString()} W is ${pct}% of the ${l.rating.amps} A breaker, over the ${Math.round(l.rating.factor * 100)}% continuous limit (${l.rating.continuousWatts.toLocaleString()} W).`,
        suggestion: 'Continuous loads should stay under 80% of the breaker rating.' })
  }
  if (loads.length) {
    const fed = new Set(loads.flatMap((l) => l.devices.map((d) => d.id)))
    for (const eq of p.equipment) {
      if (isPowerSource(eq) || eq.product.power.poweredByPoE || fed.has(eq.id)) continue
      const inlets = eq.product.ports.filter((x) => isPowerPort(x) && x.direction === 'input')
      if (inlets.length && inlets.some((x) => connected.has(`${eq.id}/${x.id}`)))
        out.push({ rule: 'no-building-power', severity: 'info', message: `${eq.tag} does not trace back to building power.`, subject: { kind: 'equipment', id: eq.id } })
    }
  }

  for (const r of p.racks) out.push(...(RackLayout.of(p, r.id)?.validate() ?? []))

  for (const bay of p.patchBays) {
    const n = staleCells(bay, p).length
    if (n) out.push({ rule: 'patch-stale', severity: 'info', message: `${bay.name}: ${n} label(s) differ from current routing.`, suggestion: 'Use “Refresh from Wiring”.', subject: { kind: 'equipment', id: bay.equipment } })
  }
  return sortIssues(out)
}

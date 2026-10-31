// Numbering standards: how device tags (PB-001, DSP-01) and cable labels
// (A-0001) are built – per equipment category and per signal system – so a
// project follows a company standard. A standard can be saved by name and
// loaded into other projects.

import { CATEGORIES, type EquipmentCategory, type Project } from './model'
import type { SignalDomain } from './signals'

export interface NumberRule { prefix: string; separator: string; digits: number; start: number }
export type CableSystem = SignalDomain | 'other'

export interface NumberingStandard {
  name: string
  /** Defaults for every category (prefix comes from the category unless overridden). */
  tagDefaults: Omit<NumberRule, 'prefix'>
  tags: Partial<Record<EquipmentCategory, Partial<NumberRule>>>
  cableDefaults: Omit<NumberRule, 'prefix'>
  cables: Partial<Record<CableSystem, Partial<NumberRule>>>
}

export const CABLE_PREFIXES: Record<CableSystem, string> = { video: 'V', audio: 'A', network: 'N', control: 'C', lighting: 'L', rf: 'RF', usb: 'U', power: 'P', other: 'X' }

/** RackFlow's built-in scheme (what projects without a standard use). */
export const defaultNumberingStandard = (): NumberingStandard => ({
  name: 'RackFlow default',
  tagDefaults: { separator: '-', digits: 2, start: 1 },
  tags: {},
  cableDefaults: { separator: '-', digits: 4, start: 1 },
  cables: {},
})

export const numberingOf = (p: Project): NumberingStandard => p.numbering ?? defaultNumberingStandard()

export function tagRule(p: Project, cat: EquipmentCategory): NumberRule {
  const s = numberingOf(p)
  return { prefix: CATEGORIES[cat]?.tag ?? 'DEV', ...s.tagDefaults, ...stripEmpty(s.tags[cat]) }
}

/** `fallbackPrefix` is the prefix a cable would get without a standard (e.g. from its cable type). */
export function cableRule(p: Project, sys: CableSystem, fallbackPrefix?: string): NumberRule {
  const s = numberingOf(p)
  const own = stripEmpty(s.cables[sys])
  return { prefix: fallbackPrefix ?? CABLE_PREFIXES[sys], ...s.cableDefaults, ...own }
}

const stripEmpty = <T extends object>(o: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v)))) as Partial<T>

export const formatNumber = (r: NumberRule, n: number) => `${r.prefix}${r.prefix ? r.separator : ''}${String(n).padStart(Math.max(1, r.digits), '0')}`

/** First free number for a rule, given labels already used. */
export function nextNumber(r: NumberRule, used: Set<string>): string {
  for (let n = r.start; ; n++) { const t = formatNumber(r, n); if (!used.has(t)) return t }
}

const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/**
 * Re-tags devices with the standard, category by category, in the order they
 * read on the diagram (top-to-bottom, left-to-right). Patch bays named after
 * their tag follow it. Returns how many tags changed.
 */
export function renumberDevices(p: Project, opts: { ids?: Set<string>; categories?: Set<EquipmentCategory> } = {}): number {
  const targets = p.equipment.filter((e) => (!opts.ids || opts.ids.has(e.id)) && (!opts.categories || opts.categories.has(e.product.category)))
  const changing = new Set(targets.map((e) => e.id as string))
  const keep = new Set(p.equipment.filter((e) => !changing.has(e.id)).map((e) => e.tag))
  const byCat = new Map<EquipmentCategory, typeof targets>()
  for (const e of targets) byCat.set(e.product.category, [...(byCat.get(e.product.category) ?? []), e])
  let n = 0
  for (const [cat, list] of byCat) {
    const r = tagRule(p, cat)
    list.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || nat(a.tag, b.tag))
    let k = r.start
    for (const e of list) {
      let t: string
      do { t = formatNumber(r, k++) } while (keep.has(t))
      keep.add(t)
      if (e.tag !== t) {
        for (const b of p.patchBays) if (b.equipment === e.id && b.name === e.tag) b.name = t
        e.tag = t
        n++
      }
    }
  }
  return n
}

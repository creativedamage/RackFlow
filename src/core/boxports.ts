// Box port numbers: every jack on the project's wall boxes, gang plates, floor
// boxes and rack connector panels gets a project-wide unique number per type –
// WP-001 has mic lines M1–M10, WP-002 carries on at M11–M20. Types that share a
// prefix share one sequence. The number becomes the port's label (rear tie
// lines mirror it: "M11 (rear)"), so it shows on the cards, drawings, schedule
// and labels.

import type { EquipmentCategory, EquipmentInstance, PortTemplate, ProductDefinition, Project } from './model'
import { explodeInserts } from './platelayout'
import { applyTies } from './multipin'
import { numberingOf } from './numbering'
import { SIGNALS } from './signals'

export type PortClass = 'mic' | 'line' | 'multipin' | 'speaker' | 'network' | 'fiber' | 'video' | 'usb' | 'dmx' | 'control' | 'power'
export interface PortRule { prefix: string; separator: string; digits: number; start: number; off?: boolean }
export interface BoxPortNumbering {
  on: boolean
  rules: Partial<Record<PortClass, Partial<PortRule>>>
}

export const PORT_CLASSES: { key: PortClass; name: string; prefix: string; off?: boolean }[] = [
  { key: 'mic', name: 'Audio inputs (mic / line from the room)', prefix: 'M' },
  { key: 'line', name: 'Audio outputs (line / returns to the room)', prefix: 'L' },
  { key: 'multipin', name: 'Multipins (W1, W2, Amphenol…)', prefix: 'MP' },
  { key: 'speaker', name: 'Speaker', prefix: 'S' },
  { key: 'network', name: 'Network (RJ45 / etherCON)', prefix: 'D' },
  { key: 'fiber', name: 'Fiber', prefix: 'F' },
  { key: 'video', name: 'Video (HDMI, SDI, DP…)', prefix: 'V' },
  { key: 'usb', name: 'USB', prefix: 'U' },
  { key: 'dmx', name: 'DMX / lighting', prefix: 'DMX' },
  { key: 'control', name: 'Control (RS-232, GPIO…)', prefix: 'C' },
  { key: 'power', name: 'Power outlets', prefix: 'P', off: true },
]

export const BOX_CATEGORIES: EquipmentCategory[] = ['wallBox', 'wallPlate', 'floorBox', 'connectorPanel']
export const isBox = (e: EquipmentInstance) => BOX_CATEGORIES.includes(e.product.category)

const MULTI = new Set(['whirlwindW1', 'whirlwindW2', 'socapex19', 'amphenol57', 'edac56', 'edac90', 'elcoE3'])
const FIBER = new Set(['lcDuplex', 'scDuplex', 'mdc', 'mpo8', 'mpo12', 'mpo24', 'opticalCON'])

/** What kind of jack a box port is (null for rear tie lines and anything we don't number). */
export function portClass(p: PortTemplate): PortClass | null {
  if (p.face === 'rear') return null
  const d = p.signals[0] ? SIGNALS[p.signals[0]]?.domain : undefined
  if (MULTI.has(p.connector)) return 'multipin'
  if (FIBER.has(p.connector)) return 'fiber'
  switch (d) {
    case 'audio':
      if (p.signals.some((s) => s.startsWith('speaker'))) return 'speaker'
      return p.gender === 'male' || p.direction === 'output' ? 'line' : 'mic'
    case 'network': return 'network'
    case 'video': return 'video'
    case 'usb': return 'usb'
    case 'lighting': return 'dmx'
    case 'control': return 'control'
    case 'power': return 'power'
    default: return null
  }
}

export const boxNumberingOf = (p: Project): BoxPortNumbering => numberingOf(p).boxPorts ?? { on: false, rules: {} }

export function portRule(p: Project, c: PortClass): PortRule {
  const def = PORT_CLASSES.find((x) => x.key === c)!
  const own = Object.fromEntries(Object.entries(boxNumberingOf(p).rules[c] ?? {}).filter(([, v]) => v !== undefined && v !== '')) as Partial<PortRule>
  return { prefix: def.prefix, separator: '', digits: 1, start: 1, off: def.off, ...own }
}

export const formatPortNumber = (r: PortRule, n: number) => `${r.prefix}${r.prefix ? r.separator : ''}${String(n).padStart(Math.max(1, r.digits), '0')}`

/** The number part of "M17" for a rule with prefix M (null when it doesn't follow the rule). */
function seqNumber(r: PortRule, num: string): number | null {
  const pre = r.prefix ? r.prefix + r.separator : ''
  if (!num.startsWith(pre)) return null
  const rest = num.slice(pre.length)
  return /^\d+$/.test(rest) ? parseInt(rest, 10) : null
}

/** Sequence key: same prefix + separator = same sequence (so "M" can cover mic and line). */
const seqKey = (r: PortRule) => `${r.prefix}\u0000${r.separator}`

const nat = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** Boxes in numbering order: by tag (WP-001, WP-002 …). */
const boxesInOrder = (p: Project) => p.equipment.filter(isBox).sort((a, b) => nat(a.tag, b.tag))

/** Writes each numbered port's label (and its rear tie line's) from `portNumbers`. */
export function applyPortLabels(e: EquipmentInstance) {
  const nums = e.portNumbers ?? {}
  e.portBaseLabels ??= {}
  for (const port of e.product.ports) {
    const frontId = port.face === 'rear' ? port.id.replace(/\.r$/, '.f') : port.id
    const num = nums[frontId]
    const base = e.portBaseLabels[port.id]
    if (!num) {
      if (base != null) { port.label = base; delete e.portBaseLabels[port.id] }
      continue
    }
    if (base == null) e.portBaseLabels[port.id] = port.label
    // One name per jack: the number replaces whatever the jack was called.
    port.label = port.face === 'rear' ? `${num} (rear)` : num
  }
  // The panel itself (designer, face drawing, engraving) carries the same name.
  if (e.product.plate) {
    const spec = explodeInserts(e.product.plate)
    for (const ins of spec.inserts) {
      const key = `plate:${ins.pid}`, num = nums[`${ins.pid}.f`]
      if (num) {
        if (!(key in e.portBaseLabels)) e.portBaseLabels[key] = ins.label ?? ''
        ins.label = num
      } else if (key in e.portBaseLabels) {
        ins.label = e.portBaseLabels[key] || undefined
        delete e.portBaseLabels[key]
      }
    }
    e.product.plate = spec
  }
  if (!Object.keys(e.portBaseLabels).length) delete e.portBaseLabels
  applyTies(e.product)
}

/**
 * Numbers box ports. `all`: renumber every box from the start, box by box in
 * tag order. Otherwise only ports without a number get the next free one.
 * Returns how many ports got a different number. When renumbering everything,
 * locked numbers stay and the unlocked jacks after one carry on from it.
 */
export function numberBoxPorts(p: Project, opts: { all?: boolean; ids?: string[] } = {}): number {
  if (!boxNumberingOf(p).on) return 0
  const boxes = boxesInOrder(p).filter((e) => !opts.ids || opts.ids.includes(e.id))
  const used = new Map<string, Set<string>>()
  const counter = new Map<string, number>()
  const useOf = (k: string) => { if (!used.has(k)) used.set(k, new Set()); return used.get(k)! }
  // Keep what's already numbered anywhere in the project – or, when renumbering
  // everything, just the numbers set by hand (locked).
  for (const e of p.equipment.filter(isBox)) for (const port of e.product.ports) {
    const c = portClass(port), num = e.portNumbers?.[port.id]
    if (c && num && (!opts.all || e.portLocks?.[port.id])) useOf(seqKey(portRule(p, c))).add(num)
  }
  let n = 0
  for (const e of opts.all ? boxesInOrder(p) : boxes) {
    const next: Record<string, string> = opts.all
      ? Object.fromEntries(Object.entries(e.portNumbers ?? {}).filter(([k]) => e.portLocks?.[k]))
      : { ...(e.portNumbers ?? {}) }
    for (const port of e.product.ports) {
      const c = portClass(port)
      if (!c) continue
      const r = portRule(p, c)
      if (r.off) { delete next[port.id]; continue }
      const k = seqKey(r)
      if (next[port.id]) {
        // A number you set by hand: the jacks after it carry on from it (M17 → M18, M19…).
        if (opts.all) { const v = seqNumber(r, next[port.id]); if (v != null) counter.set(k, v + 1) }
        continue
      }
      const u = useOf(k)
      let i = counter.get(k) ?? r.start, t: string
      do { t = formatPortNumber(r, i++) } while (u.has(t))
      counter.set(k, i)
      u.add(t); next[port.id] = t
      if (e.portNumbers?.[port.id] !== t) n++
    }
    e.portNumbers = Object.keys(next).length ? next : undefined
    applyPortLabels(e)
  }
  return n
}

/** After a box's product is rebuilt (designer edit): keep numbers of ports that still exist, number new ones. */
export function refreshBoxPorts(p: Project, e: EquipmentInstance) {
  // The rebuilt product brings fresh port labels; keep the panel's original jack names for "turn numbering off".
  const keep = Object.entries(e.portBaseLabels ?? {}).filter(([k]) => k.startsWith('plate:'))
  e.portBaseLabels = keep.length ? Object.fromEntries(keep) : undefined
  if (e.portNumbers) {
    const ids = new Set(e.product.ports.map((x) => x.id))
    e.portNumbers = Object.fromEntries(Object.entries(e.portNumbers).filter(([k]) => ids.has(k)))
  }
  if (isBox(e) && boxNumberingOf(p).on) numberBoxPorts(p, { ids: [e.id] })
  else applyPortLabels(e)
}

/**
 * Sets one jack's number by hand (and locks it so Renumber keeps it). An empty
 * value takes the number off and unlocks it.
 */
export function setPortNumber(p: Project, eqId: string, portId: string, value: string) {
  const e = p.equipment.find((x) => x.id === eqId)
  if (!e) return
  const v = value.trim()
  const nums = { ...(e.portNumbers ?? {}) }, locks = { ...(e.portLocks ?? {}) }
  if (v) { nums[portId] = v; locks[portId] = true } else { delete nums[portId]; delete locks[portId] }
  e.portNumbers = Object.keys(nums).length ? nums : undefined
  e.portLocks = Object.keys(locks).length ? locks : undefined
  applyPortLabels(e)
}

export function setPortLock(p: Project, eqId: string, portId: string, locked: boolean) {
  const e = p.equipment.find((x) => x.id === eqId)
  if (!e || !e.portNumbers?.[portId]) return
  const locks = { ...(e.portLocks ?? {}) }
  if (locked) locks[portId] = true; else delete locks[portId]
  e.portLocks = Object.keys(locks).length ? locks : undefined
}

/** Splits "M17" into prefix + number for filling a run (M17, M18, M19…). */
export function numberSeries(first: string, count: number): string[] {
  const m = /^(.*?)(\d+)$/.exec(first.trim())
  if (!m) return Array.from({ length: count }, (_, i) => (i === 0 ? first.trim() : `${first.trim()}${i + 1}`))
  const width = m[2].length > 1 && m[2].startsWith('0') ? m[2].length : 1
  return Array.from({ length: count }, (_, i) => `${m[1]}${String(parseInt(m[2], 10) + i).padStart(width, '0')}`)
}

/** One row of the Box Ports schedule: a numbered (or numberable) jack. */
export interface BoxPortRow {
  key: string
  eq: EquipmentInstance
  port: PortTemplate
  cls: PortClass
  number: string
  locked: boolean
  /** The jack's own name (from the box designer). */
  jack: string
  /** What's plugged into the front, and where the rear tie line goes. */
  front: string
  rear: string
  /** Multipin this jack is tied to. */
  multipin: string
  duplicate: boolean
}

export function boxPortRows(p: Project): BoxPortRow[] {
  const byId = new Map(p.equipment.map((e) => [e.id as string, e]))
  const other = (eqId: string, portId: string) => {
    const c = p.cables.find((x) => (x.from.equipment === eqId && x.from.port === portId) || (x.to.equipment === eqId && x.to.port === portId))
    if (!c) return ''
    const o = c.from.equipment === eqId && c.from.port === portId ? c.to : c.from
    const oe = byId.get(o.equipment)
    return oe ? `${oe.tag} ${oe.product.ports.find((q) => q.id === o.port)?.label ?? o.port}` : ''
  }
  const dup = new Set(duplicatePortNumbers(p).flatMap((d) => d.where.map((w) => `${w.eq.id}/${w.port}`)))
  const rows: BoxPortRow[] = []
  for (const e of boxesInOrder(p)) {
    const ins = new Map((e.product.plate?.inserts ?? []).map((x) => [`${x.pid}.f`, x]))
    for (const port of e.product.ports) {
      const cls = portClass(port)
      if (!cls) continue
      const tie = ins.get(port.id)?.tie
      const mp = tie ? e.product.ports.find((q) => q.id === `${tie}.f`) : undefined
      rows.push({
        key: `${e.id}/${port.id}`, eq: e, port, cls, number: e.portNumbers?.[port.id] ?? '', locked: !!e.portLocks?.[port.id],
        jack: e.portBaseLabels?.[port.id] ?? port.label,
        front: other(e.id, port.id), rear: other(e.id, port.id.replace(/\.f$/, '.r')),
        multipin: mp ? mp.label.split(' · ')[0] : '', duplicate: dup.has(`${e.id}/${port.id}`),
      })
    }
  }
  return rows
}

/** Takes the numbers off every box port (labels go back to the jack names). */
export function clearBoxPortNumbers(p: Project): number {
  let n = 0
  for (const e of p.equipment) if (e.portNumbers) { n += Object.keys(e.portNumbers).length; e.portNumbers = undefined; e.portLocks = undefined; applyPortLabels(e) }
  return n
}

/** Numbers used more than once across the project's boxes. */
export function duplicatePortNumbers(p: Project): { number: string; where: { eq: EquipmentInstance; port: string }[] }[] {
  const m = new Map<string, { eq: EquipmentInstance; port: string }[]>()
  for (const e of p.equipment.filter(isBox)) for (const [port, num] of Object.entries(e.portNumbers ?? {})) m.set(num, [...(m.get(num) ?? []), { eq: e, port }])
  return [...m.entries()].filter(([, w]) => w.length > 1).map(([number, where]) => ({ number, where }))
}

/** The product as drawn on faces – box numbers are written into the plate itself, so this is just the product. */
export const faceProduct = (e: EquipmentInstance): ProductDefinition => e.product

/**
 * A placed box's product with its project port numbers taken back out – what
 * goes into the library, so other projects don't inherit this one's numbers.
 */
export function withoutPortNumbers(e: EquipmentInstance, prod: ProductDefinition): ProductDefinition {
  const base = e.portBaseLabels ?? {}, nums = e.portNumbers ?? {}
  if (!Object.keys(nums).length) return prod
  const frontOf = (id: string) => id.replace(/\.r$/, '.f')
  return {
    ...prod,
    ports: prod.ports.map((x) => (nums[frontOf(x.id)] && base[x.id] != null && x.label.startsWith(nums[frontOf(x.id)]) ? { ...x, label: base[x.id] } : x)),
    plate: prod.plate && { ...prod.plate, inserts: prod.plate.inserts.map((ins) => (ins.pid && nums[`${ins.pid}.f`] === ins.label && `plate:${ins.pid}` in base ? { ...ins, label: base[`plate:${ins.pid}`] || undefined } : ins)) },
  }
}

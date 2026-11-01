// Box port numbers: every jack on the project's wall boxes, gang plates, floor
// boxes and rack connector panels gets a project-wide unique number per type –
// WP-001 has mic lines M1–M10, WP-002 carries on at M11–M20. Types that share a
// prefix share one sequence. The number becomes the port's label (rear tie
// lines mirror it: "M11 (rear)"), so it shows on the cards, drawings, schedule
// and labels.

import type { EquipmentCategory, EquipmentInstance, PortTemplate, ProductDefinition, Project } from './model'
import { explodeInserts } from './platelayout'
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

const MULTI = new Set(['whirlwindW1', 'whirlwindW2', 'socapex19', 'amphenol57', 'edac56', 'edac90'])
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
}

/**
 * Numbers box ports. `all`: renumber every box from the start, box by box in
 * tag order. Otherwise only ports without a number get the next free one.
 * Returns how many ports were (re)numbered.
 */
export function numberBoxPorts(p: Project, opts: { all?: boolean; ids?: string[] } = {}): number {
  if (!boxNumberingOf(p).on) return 0
  const boxes = boxesInOrder(p).filter((e) => !opts.ids || opts.ids.includes(e.id))
  const used = new Map<string, Set<string>>()
  const counter = new Map<string, number>()
  const useOf = (k: string) => { if (!used.has(k)) used.set(k, new Set()); return used.get(k)! }
  if (!opts.all) {
    // Keep what's already numbered anywhere in the project.
    for (const e of p.equipment.filter(isBox)) for (const port of e.product.ports) {
      const c = portClass(port), num = e.portNumbers?.[port.id]
      if (c && num) useOf(seqKey(portRule(p, c))).add(num)
    }
  }
  let n = 0
  for (const e of opts.all ? boxesInOrder(p) : boxes) {
    const next: Record<string, string> = opts.all ? {} : { ...(e.portNumbers ?? {}) }
    for (const port of e.product.ports) {
      const c = portClass(port)
      if (!c) continue
      const r = portRule(p, c)
      if (r.off) { delete next[port.id]; continue }
      if (next[port.id]) continue
      const k = seqKey(r), u = useOf(k)
      let i = counter.get(k) ?? r.start, t: string
      do { t = formatPortNumber(r, i++) } while (u.has(t))
      counter.set(k, i)
      u.add(t); next[port.id] = t; n++
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

/** Takes the numbers off every box port (labels go back to the jack names). */
export function clearBoxPortNumbers(p: Project): number {
  let n = 0
  for (const e of p.equipment) if (e.portNumbers) { n += Object.keys(e.portNumbers).length; e.portNumbers = undefined; applyPortLabels(e) }
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

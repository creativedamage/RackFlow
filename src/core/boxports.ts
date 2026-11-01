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

/** The jack's own name from the box designer (kept after the number), e.g. "Podium". */
function customName(e: EquipmentInstance, frontId: string): string | undefined {
  // Same id scheme as platePorts(): an insert's own pid, else module.n.
  const used = new Map<string, number>()
  for (const ins of e.product.plate?.inserts ?? []) {
    for (let i = 0; i < Math.max(1, ins.count); i++) {
      const n = (used.get(ins.module) ?? 0) + 1
      used.set(ins.module, n)
      const id = ins.pid && ins.count === 1 ? ins.pid : `${ins.module}.${n}`
      if (`${id}.f` === frontId) return ins.label?.trim() || undefined
    }
  }
  return undefined
}

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
    const own = customName(e, frontId)
    const front = own ? `${num} ${own}` : num
    port.label = port.face === 'rear' ? `${front} (rear)` : front
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
  e.portBaseLabels = undefined
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

const faceCache = new WeakMap<EquipmentInstance, ProductDefinition>()
/** The device's product with its box port numbers written on the face drawing's jack labels. */
export function faceProduct(e: EquipmentInstance): ProductDefinition {
  if (!e.portNumbers || !e.product.plate) return e.product
  const hit = faceCache.get(e)
  if (hit) return hit
  const spec = explodeInserts(e.product.plate)
  const nums = e.portNumbers
  const out: ProductDefinition = { ...e.product, plate: { ...spec, inserts: spec.inserts.map((ins) => {
    const num = nums[`${ins.pid}.f`]
    if (!num) return ins
    const own = customName(e, `${ins.pid}.f`)
    return { ...ins, label: own ? `${num} ${own}` : num }
  }) } }
  if (Object.isFrozen(e)) faceCache.set(e, out)
  return out
}

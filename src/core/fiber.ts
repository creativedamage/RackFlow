// Modular fiber enclosures (FS.com FHD-style): a 1U / 2U / 4U rack enclosure
// with slots, each holding a cassette (MTP/MPO trunk at the back, LC / SC /
// MTP-8 / MDC at the front) or an adapter panel (front = back). Every slot can
// carry a custom engraving, shown on the diagram card, the rack elevation and
// printed drawings.
//
// Module and enclosure data follow FS.com's FHD cassette / enclosure datasheets
// (capacity: 1U = 4, 2U = 8, 4U = 12 cassettes or panels; cassette face
// 1.38" × 4.29"). Check part numbers against the current datasheet when ordering.

import { newId, type PortTemplate, type ProductDefinition } from './model'
import type { ConnectorType, SignalType } from './signals'

export type FiberType = 'OS2' | 'OM4' | 'OM3' | 'OM5'
export const FIBER_TYPES: { value: FiberType; label: string }[] = [
  { value: 'OS2', label: 'OS2 single-mode (yellow)' },
  { value: 'OM4', label: 'OM4 multimode (aqua / violet)' },
  { value: 'OM3', label: 'OM3 multimode (aqua)' },
  { value: 'OM5', label: 'OM5 multimode (lime)' },
]

interface Side { connector: ConnectorType; count: number; name: string }
export interface FiberModuleType {
  key: string
  name: string
  short: string
  fibers: number
  kind: 'cassette' | 'panel'
  front: Side
  /** Cassette trunk connectors at the back; adapter panels pass straight through (rear = front). */
  rear?: Side
  /** FS.com part numbers (OS2 / OM4) for reference. */
  sku?: string
}

const S = (connector: ConnectorType, count: number, name: string): Side => ({ connector, count, name })

export const FIBER_MODULES: FiberModuleType[] = [
  { key: 'mtp12-6lc', name: 'MTP-12 cassette → 6× LC duplex (12F)', short: '12F MTP→LC', fibers: 12, kind: 'cassette', front: S('lcDuplex', 6, 'LC'), rear: S('mpo12', 1, 'MTP-12'), sku: 'FHD #57016 OS2 / #57017 OM4' },
  { key: 'mtp12-6sc', name: 'MTP-12 cassette → 6× SC duplex (12F)', short: '12F MTP→SC', fibers: 12, kind: 'cassette', front: S('scDuplex', 6, 'SC'), rear: S('mpo12', 1, 'MTP-12') },
  { key: 'mtp24-12lc', name: 'MTP-24 cassette → 12× LC duplex (24F)', short: '24F MTP-24→LC', fibers: 24, kind: 'cassette', front: S('lcDuplex', 12, 'LC'), rear: S('mpo24', 1, 'MTP-24'), sku: 'FHD #57023 OS2 / #57024 OM4' },
  { key: '2mtp12-12lc', name: '2× MTP-12 cassette → 12× LC duplex (24F)', short: '24F 2×MTP→LC', fibers: 24, kind: 'cassette', front: S('lcDuplex', 12, 'LC'), rear: S('mpo12', 2, 'MTP-12'), sku: 'FHD #57341 OS2 / #57342 OM4' },
  { key: 'mtp24-3mtp8', name: 'MTP-24 conversion cassette → 3× MTP-8 (24F)', short: '24F → 3× MTP-8', fibers: 24, kind: 'cassette', front: S('mpo8', 3, 'MTP-8'), rear: S('mpo24', 1, 'MTP-24'), sku: 'FHD #167162 OS2' },
  { key: '3mtp12-18lc', name: '3× MTP-12 cassette → 18× LC duplex (36F)', short: '36F 3×MTP→LC', fibers: 36, kind: 'cassette', front: S('lcDuplex', 18, 'LC'), rear: S('mpo12', 3, 'MTP-12'), sku: 'FHD #105333 OS2 / #105335 OM4' },
  { key: '4mtp12-24mdc', name: '4× MTP-12 cassette → 8× 3-port MDC (48F)', short: '48F 4×MTP→MDC', fibers: 48, kind: 'cassette', front: S('mdc', 24, 'MDC'), rear: S('mpo12', 4, 'MTP-12'), sku: 'FHD #147014 OS2' },
  { key: 'lc6', name: 'Adapter panel, 6× LC duplex (12F)', short: '6× LC panel', fibers: 12, kind: 'panel', front: S('lcDuplex', 6, 'LC') },
  { key: 'lc12', name: 'Adapter panel, 12× LC duplex (24F)', short: '12× LC panel', fibers: 24, kind: 'panel', front: S('lcDuplex', 12, 'LC') },
  { key: 'sc6', name: 'Adapter panel, 6× SC duplex (12F)', short: '6× SC panel', fibers: 12, kind: 'panel', front: S('scDuplex', 6, 'SC') },
  { key: 'mtp4', name: 'Adapter panel, 4× MTP/MPO (trunk to trunk)', short: '4× MTP panel', fibers: 48, kind: 'panel', front: S('mpo12', 4, 'MTP') },
]
export const fiberModule = (key: string | null | undefined) => FIBER_MODULES.find((m) => m.key === key)

export interface FiberEnclosureType { key: string; name: string; maker: string; ru: number; cols: number; rows: number; sku?: string }
export const FIBER_ENCLOSURES: FiberEnclosureType[] = [
  { key: 'fhd-1u', name: 'FHD 1U modular enclosure (4 slots)', maker: 'FS.com', ru: 1, cols: 4, rows: 1 },
  { key: 'fhd-2u', name: 'FHD 2U modular enclosure (8 slots)', maker: 'FS.com', ru: 2, cols: 4, rows: 2 },
  { key: 'fhd-4u', name: 'FHD 4U modular enclosure (12 slots)', maker: 'FS.com', ru: 4, cols: 4, rows: 3 },
  { key: 'gen-1u-2', name: '1U modular enclosure (2 slots)', maker: 'Generic', ru: 1, cols: 2, rows: 1 },
  { key: 'gen-1u-3', name: '1U modular enclosure (3 slots)', maker: 'Generic', ru: 1, cols: 3, rows: 1 },
]
export const fiberEnclosure = (key: string) => FIBER_ENCLOSURES.find((e) => e.key === key) ?? FIBER_ENCLOSURES[0]

export interface FiberSlot { module: string | null; engraving?: string }
export interface FiberSpec { enclosure: string; fiberType: FiberType; slots: FiberSlot[] }

/** Fiber Ethernet / media-over-IP signals. */
const FIBER_SIGNALS: SignalType[] = ['ethernet10G', 'ethernet1G', 'st2110', 'dante', 'ndi', 'aes67']

export const slotName = (s: FiberSlot, i: number) => s.engraving?.trim() || `Slot ${i + 1}`

/** Ports: front adapters on the left of the card, trunks / rear adapters on the right. */
export function fiberPorts(spec: FiberSpec): PortTemplate[] {
  const out: PortTemplate[] = []
  spec.slots.forEach((slot, si) => {
    const m = fiberModule(slot.module)
    if (!m) return
    const base = slotName(slot, si)
    const pre = `s${si + 1}`
    for (let i = 1; i <= m.front.count; i++) {
      out.push({ id: `${pre}.f${i}`, label: `${base} ${m.front.name} ${i}`, connector: m.front.connector, gender: 'female', direction: 'bidirectional', signals: [...FIBER_SIGNALS], group: base, face: 'front', maxConnections: 1 })
      if (!m.rear) out.push({ id: `${pre}.r${i}`, label: `${base} ${m.front.name} ${i} (rear)`, connector: m.front.connector, gender: 'female', direction: 'bidirectional', signals: [...FIBER_SIGNALS], group: base, face: 'rear', maxConnections: 1 })
    }
    if (m.rear) for (let j = 1; j <= m.rear.count; j++)
      out.push({ id: `${pre}.t${j}`, label: `${base} ${m.rear.name}${m.rear.count > 1 ? ` ${j}` : ''} (trunk)`, connector: m.rear.connector, gender: 'female', direction: 'bidirectional', signals: [...FIBER_SIGNALS], group: base, face: 'rear', maxConnections: 1 })
  })
  return out
}

export const newFiberSpec = (enclosure = 'fhd-1u'): FiberSpec => {
  const e = fiberEnclosure(enclosure)
  return { enclosure: e.key, fiberType: 'OS2', slots: Array.from({ length: e.cols * e.rows }, (_, i) => ({ module: i < 2 ? 'mtp12-6lc' : null })) }
}

export function fiberSummary(spec: FiberSpec): string {
  const e = fiberEnclosure(spec.enclosure)
  const used = spec.slots.map((s) => fiberModule(s.module)).filter(Boolean) as FiberModuleType[]
  const fibers = used.reduce((t, m) => t + m.fibers, 0)
  return `${e.name}, ${spec.fiberType}: ${used.length ? used.map((m) => m.short).join(', ') : 'empty'} – ${fibers} fibers`
}

export function makeFiberProduct(spec: FiberSpec, meta: { key?: string; manufacturer?: string; model: string }): ProductDefinition {
  const e = fiberEnclosure(spec.enclosure)
  return {
    key: meta.key ?? `user.fiber.${newId()}`,
    manufacturer: meta.manufacturer?.trim() || e.maker,
    model: meta.model.trim() || e.name,
    summary: fiberSummary(spec),
    category: 'fiberEnclosure',
    tags: ['fiber', 'fibre', 'patch panel', 'enclosure', 'cassette', 'mtp', 'mpo', 'lc', spec.fiberType.toLowerCase(), spec.fiberType === 'OS2' ? 'singlemode' : 'multimode'],
    physical: { rackUnits: e.ru, halfWidth: false, widthMM: 482.6, heightMM: 44.45 * e.ru, depthMM: 300, weightKG: 2.5 * e.ru, mounting: 'rack' },
    power: { acceptedVoltages: [], typicalWatts: 0, maxWatts: 0, publishedBTU: null, efficiency: null, poweredByPoE: false },
    ports: fiberPorts(spec),
    source: 'user',
    revision: 1,
    fiber: structuredClone(spec),
  }
}

// MARK: Drawing (outline only, mm, stroke = currentColor)

const n = (v: number) => Math.round(v * 100) / 100
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** One adapter on the face, centred on (0,0). */
function adapter(c: ConnectorType): { w: number; h: number; svg: string } {
  const L = (d: string) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="0.3"/>`
  const R = (x: number, y: number, w: number, h: number, rx = 0.4) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="none" stroke="currentColor" stroke-width="0.3"/>`
  switch (c) {
    case 'lcDuplex': return { w: 9.6, h: 12.6, svg: R(-4.8, -6.3, 9.6, 12.6, 0.6) + R(-3.6, -5, 3, 4.3) + R(0.6, -5, 3, 4.3) + R(-3.6, 0.7, 3, 4.3) + R(0.6, 0.7, 3, 4.3) }
    case 'scDuplex': return { w: 12.7, h: 25.4, svg: R(-6.35, -12.7, 12.7, 25.4, 0.8) + R(-4.2, -10.6, 8.4, 9.2) + R(-4.2, 1.4, 8.4, 9.2) }
    case 'mdc': return { w: 4.2, h: 12.6, svg: R(-2.1, -6.3, 4.2, 12.6, 0.4) + R(-1.3, -4.5, 2.6, 3.6) + R(-1.3, 0.9, 2.6, 3.6) }
    case 'mpo8': case 'mpo12': case 'mpo24': return { w: 8, h: 14, svg: R(-4, -7, 8, 14, 0.6) + R(-1.6, -5.4, 3.2, 10.8) + L('M -2.6 -6.6 L -2.6 -5.2') }
    default: return { w: 10, h: 12, svg: R(-5, -6, 10, 12) }
  }
}

export interface FiberDrawOpts { /** Skip the rack ears / outline (the rack elevation draws its own). */ bare?: boolean; labels?: boolean }

/** Face size (mm). */
export const fiberFaceSize = (spec: FiberSpec) => ({ w: 482.6, h: 44.45 * fiberEnclosure(spec.enclosure).ru })

/** Inner SVG of the enclosure face: ears, slots, modules with adapters and engraving. */
export function fiberInner(spec: FiberSpec, o: FiberDrawOpts = {}): string {
  const e = fiberEnclosure(spec.enclosure)
  const { w: W, h: H } = fiberFaceSize(spec)
  const out: string[] = []
  const line = (sw: number) => `fill="none" stroke="currentColor" stroke-width="${sw}"`
  if (!o.bare) {
    out.push(`<rect x="0" y="0" width="${W}" height="${n(H)}" rx="0.8" ${line(0.7)}/>`)
    for (const ex of [7.9, W - 7.9]) for (let u = 0; u < e.ru; u++) for (const hy of [6.35, 38.1]) out.push(`<rect x="${n(ex - 3.4)}" y="${n(u * 44.45 + hy - 1.9)}" width="6.8" height="3.8" rx="1.9" ${line(0.35)}/>`)
    out.push(`<line x1="15.9" y1="0" x2="15.9" y2="${n(H)}" ${line(0.2)} stroke-dasharray="1.5 1"/><line x1="${n(W - 15.9)}" y1="0" x2="${n(W - 15.9)}" y2="${n(H)}" ${line(0.2)} stroke-dasharray="1.5 1"/>`)
  }
  // Slot grid inside the ears.
  const x0 = 24, x1 = W - 24, y0 = 3, y1 = H - 3, gap = 2.5
  const sw = (x1 - x0 - gap * (e.cols - 1)) / e.cols, sh = (y1 - y0 - gap * (e.rows - 1)) / e.rows
  spec.slots.slice(0, e.cols * e.rows).forEach((slot, i) => {
    const c = i % e.cols, r = Math.floor(i / e.cols)
    const sx = x0 + c * (sw + gap), sy = y0 + r * (sh + gap)
    const m = fiberModule(slot.module)
    out.push(`<rect x="${n(sx)}" y="${n(sy)}" width="${n(sw)}" height="${n(sh)}" rx="1" ${line(m ? 0.45 : 0.3)}${m ? '' : ' stroke-dasharray="2 1.2"'}/>`)
    // Latches.
    out.push(`<rect x="${n(sx + 1.5)}" y="${n(sy + sh / 2 - 4)}" width="2" height="8" rx="0.8" ${line(0.25)}/><rect x="${n(sx + sw - 3.5)}" y="${n(sy + sh / 2 - 4)}" width="2" height="8" rx="0.8" ${line(0.25)}/>`)
    const engr = slot.engraving?.trim()
    const textH = o.labels === false ? 0 : 4.2
    if (o.labels !== false) {
      // Engraving across the top of the module (or the slot number).
      out.push(`<text x="${n(sx + sw / 2)}" y="${n(sy + 2.9)}" font-family="Helvetica, Arial, sans-serif" font-size="3" font-weight="bold" text-anchor="middle" fill="currentColor">${esc((engr || (m ? `${i + 1}` : `${i + 1} · BLANK`)).toUpperCase())}</text>`)
      if (engr) out.push(`<line x1="${n(sx + 4)}" y1="${n(sy + 4)}" x2="${n(sx + sw - 4)}" y2="${n(sy + 4)}" ${line(0.15)}/>`)
    }
    if (!m) return
    const a = adapter(m.front.connector)
    const areaW = sw - 10, areaH = sh - textH - 2
    const perRowMax = Math.max(1, Math.floor((areaW + 1.2) / (a.w + 1.2)))
    const rows = Math.max(1, Math.ceil(m.front.count / perRowMax))
    const per = Math.ceil(m.front.count / rows)
    const scale = Math.min(1, areaH / (rows * a.h + (rows - 1) * 1.5))
    const pitchX = Math.min(a.w * scale + 3, areaW / per)
    for (let k = 0; k < m.front.count; k++) {
      const row = Math.floor(k / per), col = k % per
      const cnt = Math.min(per, m.front.count - row * per)
      const cx = sx + sw / 2 + (col - (cnt - 1) / 2) * pitchX
      const cy = sy + textH + 1 + (areaH - rows * a.h * scale - (rows - 1) * 1.5) / 2 + row * (a.h * scale + 1.5) + (a.h * scale) / 2
      out.push(`<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(scale)})">${a.svg}</g>`)
    }
  })
  return out.join('')
}

export function fiberSVG(spec: FiberSpec, o: FiberDrawOpts & { pad?: number } = {}): string {
  const { w, h } = fiberFaceSize(spec)
  const pad = o.pad ?? 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${n(h + pad * 2)}" preserveAspectRatio="xMidYMid meet">${fiberInner(spec, o)}</svg>`
}

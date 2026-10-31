// Plate designer: the physical face of a wall plate, floor box, stage pocket
// or rack-mount connector panel – where each connector sits, its label, and
// free text anywhere – drawn to scale (millimetres). The same drawing is used
// in the designer, as the preview on the wiring-diagram card and in print.

import type { PlateInsert, PlateKind, PlateLayout, PlateSpec, PlateText, ProductDefinition } from './model'
import { fiberFaceSize, fiberInner, lcPort } from './fiber'
import { PLATE_MODULES } from './plates'

export type PlateFinish = PlateLayout['finish']

export interface PlateSize { w: number; h: number; shape?: 'rect' | 'round'; ru?: number; gangs?: number; decora?: boolean; box?: boolean }

/** Face sizes (mm). Wall plates: US standard size; floor boxes: typical covers; rack panels: 19" × n RU. */
export const PLATE_SIZES: Record<string, PlateSize> = {
  '1-Gang': { w: 70, h: 115, gangs: 1 }, '2-Gang': { w: 116, h: 115, gangs: 2 }, '3-Gang': { w: 162, h: 115, gangs: 3 }, '4-Gang': { w: 208, h: 115, gangs: 4 },
  'Decora 1-Gang': { w: 70, h: 115, gangs: 1, decora: true }, 'Decora 2-Gang': { w: 116, h: 115, gangs: 2, decora: true },
  'Midsize 1-Gang': { w: 79, h: 124, gangs: 1 }, 'Midsize 2-Gang': { w: 125, h: 124, gangs: 2 },
  '2-Compartment': { w: 150, h: 150 }, '4-Compartment': { w: 230, h: 230 }, '6-Compartment': { w: 300, h: 230 }, '8-Compartment': { w: 300, h: 300 },
  'Poke-Thru': { w: 160, h: 160, shape: 'round' }, 'Stage Pocket': { w: 305, h: 152 }, 'Wall Box': { w: 254, h: 203 },
  // Wall boxes (Redco-style surface-mount back box + panel; size = panel W × H).
  'UCP 3.5" x 3.5"': { w: 88.9, h: 88.9, box: true },
  '6" x 6"': { w: 152.4, h: 152.4, box: true },
  '8" x 8"': { w: 203.2, h: 203.2, box: true },
  '10" x 10"': { w: 254.0, h: 254.0, box: true },
  '12" x 12"': { w: 304.8, h: 304.8, box: true },
  '8.5" x 5.75"': { w: 215.9, h: 146.0, box: true },
  '5.75" x 8.5"': { w: 146.0, h: 215.9, box: true },
  '8.5" x 7.5"': { w: 215.9, h: 190.5, box: true },
  '7.5" x 8.5"': { w: 190.5, h: 215.9, box: true },
  '14.5" x 7.5"': { w: 368.3, h: 190.5, box: true },
  '7.5" x 14.5"': { w: 190.5, h: 368.3, box: true },
  '14.5" x 10.5"': { w: 368.3, h: 266.7, box: true },
  '10.5" x 14.5"': { w: 266.7, h: 368.3, box: true },
  '17" x 7.5"': { w: 431.8, h: 190.5, box: true },
  '7.5" x 17"': { w: 190.5, h: 431.8, box: true },
  '17" x 10.5"': { w: 431.8, h: 266.7, box: true },
  '10.5" x 17"': { w: 266.7, h: 431.8, box: true },
  '1RU': { w: 482.6, h: 44.45, ru: 1 }, '2RU': { w: 482.6, h: 88.9, ru: 2 }, '3RU': { w: 482.6, h: 133.35, ru: 3 }, '4RU': { w: 482.6, h: 177.8, ru: 4 },
}

export const PLATE_STYLE_LIST: Record<PlateKind, string[]> = {
  wallPlate: ['1-Gang', '2-Gang', '3-Gang', '4-Gang', 'Decora 1-Gang', 'Decora 2-Gang', 'Midsize 1-Gang', 'Midsize 2-Gang', 'Custom'],
  wallBox: ['UCP 3.5" x 3.5"', '6" x 6"', '8" x 8"', '10" x 10"', '12" x 12"', '8.5" x 5.75"', '5.75" x 8.5"', '8.5" x 7.5"', '7.5" x 8.5"', '14.5" x 7.5"', '7.5" x 14.5"', '14.5" x 10.5"', '10.5" x 14.5"', '17" x 7.5"', '7.5" x 17"', '17" x 10.5"', '10.5" x 17"', 'Custom'],
  floorBox: ['2-Compartment', '4-Compartment', '6-Compartment', '8-Compartment', 'Poke-Thru', 'Stage Pocket', 'Custom'],
  rackPanel: ['1RU', '2RU', '3RU', '4RU'],
}

export const FINISHES: { value: PlateFinish; label: string; fill: string; ink: string; edge: string }[] = [
  { value: 'white', label: 'White', fill: '#f6f6f2', ink: '#111', edge: '#b9b9b3' },
  { value: 'ivory', label: 'Ivory', fill: '#efe7d2', ink: '#111', edge: '#bdb39b' },
  { value: 'black', label: 'Black', fill: '#262628', ink: '#f2f2f2', edge: '#000' },
  { value: 'stainless', label: 'Stainless', fill: '#cdd0d4', ink: '#111', edge: '#8d9196' },
  { value: 'aluminum', label: 'Brushed aluminum', fill: '#dcdee1', ink: '#111', edge: '#9a9da2' },
]
export const finishOf = (f: PlateFinish) => FINISHES.find((x) => x.value === f) ?? FINISHES[0]

/**
 * Connector footprints on the face (mm), from published dimensions:
 * Neutrik D-series housings (26 × 31 mm flange, Ø3.2 holes 19 × 24 mm apart,
 * Ø24 cutout), keystone modules (14.5 × 16 mm face), Decora / duplex
 * receptacles (33.3 × 66.7 mm face, outlets 38.1 mm apart), binding posts on
 * 19 mm (3/4") centres, D-sub shells.
 */
type Shape = 'd' | 'keystone' | 'duplex' | 'twist' | 'round' | 'block'
const FOOT: Record<string, { w: number; h: number; shape: Shape; icon: string }> = {
  xlrF: { w: 26, h: 31, shape: 'd', icon: 'xlrF' }, xlrM: { w: 26, h: 31, shape: 'd', icon: 'xlrM' }, dmx: { w: 26, h: 31, shape: 'd', icon: 'xlr5' },
  nl4: { w: 26, h: 31, shape: 'd', icon: 'nl4' }, ethercon: { w: 26, h: 31, shape: 'd', icon: 'ethercon' }, opticalcon: { w: 26, h: 31, shape: 'd', icon: 'oc' },
  bnc: { w: 26, h: 31, shape: 'd', icon: 'bnc' }, hdmi: { w: 26, h: 31, shape: 'd', icon: 'hdmi' }, usbA: { w: 26, h: 31, shape: 'd', icon: 'usbA' },
  usbB: { w: 26, h: 31, shape: 'd', icon: 'usbB' }, usbc: { w: 26, h: 31, shape: 'd', icon: 'usbC' }, dp: { w: 26, h: 31, shape: 'd', icon: 'dp' },
  trs: { w: 26, h: 31, shape: 'd', icon: 'trs' }, fiber: { w: 26, h: 31, shape: 'd', icon: 'lc' }, pwrTrue1: { w: 32, h: 38, shape: 'd', icon: 'true1' },
  rj45: { w: 14.5, h: 16, shape: 'keystone', icon: 'rj45' }, mini: { w: 14.5, h: 16, shape: 'keystone', icon: 'mini' }, rca: { w: 14.5, h: 16, shape: 'keystone', icon: 'rca' },
  vga: { w: 31, h: 12.5, shape: 'block', icon: 'de15' }, db9: { w: 31, h: 12.5, shape: 'block', icon: 'de9' }, euro: { w: 22, h: 10, shape: 'block', icon: 'euro' },
  binding: { w: 32, h: 14, shape: 'block', icon: 'posts' },
  pwr515: { w: 33.3, h: 66.7, shape: 'duplex', icon: '515' }, pwr520: { w: 33.3, h: 66.7, shape: 'duplex', icon: '520' }, pwrSchuko: { w: 50, h: 50, shape: 'round', icon: 'schuko' },
  pwrL530: { w: 44, h: 44, shape: 'twist', icon: 'L530' },
}
export const footprint = (module: string) => FOOT[module] ?? { w: 26, h: 31, shape: 'd' as Shape, icon: module }

export const plateSize = (spec: PlateSpec): PlateSize => (spec.layout ? { w: spec.layout.w, h: spec.layout.h, shape: spec.layout.shape, ...(PLATE_SIZES[spec.style] ? { ru: PLATE_SIZES[spec.style].ru, gangs: PLATE_SIZES[spec.style].gangs, decora: PLATE_SIZES[spec.style].decora } : {}) } : PLATE_SIZES[spec.style] ?? { w: 120, h: 120 })

/**
 * Splits multi-count inserts into one insert per jack with a fixed port id
 * (`pid`) so each jack can be placed, labelled and removed on its own without
 * renumbering the others (cables stay connected).
 */
export function explodeInserts(spec: PlateSpec): PlateSpec {
  const used = new Map<string, number>()
  const inserts: PlateInsert[] = []
  for (const ins of spec.inserts) {
    if (!PLATE_MODULES[ins.module]) continue
    for (let i = 0; i < Math.max(1, ins.count); i++) {
      const n = (used.get(ins.module) ?? 0) + 1
      used.set(ins.module, n)
      const label = ins.label?.trim() ? (ins.count > 1 ? `${ins.label.trim()} ${i + 1}` : ins.label.trim()) : undefined
      inserts.push({ ...ins, count: 1, pid: ins.pid ?? `${ins.module}.${n}`, label })
    }
  }
  return { ...spec, inserts }
}

/** Next unused port id for a module. */
export function nextPid(spec: PlateSpec, module: string): string {
  const ids = new Set(spec.inserts.map((x) => x.pid))
  for (let n = 1; ; n++) if (!ids.has(`${module}.${n}`)) return `${module}.${n}`
}

/** Lays jacks out in neat rows (used when a plate is first opened in the designer). */
export function autoArrange(spec: PlateSpec, size = plateSize(spec)): Record<string, { x: number; y: number }> {
  const jacks = spec.inserts.filter((x) => x.pid)
  const out: Record<string, { x: number; y: number }> = {}
  if (!jacks.length) return out
  const pad = size.ru ? 22 : size.box ? 18 : 10, gap = 6, lab = 7
  // Wall plates: one column per gang, jacks stacked down each gang's centre line.
  if (size.gangs && !size.ru) {
    const gw = size.w / size.gangs
    const cols: (typeof jacks)[] = Array.from({ length: size.gangs }, () => [])
    const colH = (c: typeof jacks) => c.reduce((t, j) => t + footprint(j.module).h + lab, 0) + gap * Math.max(0, c.length - 1)
    for (const j of jacks) {
      // Next gang with room, else the least full one.
      const fits = cols.find((c) => colH([...c, j]) <= size.h - 24)
      ;(fits ?? cols.reduce((a, b) => (colH(a) <= colH(b) ? a : b))).push(j)
    }
    cols.forEach((c, g) => {
      let y = (size.h - colH(c)) / 2
      for (const j of c) {
        const f = footprint(j.module)
        out[j.pid!] = { x: round1(gw * (g + 0.5)), y: round1(y + f.h / 2) }
        y += f.h + lab + gap
      }
    })
    return out
  }
  const usableW = size.w - pad * 2
  // Greedy rows.
  const rows: { items: typeof jacks; h: number; w: number }[] = []
  for (const j of jacks) {
    const f = footprint(j.module)
    const r = rows[rows.length - 1]
    if (r && r.w + gap + f.w <= usableW) { r.items.push(j); r.w += gap + f.w; r.h = Math.max(r.h, f.h + lab) }
    else rows.push({ items: [j], w: f.w, h: f.h + lab })
  }
  const total = rows.reduce((t, r) => t + r.h, 0) + gap * (rows.length - 1)
  let y = Math.max(pad / 2, (size.h - total) / 2)
  for (const r of rows) {
    let x = (size.w - r.w) / 2
    for (const j of r.items) {
      const f = footprint(j.module)
      out[j.pid!] = { x: round1(x + f.w / 2), y: round1(y + (r.h - lab) / 2) }
      x += f.w + gap
    }
    y += r.h + gap
  }
  return out
}
const round1 = (v: number) => Math.round(v * 10) / 10

const laidOut = new WeakMap<PlateSpec, PlateSpec>()
/** Gives a spec a designer layout (size from its style, jacks arranged) if it has none. Cached per spec object. */
export function withLayout(spec0: PlateSpec): PlateSpec {
  const hit = laidOut.get(spec0)
  if (hit) return hit
  const r = layoutOf(spec0)
  laidOut.set(spec0, r)
  return r
}
function layoutOf(spec0: PlateSpec): PlateSpec {
  const spec = explodeInserts(spec0)
  const size = PLATE_SIZES[spec.style] ?? { w: spec.layout?.w ?? 120, h: spec.layout?.h ?? 120 }
  const layout: PlateLayout = spec.layout
    ? { ...spec.layout, jacks: { ...spec.layout.jacks } }
    : { w: size.w, h: size.h, shape: size.shape, finish: spec.kind === 'rackPanel' ? 'black' : 'white', grid: spec.kind === 'rackPanel' ? 2.5 : 2, labelPos: 'below', jacks: {}, texts: [] }
  const missing = spec.inserts.filter((x) => x.pid && !layout.jacks[x.pid])
  if (missing.length) {
    const auto = autoArrange(spec, { ...size, w: layout.w, h: layout.h })
    for (const m of missing) layout.jacks[m.pid!] = auto[m.pid!] ?? { x: layout.w / 2, y: layout.h / 2 }
  }
  return { ...spec, layout }
}

// MARK: Drawing

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => Math.round(v * 100) / 100

/** One connector as a line drawing (outline only), centred on (0,0), in mm. Stroke = currentColor. */
export function jackSVG(module: string): string {
  const f = footprint(module)
  const hw = f.w / 2, hh = f.h / 2
  const P: string[] = []
  const L = (d: string, w = 0.35) => P.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linejoin="round"/>`)
  const C = (x: number, y: number, r: number, w = 0.35) => P.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="currentColor" stroke-width="${w}"/>`)
  const R = (x: number, y: number, w: number, h: number, rx = 0, sw = 0.35) => P.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`)
  const D = (cx: number, cy: number, r: number) => { // round cutout with the D-series flat at the top
    const a = Math.asin(Math.min(0.99, (r - 1.2) / r)), x = r * Math.cos(a), y = -(r - 1.2)
    L(`M ${n(cx - x)} ${n(cy + y)} A ${r} ${r} 0 1 0 ${n(cx + x)} ${n(cy + y)} Z`)
  }
  if (f.shape === 'd') {
    if (f.icon === 'true1') {
      R(-hw, -hh, f.w, f.h, 2, 0.5); C(-hw + 3.5, -hh + 3.5, 1.6); C(hw - 3.5, hh - 3.5, 1.6)
      C(0, 0, 12.5); C(0, 0, 10); R(-1.5, -12.5, 3, 2.5)
      for (const a of [-0.5, 0.5, Math.PI]) C(Math.sin(a) * 5.5, -Math.cos(a) * 5.5, 1.3)
      return P.join('')
    }
    // Neutrik D flange: 26 × 31, Ø3.2 holes at (±9.5, ∓12), Ø24 cutout.
    R(-hw, -hh, f.w, f.h, 1.5, 0.5)
    C(-9.5, -12, 1.6); C(9.5, 12, 1.6)
    switch (f.icon) {
      case 'xlrF': case 'xlr5': {
        D(0, 0, 10); C(0, 0, 9)
        const pins = f.icon === 'xlr5' ? [[-4.3, -1.6], [4.3, -1.6], [0, 4.4], [-3.1, 3.2], [3.1, 3.2]] : [[-4.4, -1.4], [4.4, -1.4], [0, 4.6]]
        for (const [x, y] of pins) C(x, y, f.icon === 'xlr5' ? 0.9 : 1.15)
        R(-1.8, -9.6, 3.6, 2.2, 0.4) // key slot
        R(-3.6, 10.3, 7.2, 3.2, 0.8) // PUSH latch
        break
      }
      case 'xlrM': {
        D(0, 0, 10); C(0, 0, 8.6); C(0, 0, 7.4)
        for (const [x, y] of [[-4.4, -1.4], [4.4, -1.4], [0, 4.6]]) C(x, y, 0.8)
        R(-1.5, -8.8, 3, 1.6, 0.3)
        break
      }
      case 'nl4': D(0, 0, 10); C(0, 0, 8.5); C(0, 0, 5.2); R(-1.1, -8.5, 2.2, 3.3); R(-1.1, 5.2, 2.2, 3.3); break
      case 'ethercon': D(0, 0, 10); C(0, 0, 8.6); R(-5.85, -3.6, 11.7, 8.1, 0.6); R(-2.5, 4.5, 5, 1.6); R(-3.6, 10.3, 7.2, 3.2, 0.8); break
      case 'oc': D(0, 0, 10); C(0, 0, 8.6); P.push(lcPort(-3.2, 0.3), lcPort(3.2, 0.3)); break
      case 'bnc': D(0, 0, 10); C(0, 0, 4.75); C(0, 0, 2.6); C(0, 0, 0.6); R(-5.6, -0.6, 1.2, 1.2); R(4.4, -0.6, 1.2, 1.2); break
      case 'hdmi': D(0, 0, 10); L('M -7 -2.25 L 7 -2.25 L 7 0.6 L 5.4 2.25 L -5.4 2.25 L -7 0.6 Z'); break
      case 'dp': D(0, 0, 10); L('M -8 -2.4 L 8 -2.4 L 8 2.4 L -6.4 2.4 L -8 0.8 Z'); break
      case 'usbA': D(0, 0, 10); R(-6, -2.25, 12, 4.5, 0.3); R(-4.5, -2.25, 9, 1.8); break
      case 'usbB': D(0, 0, 10); L('M -4 -3.65 L 2.6 -3.65 L 4 -2.25 L 4 3.65 L -4 3.65 Z'); break
      case 'usbC': D(0, 0, 10); R(-4.15, -1.3, 8.3, 2.6, 1.3); break
      case 'trs': D(0, 0, 10); C(0, 0, 6); C(0, 0, 3.2); break
      case 'lc': D(0, 0, 10); R(-7.2, -4, 14.4, 8, 0.8); P.push(lcPort(-3.2, 0.4), lcPort(3.2, 0.4)); break
      default: D(0, 0, 10)
    }
  } else if (f.shape === 'keystone') {
    R(-hw, -hh, f.w, f.h, 0.6, 0.45)
    if (f.icon === 'rj45') { R(-5.85, -4.6, 11.7, 8.1, 0.4); R(-2.5, 3.5, 5, 1.8) }
    else if (f.icon === 'rca') { C(0, 0, 4.15); C(0, 0, 1.5) }
    else { C(0, 0, 3); C(0, 0, 1.75) }
  } else if (f.shape === 'duplex') {
    // Decora face 33.3 × 66.7; outlet faces 38.1 mm (1.5") apart; blades 12.7 mm (½") apart.
    R(-hw, -hh, f.w, f.h, 2, 0.5)
    for (const cy of [-19.05, 19.05]) {
      R(-13, cy - 12.5, 26, 25, 7)
      R(-6.35 - 0.9, cy - 6, 1.8, 6.2, 0.3)          // hot (short)
      R(6.35 - 1.15, cy - 6.8, 2.3, 7.9, 0.3)        // neutral (tall)
      if (f.icon === '520') R(6.35 - 1.15 - 3, cy - 3.9, 3, 1.8, 0.3) // 20 A T-slot
      L(`M -2.4 ${n(cy + 8.2)} L -2.4 ${n(cy + 6.4)} A 2.4 2.4 0 0 1 2.4 ${n(cy + 6.4)} L 2.4 ${n(cy + 8.2)} Z`) // ground
    }
    C(0, 0, 1.6)
  } else if (f.shape === 'twist') {
    C(0, 0, hw, 0.5); C(0, 0, hw - 5)
    for (const a of [-1.2, 0.9, 2.95]) L(`M ${n(Math.cos(a) * 11)} ${n(Math.sin(a) * 11)} A 11 11 0 0 1 ${n(Math.cos(a + 0.55) * 11)} ${n(Math.sin(a + 0.55) * 11)}`, 1.6)
    C(0, 0, 1.6)
  } else if (f.shape === 'round') {
    C(0, 0, hw, 0.5); C(0, 0, 19); C(-9.5, 0, 2.4); C(9.5, 0, 2.4); R(-1.5, -19, 3, 3); R(-1.5, 16, 3, 3)
  } else {
    if (f.icon === 'de9' || f.icon === 'de15') {
      // D-sub: shell + jack-screws 25 mm apart.
      R(-hw, -hh, f.w, f.h, 1, 0.5); C(-12.5, 0, 1.6); C(12.5, 0, 1.6)
      L('M -8.4 -4.2 L 8.4 -4.2 L 7.4 4.2 L -7.4 4.2 Z')
      const rows = f.icon === 'de15' ? [[5, -2.2], [5, 0], [5, 2.2]] : [[5, -1.4], [4, 1.4]]
      for (const [k, y] of rows) for (let i = 0; i < k; i++) C((i - (k - 1) / 2) * 2.77, y, 0.45, 0.25)
    } else if (f.icon === 'euro') {
      R(-hw, -hh, f.w, f.h, 0.6, 0.45)
      for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 5.08; C(x, -1.5, 1.4); R(x - 1.3, 1.8, 2.6, 2.2, 0.3) }
    } else {
      // Binding posts on 19 mm (¾") centres.
      R(-hw, -hh, f.w, f.h, 1.5, 0.45); for (const x of [-9.5, 9.5]) { C(x, 0, 5.5); C(x, 0, 2) }
    }
  }
  return P.join('')
}

export interface PlateDrawOpts {
  /** Include connector labels and free text (off for tiny thumbnails). */
  labels?: boolean
  /** Ids of selected jacks / texts (designer). */
  selected?: Set<string>
  /** Add data-id attributes so the designer can pick items. */
  interactive?: boolean
  /** Show grid dots every n mm (designer). */
  grid?: number
  /** Rack panels: leave out the outline and ears (the rack elevation draws its own). */
  bare?: boolean
}

/** Inner SVG (mm units) of the plate face; wrap with plateSVG() for a stand-alone image. */
export function plateInner(spec0: PlateSpec, o: PlateDrawOpts = {}): string {
  // Older plates store multi-count inserts; draw from the one-jack-per-insert form.
  const spec = withLayout(spec0)
  const L = spec.layout!
  const size = plateSize({ ...spec, layout: L })
  const out: string[] = []
  const line = (sw: number) => `fill="none" stroke="currentColor" stroke-width="${sw}"`
  // Face – outline only, like a CAD panel drawing.
  if (o.bare) { /* outline and ears come from the rack elevation */ } else if (L.shape === 'round') out.push(`<circle cx="${L.w / 2}" cy="${L.h / 2}" r="${Math.min(L.w, L.h) / 2}" ${line(0.7)}/><circle cx="${L.w / 2}" cy="${L.h / 2}" r="${Math.min(L.w, L.h) / 2 - 6}" ${line(0.3)}/>`)
  else {
    out.push(`<rect x="0" y="0" width="${L.w}" height="${L.h}" rx="${spec.kind === 'rackPanel' ? 0.8 : spec.kind === 'floorBox' ? 6 : 3}" ${line(0.7)}/>`)
    if (spec.kind === 'floorBox') out.push(`<rect x="5" y="5" width="${n(L.w - 10)}" height="${n(L.h - 10)}" rx="3" ${line(0.3)}/>`)
  }
  // Screws: per gang (wall plates, 3.28" apart), corners (floor boxes), ear slots (rack).
  const screw = (x: number, y: number, r = 2.2) => out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${r}" ${line(0.35)}/><line x1="${n(x - r * 0.7)}" y1="${n(y)}" x2="${n(x + r * 0.7)}" y2="${n(y)}" ${line(0.3)}/>`)
  if (size.ru && o.bare) {
    // no ears
  } else if (size.ru) {
    // EIA-310 ears: slots 6.8 × 3.8 at 7.9 mm from the edge, holes at 6.35 / 22.2 / 38.1 mm per U (outer two used).
    for (const ex of [7.9, L.w - 7.9]) for (let u = 0; u < size.ru; u++) for (const hy of [6.35, 38.1]) {
      const cy = u * 44.45 + hy
      out.push(`<rect x="${n(ex - 3.4)}" y="${n(cy - 1.9)}" width="6.8" height="3.8" rx="1.9" ${line(0.35)}/>`)
    }
    out.push(`<line x1="15.9" y1="0" x2="15.9" y2="${L.h}" ${line(0.2)} stroke-dasharray="1.5 1"/><line x1="${n(L.w - 15.9)}" y1="0" x2="${n(L.w - 15.9)}" y2="${L.h}" ${line(0.2)} stroke-dasharray="1.5 1"/>`)
  } else if (size.gangs) {
    const gw = L.w / size.gangs
    const sy = (L.h - 83.3) / 2 // device screws 3.28" (83.3 mm) apart
    for (let g = 0; g < size.gangs; g++) { screw(gw * (g + 0.5), sy, 1.8); screw(gw * (g + 0.5), L.h - sy, 1.8) }
    if (size.decora) for (let g = 0; g < size.gangs; g++) out.push(`<rect x="${n(gw * (g + 0.5) - 16.65)}" y="${n(L.h / 2 - 33.35)}" width="33.3" height="66.7" rx="1" ${line(0.4)}/>`)
  } else if (spec.kind === 'wallBox' && L.shape !== 'round') {
    // Panel on a surface-mount back box: screws ¼" in from each corner, box walls behind shown as hidden (dashed) lines.
    const e = L.w < 100 || L.h < 100 ? 5 : 6.35
    for (const [x, y] of [[e, e], [L.w - e, e], [e, L.h - e], [L.w - e, L.h - e]]) screw(x, y, 2)
    out.push(`<rect x="12.7" y="12.7" width="${n(L.w - 25.4)}" height="${n(L.h - 25.4)}" rx="1" ${line(0.25)} stroke-dasharray="2 1.2"/>`)
  } else if (spec.kind === 'floorBox' && L.shape !== 'round') {
    for (const [x, y] of [[9, 9], [L.w - 9, 9], [9, L.h - 9], [L.w - 9, L.h - 9]]) screw(x, y, 2.4)
  }
  if (o.grid && o.grid > 0) {
    const g = o.grid >= 2 ? o.grid : 2
    const dots: string[] = []
    for (let x = g * 5; x < L.w; x += g * 5) for (let y = g * 5; y < L.h; y += g * 5) dots.push(`M ${n(x)} ${n(y)} h 0.01`)
    out.push(`<path d="${dots.join(' ')}" stroke="currentColor" stroke-opacity="0.2" stroke-width="0.7" stroke-linecap="round"/>`)
  }
  // Jacks + labels.
  const counts = new Map<string, number>()
  for (const ins of spec.inserts) {
    if (!ins.pid) continue
    const at = L.jacks[ins.pid]
    if (!at) continue
    const f = footprint(ins.module)
    const k = (counts.get(ins.module) ?? 0) + 1
    counts.set(ins.module, k)
    const sel = o.selected?.has(ins.pid)
    out.push(`<g transform="translate(${n(at.x)} ${n(at.y)})"${o.interactive ? ` data-id="${esc(ins.pid)}" style="cursor:move"` : ''}>${o.interactive ? `<rect x="${-f.w / 2}" y="${-f.h / 2}" width="${f.w}" height="${f.h}" fill="transparent"/>` : ''}${jackSVG(ins.module)}`)
    if (sel) out.push(`<rect x="${-f.w / 2 - 1.5}" y="${-f.h / 2 - 1.5}" width="${f.w + 3}" height="${f.h + 3}" fill="none" stroke="#0a84ff" stroke-width="0.8" stroke-dasharray="2 1"/>`)
    out.push('</g>')
    if (o.labels !== false && L.labelPos !== 'none') {
      const text = (ins.label?.trim() || `${shortModule(ins.module)}${k > 1 || spec.inserts.filter((x) => x.module === ins.module).length > 1 ? ` ${k}` : ''}`).toUpperCase()
      const ly = L.labelPos === 'above' ? at.y - f.h / 2 - 2.2 : at.y + f.h / 2 + 3.6
      out.push(`<text x="${n(at.x)}" y="${n(ly)}" font-family="Helvetica, Arial, sans-serif" font-size="2.8" font-weight="bold" text-anchor="middle" fill="currentColor">${esc(text)}</text>`)
    }
  }
  // Free text.
  if (o.labels !== false) for (const t of L.texts) {
    const sel = o.selected?.has(t.id)
    const lines = t.text.split('\n')
    out.push(`<g${o.interactive ? ` data-id="${esc(t.id)}" style="cursor:move"` : ''}>`)
    lines.forEach((line, i) => out.push(`<text x="${n(t.x)}" y="${n(t.y + i * t.size * 1.2)}" font-family="Helvetica, Arial, sans-serif" font-size="${t.size}"${t.bold ? ' font-weight="bold"' : ''} text-anchor="${t.align ?? 'middle'}" dominant-baseline="middle" fill="currentColor">${esc(line || ' ')}</text>`))
    if (sel || o.interactive) {
      const w = Math.max(...lines.map((l) => l.length)) * t.size * 0.6 + 2, h = lines.length * t.size * 1.2
      const x0 = t.align === 'start' ? t.x - 1 : t.align === 'end' ? t.x - w + 1 : t.x - w / 2
      out.push(`<rect x="${n(x0)}" y="${n(t.y - t.size * 0.7)}" width="${n(w)}" height="${n(h)}" fill="transparent" stroke="${sel ? '#0a84ff' : 'none'}" stroke-width="0.6" stroke-dasharray="2 1"/>`)
    }
    out.push('</g>')
  }
  return out.join('')
}

const shortModule = (m: string) => (PLATE_MODULES[m]?.name ?? m).replace(/\s*\(.*\)$/, '').replace(/ (Female|Male)$/, (x) => (x === ' Female' ? ' F' : ' M'))

/** Stand-alone SVG of a plate face (preview on the wiring-diagram card, print). */
export function plateSVG(spec: PlateSpec, o: PlateDrawOpts & { pad?: number } = {}): string {
  const L = withLayout(spec).layout!
  const pad = o.pad ?? 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${n(L.w + pad * 2)} ${n(L.h + pad * 2)}" preserveAspectRatio="xMidYMid meet">${plateInner(spec, o)}</svg>`
}

/** Aspect (height / width) of a plate face. */
export const plateAspect = (spec: PlateSpec) => { const L = withLayout(spec).layout!; return L.h / L.w }

export const newPlateText = (x: number, y: number, text = 'TEXT'): PlateText => ({ id: `t.${Math.random().toString(36).slice(2, 9)}`, x, y, text, size: 3.5 })

// MARK: Any device face (plates, boxes, rack panels, fiber enclosures)

export interface Face {
  w: number
  h: number
  /** Rack-mount (19") – drawn into the rack elevation too. */
  rack: boolean
  inner: (o?: { labels?: boolean; bare?: boolean }) => string
}

/** The drawable front of a product, if it has one. */
export function productFace(p: ProductDefinition): Face | null {
  if (p.fiber) { const f = p.fiber; const s = fiberFaceSize(f); return { ...s, rack: true, inner: (o) => fiberInner(f, o) } }
  if (p.plate) {
    const spec = p.plate, L = withLayout(spec).layout!
    return { w: L.w, h: L.h, rack: spec.kind === 'rackPanel', inner: (o) => plateInner(spec, { labels: o?.labels, bare: o?.bare }) }
  }
  return null
}

/** Stand-alone SVG of a product's face (diagram card preview). */
export function faceSVG(p: ProductDefinition, o: { labels?: boolean; pad?: number; stretch?: boolean; bare?: boolean } = {}): string {
  const f = productFace(p)
  if (!f) return ''
  const pad = o.pad ?? 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${n(f.w + pad * 2)} ${n(f.h + pad * 2)}" preserveAspectRatio="${o.stretch ? 'none' : 'xMidYMid meet'}">${f.inner({ labels: o.labels, bare: o.bare })}</svg>`
}

// Rack elevation artwork: each racked device drawn as the real unit – faceplate,
// rack ears and screws, maker and model silkscreen, a label-tape tag, and its
// connectors where they really are. Ports that are cabled show a plug in the
// cable's jacket colour. Gear whose I/O is on the back (most of it) gets a
// front made of the things that kind of unit has – screens, meters, knobs, vents –
// and its real ports on the Rear view. Shelf gear sits on a shelf.
//
// All drawing is in millimetres: 482.6 mm wide (19"), 44.45 mm per U.

import { cableColorHex } from './cables'
import type { EquipmentInstance, PortTemplate, ProductDefinition, RackFace } from './model'

export const RACK_W_MM = 482.6
export const U_MM = 44.45
const EAR = 16

type Glyph = 'xlr' | 'ethercon' | 'opticalcon' | 'powercon' | 'speakon' | 'rj45' | 'sfp' | 'bnc' | 'hdmi' | 'dsub' | 'usb' | 'trs' | 'mini' | 'bantam' | 'rca' | 'euro' | 'post' | 'iec' | 'outlet' | 'barrel' | 'multipin' | 'round'

const glyphOf = (p: PortTemplate): Glyph => {
  const c = p.connector as string
  if (/^xlr|^miniXlr/.test(c)) return 'xlr'
  if (c === 'etherCON') return 'ethercon'
  if (c === 'opticalCON') return 'opticalcon'
  if (/^powerCON/.test(c)) return 'powercon'
  if (/^speakon/.test(c)) return 'speakon'
  if (c === 'rj45') return 'rj45'
  if (/^(lcDuplex|scDuplex|mdc|mpo)/.test(c)) return 'sfp'
  if (/^(bnc|sma|tnc)$/.test(c)) return 'bnc'
  if (/^(hdmi|displayPort)$/.test(c)) return 'hdmi'
  if (/^(dvi|hd15|db9|db25)$/.test(c)) return 'dsub'
  if (/^usb/.test(c)) return 'usb'
  if (c === 'trs6_35') return 'trs'
  if (c === 'trs3_5') return 'mini'
  if (c === 'bantamTT') return 'bantam'
  if (c === 'rca') return 'rca'
  if (c === 'euroblock' || c === 'idcPunchdown') return 'euro'
  if (c === 'bindingPost') return 'post'
  if (/^iec/.test(c)) return 'iec'
  if (/^(nema|schuko)/.test(c)) return 'outlet'
  if (c === 'dcBarrel') return 'barrel'
  if (/^(amphenol|edac|whirlwind|socapex)/.test(c)) return 'multipin'
  return 'round'
}

/** Footprint per connector at full size: body w × h and pitch (with room for its number). */
const FOOT: Record<Glyph, { w: number; h: number; px: number; py: number }> = {
  xlr: { w: 23, h: 23, px: 26, py: 30 }, ethercon: { w: 23, h: 23, px: 26, py: 30 }, opticalcon: { w: 23, h: 23, px: 26, py: 30 },
  powercon: { w: 25, h: 25, px: 28, py: 31 }, speakon: { w: 25, h: 25, px: 28, py: 31 },
  rj45: { w: 12, h: 11, px: 14.5, py: 16 }, sfp: { w: 13, h: 9, px: 15, py: 14 }, bnc: { w: 12, h: 12, px: 15, py: 18 },
  hdmi: { w: 15, h: 6.5, px: 19, py: 12 }, dsub: { w: 30, h: 10, px: 35, py: 15 }, usb: { w: 12, h: 5, px: 15, py: 10 },
  trs: { w: 12, h: 12, px: 15, py: 18 }, mini: { w: 7, h: 7, px: 10, py: 12 }, bantam: { w: 6, h: 6, px: 8.2, py: 10 }, rca: { w: 9, h: 9, px: 12, py: 15 },
  euro: { w: 11.4, h: 8, px: 12.5, py: 14 }, post: { w: 9, h: 9, px: 12, py: 15 }, iec: { w: 26, h: 19, px: 32, py: 26 }, outlet: { w: 24, h: 30, px: 28, py: 36 },
  barrel: { w: 8, h: 8, px: 11, py: 13 }, multipin: { w: 40, h: 24, px: 46, py: 32 }, round: { w: 12, h: 12, px: 15, py: 18 },
}

export interface RackArtOptions {
  /** Cable jacket colour by port id ('' = cabled, colour unknown). */
  cabled: Map<string, string>
  /** Port ids at either end of the selected devices' cables. */
  hot: Set<string>
  heightU: number
  half?: boolean
  /** Unique per drawing (gradient ids). */
  uid: string
}

// MARK: Which ports are on which panel

const FRONT_IO = /(^|\s|-)(DL\d{2,3}|DM\d{1,2}|DX\d{2}|AR\d{2,4}|AB\d{3}|GX\d{4}|CDM\d{2}|DT\d{3}|Rio\d|Tio\d|SD-?Rack|SD-?Mini|Stage ?Box|Stagebox|S16|S32)/i

/** True when the product puts its signal I/O on the front (patch bays, switches, stage boxes…). */
export function frontIO(p: ProductDefinition): boolean {
  if (['patchBay', 'networkSwitch', 'fiberEnclosure', 'connectorPanel'].includes(p.category)) return true
  return (p.category === 'audioInterface' || p.category === 'mixer' || p.category === 'other') && (FRONT_IO.test(p.model) || /stage ?box/i.test(p.summary ?? ''))
}

const isPower = (p: PortTemplate) => p.group === 'Power' || /^(pwr|power|ac)\./i.test(p.id) || ['iec', 'outlet', 'powercon', 'barrel'].includes(glyphOf(p))

/** The ports on one panel of a device. */
export function panelPorts(p: ProductDefinition, panel: RackFace): PortTemplate[] {
  const side = (x: PortTemplate): RackFace => (x.face === 'front' ? 'front' : 'rear')
  const sig = p.ports.filter((x) => !isPower(x))
  const split = sig.some((x) => side(x) === 'front') && sig.some((x) => side(x) === 'rear')
  if (split) return p.ports.filter((x) => side(x) === panel)
  // Patch bays: the jacks show on both sides (the wiring lands on the back).
  if (p.category === 'patchBay') return sig
  if (frontIO(p)) return panel === 'front' ? sig : p.ports.filter(isPower)
  return panel === 'rear' ? p.ports : p.ports.filter((x) => side(x) === 'front')
}

/** Which panel of a racked device faces you from this side of the rack. */
export const panelSeen = (eq: EquipmentInstance, viewFace: RackFace): RackFace => ((eq.rackPlacement?.face ?? 'front') === viewFace ? 'front' : 'rear')

// MARK: Small helpers

const f = (n: number) => +n.toFixed(2)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`
const text = (x: number, y: number, s: string, size: number, fill: string, o: { anchor?: 'start' | 'middle' | 'end'; weight?: number; spacing?: number; maxW?: number; opacity?: number } = {}) => {
  let t = s
  if (o.maxW) { const max = Math.max(1, Math.floor(o.maxW / (size * 0.58))); if (t.length > max) t = t.slice(0, Math.max(1, max - 1)) + '…' }
  return `<text x="${f(x)}" y="${f(y)}" ${FONT} font-size="${f(size)}" fill="${fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}${o.opacity != null ? ` opacity="${o.opacity}"` : ''} dominant-baseline="middle">${esc(t)}</text>`
}
const jackNo = (p: PortTemplate, i: number) => p.label.match(/(\d+)(?!.*\d)/)?.[1] ?? String(i + 1)

interface Look { plate: string; plateHi: string; ink: string; silver: boolean }
function lookOf(p: ProductDefinition): Look {
  const silver = /^apple$/i.test(p.manufacturer) || /silver|aluminium|aluminum/i.test(p.summary ?? '')
  if (silver) return { plate: '#c9cacd', plateHi: '#e3e4e6', ink: '#2a2a2c', silver }
  if (/^(netgear|cisco|ubiquiti|luminex)$/i.test(p.manufacturer)) return { plate: '#1d1f22', plateHi: '#2c2f33', ink: '#d8dadd', silver }
  return { plate: '#1f2022', plateHi: '#303134', ink: '#e6e6e8', silver }
}

// MARK: Connectors

/** One connector, centred at (cx, cy), scaled by s. Cabled ports show a plug in the jacket colour. */
function connector(g: Glyph, p: PortTemplate, cx: number, cy: number, s: number, cable: string | undefined, hot: boolean): string {
  const F = FOOT[g], w = F.w * s, h = F.h * s
  const male = p.gender === 'male'
  const plugged = cable !== undefined
  const boot = cable ? cableColorHex(cable) ?? '#6b6e75' : '#6b6e75'
  const metal = '#a7a8ad', dark = '#0c0c0d', rim = '#5d5e63'
  const out: string[] = []
  const round = (r: number) => {
    out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#151516" stroke="${metal}" stroke-width="${f(0.9 * s)}"/>`)
  }
  switch (g) {
    case 'xlr': case 'ethercon': case 'opticalcon': {
      const r = w / 2
      round(r)
      out.push(`<rect x="${f(cx - 2.6 * s)}" y="${f(cy - r - 1.6 * s)}" width="${f(5.2 * s)}" height="${f(2.6 * s)}" rx="${f(0.8 * s)}" fill="${metal}"/>`)
      if (plugged) {
        out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.86)}" fill="${boot}" stroke="#000" stroke-opacity=".5" stroke-width="${f(0.5 * s)}"/>`, `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.42)}" fill="#000" fill-opacity=".35"/>`)
      } else if (g === 'xlr') {
        out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.72)}" fill="${dark}"/>`)
        for (const [dx, dy] of [[-0.33, -0.12], [0.33, -0.12], [0, 0.36]]) out.push(`<circle cx="${f(cx + dx * r)}" cy="${f(cy + dy * r)}" r="${f(r * (male ? 0.1 : 0.12))}" fill="${male ? '#d9d9dc' : '#3a3a3d'}"/>`)
      } else if (g === 'ethercon') {
        out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.72)}" fill="${dark}"/>`, `<rect x="${f(cx - r * 0.42)}" y="${f(cy - r * 0.36)}" width="${f(r * 0.84)}" height="${f(r * 0.66)}" fill="#26262a" stroke="${rim}" stroke-width="${f(0.4 * s)}"/>`)
      } else {
        out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.72)}" fill="${dark}"/>`)
        for (const dx of [-0.25, 0.25]) out.push(`<rect x="${f(cx + dx * r - r * 0.13)}" y="${f(cy - r * 0.2)}" width="${f(r * 0.26)}" height="${f(r * 0.4)}" fill="#3b7fd9"/>`)
      }
      break
    }
    case 'powercon': case 'speakon': {
      const r = w / 2, ring = p.connector === 'powerCON' ? '#2f6fd6' : p.connector === 'powerCONTrue1' ? '#e3b21b' : metal
      out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#161617" stroke="${ring}" stroke-width="${f(1.4 * s)}"/>`)
      out.push(plugged ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.8)}" fill="${boot}"/>` : `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.62)}" fill="${dark}"/><rect x="${f(cx - r * 0.12)}" y="${f(cy - r * 0.62)}" width="${f(r * 0.24)}" height="${f(r * 0.3)}" fill="#161617"/>`)
      break
    }
    case 'rj45': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(0.6 * s)}" fill="${dark}" stroke="${rim}" stroke-width="${f(0.5 * s)}"/>`)
      if (plugged) out.push(`<rect x="${f(cx - w * 0.42)}" y="${f(cy - h * 0.4)}" width="${f(w * 0.84)}" height="${f(h * 0.8)}" rx="${f(0.8 * s)}" fill="${boot}"/><rect x="${f(cx - w * 0.2)}" y="${f(cy + h * 0.12)}" width="${f(w * 0.4)}" height="${f(h * 0.22)}" fill="#fff" fill-opacity=".35"/>`)
      else { out.push(`<rect x="${f(cx - w * 0.38)}" y="${f(cy - h * 0.34)}" width="${f(w * 0.76)}" height="${f(h * 0.54)}" fill="#000"/><rect x="${f(cx - w * 0.16)}" y="${f(cy + h * 0.2)}" width="${f(w * 0.32)}" height="${f(h * 0.18)}" fill="#000"/>`); for (let k = 0; k < 8; k++) out.push(`<rect x="${f(cx - w * 0.3 + k * w * 0.6 / 7 - 0.25 * s)}" y="${f(cy - h * 0.34)}" width="${f(0.5 * s)}" height="${f(h * 0.16)}" fill="#c9a94f"/>`) }
      break
    }
    case 'sfp': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(0.4 * s)}" fill="${metal}"/><rect x="${f(cx - w * 0.4)}" y="${f(cy - h * 0.32)}" width="${f(w * 0.8)}" height="${f(h * 0.64)}" fill="${dark}"/>`)
      if (plugged) out.push(`<rect x="${f(cx - w * 0.36)}" y="${f(cy - h * 0.28)}" width="${f(w * 0.72)}" height="${f(h * 0.56)}" fill="${cable ? boot : '#22b8cf'}"/>`)
      break
    }
    case 'bnc': case 'rca': case 'trs': case 'mini': case 'bantam': case 'round': case 'barrel': case 'post': {
      const r = w / 2
      const ring = g === 'bantam' ? '#6a6b70' : g === 'rca' ? (/(^|\W)(R|right)\b/i.test(p.label) ? '#c92a2a' : /(^|\W)(L|left)\b/i.test(p.label) ? '#e9ecef' : metal) : g === 'post' ? (/-|neg|black/i.test(p.label) ? '#222' : '#c92a2a') : metal
      out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${ring}"${g === 'bnc' ? ` stroke="#77787d" stroke-width="${f(0.6 * s)}"` : ''}/>`)
      if (plugged) out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.82)}" fill="${boot}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.3)}" fill="#000" fill-opacity=".35"/>`)
      else out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * (g === 'bnc' ? 0.6 : 0.5))}" fill="${dark}"/>${g === 'bnc' || g === 'rca' ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.14)}" fill="#d6b25e"/>` : ''}`)
      if (g === 'bnc' && !plugged) for (const a of [0, Math.PI]) out.push(`<circle cx="${f(cx + Math.cos(a) * r * 0.98)}" cy="${f(cy + Math.sin(a) * r * 0.98)}" r="${f(r * 0.13)}" fill="#c9cace"/>`)
      break
    }
    case 'hdmi': {
      const d = `M ${f(cx - w / 2)} ${f(cy - h / 2)} h ${f(w)} v ${f(h * 0.55)} l ${f(-w * 0.12)} ${f(h * 0.45)} h ${f(-w * 0.76)} l ${f(-w * 0.12)} ${f(-h * 0.45)} z`
      out.push(`<path d="${d}" fill="${plugged ? boot : dark}" stroke="${rim}" stroke-width="${f(0.5 * s)}"/>`)
      if (!plugged) out.push(`<rect x="${f(cx - w * 0.34)}" y="${f(cy - h * 0.12)}" width="${f(w * 0.68)}" height="${f(h * 0.22)}" fill="#3a3a3d"/>`)
      break
    }
    case 'dsub': {
      const ww = p.connector === 'db9' || p.connector === 'hd15' ? w * 0.6 : w
      const d = `M ${f(cx - ww / 2)} ${f(cy - h / 2)} h ${f(ww)} l ${f(-ww * 0.08)} ${f(h)} h ${f(-ww * 0.84)} z`
      out.push(`<path d="${d}" fill="${plugged ? boot : metal}" stroke="#6d6e72" stroke-width="${f(0.4 * s)}"/>`)
      if (!plugged) out.push(`<path d="M ${f(cx - ww * 0.4)} ${f(cy - h * 0.3)} h ${f(ww * 0.8)} l ${f(-ww * 0.06)} ${f(h * 0.6)} h ${f(-ww * 0.68)} z" fill="${dark}"/>`)
      for (const sx of [-1, 1]) out.push(`<circle cx="${f(cx + sx * (ww / 2 + 2.6 * s))}" cy="${f(cy)}" r="${f(1.2 * s)}" fill="${metal}"/>`)
      break
    }
    case 'usb': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(p.connector === 'usbC' ? h / 2 : 0.4 * s)}" fill="${plugged ? boot : dark}" stroke="${metal}" stroke-width="${f(0.5 * s)}"/>`)
      if (!plugged) out.push(`<rect x="${f(cx - w * 0.32)}" y="${f(cy - h * 0.12)}" width="${f(w * 0.64)}" height="${f(h * 0.3)}" fill="#c9cace"/>`)
      break
    }
    case 'euro': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(0.5 * s)}" fill="${plugged ? '#2b8a3e' : '#237032'}" stroke="#14451f" stroke-width="${f(0.4 * s)}"/>`)
      for (let k = 0; k < 3; k++) {
        const x = cx - w / 2 + w * (k + 0.5) / 3
        out.push(`<circle cx="${f(x)}" cy="${f(cy - h * 0.2)}" r="${f(1.2 * s)}" fill="#c9cace"/><rect x="${f(x - 1.1 * s)}" y="${f(cy + h * 0.08)}" width="${f(2.2 * s)}" height="${f(h * 0.28)}" fill="${plugged ? boot : '#0c2412'}"/>`)
      }
      break
    }
    case 'iec': {
      const big = p.connector === 'iecC19C20', ww = big ? w : w * 0.85, hh = big ? h : h * 0.85
      out.push(`<rect x="${f(cx - ww / 2 - 2 * s)}" y="${f(cy - hh / 2 - 2 * s)}" width="${f(ww + 4 * s)}" height="${f(hh + 4 * s)}" rx="${f(1.5 * s)}" fill="#111"/>`)
      const c = ww * 0.18
      out.push(`<path d="M ${f(cx - ww / 2)} ${f(cy - hh / 2)} h ${f(ww)} v ${f(hh - c)} l ${f(-c)} ${f(c)} h ${f(-ww + 2 * c)} l ${f(-c)} ${f(-c)} z" fill="${plugged ? boot : '#232325'}" stroke="#4a4a4e" stroke-width="${f(0.5 * s)}"/>`)
      if (!plugged) for (const [dx, dy] of [[-0.25, 0.05], [0.25, 0.05], [0, -0.22]]) out.push(`<rect x="${f(cx + dx * ww - 0.9 * s)}" y="${f(cy + dy * hh - 2.4 * s)}" width="${f(1.8 * s)}" height="${f(4.8 * s)}" fill="#c9b37a"/>`)
      break
    }
    case 'outlet': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(4 * s)}" fill="${plugged ? boot : '#18181a'}" stroke="#56575b" stroke-width="${f(0.6 * s)}"/>`)
      if (!plugged) for (const dy of [-0.22, 0.22]) {
        const y = cy + dy * h
        out.push(`<rect x="${f(cx - w * 0.22)}" y="${f(y - 2.6 * s)}" width="${f(1.6 * s)}" height="${f(5.2 * s)}" fill="#000"/><rect x="${f(cx + w * 0.16)}" y="${f(y - 2.6 * s)}" width="${f(1.6 * s)}" height="${f(5.2 * s)}" fill="#000"/><circle cx="${f(cx)}" cy="${f(y + 4 * s)}" r="${f(1.3 * s)}" fill="#000"/>`)
      }
      break
    }
    case 'multipin': {
      out.push(`<rect x="${f(cx - w / 2)}" y="${f(cy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(2 * s)}" fill="${plugged ? boot : metal}" stroke="#6d6e72" stroke-width="${f(0.5 * s)}"/>`)
      if (!plugged) out.push(`<rect x="${f(cx - w * 0.4)}" y="${f(cy - h * 0.3)}" width="${f(w * 0.8)}" height="${f(h * 0.6)}" rx="${f(1 * s)}" fill="${dark}"/>`)
      break
    }
  }
  if (hot) out.push(`<rect x="${f(cx - w / 2 - 1.6 * s)}" y="${f(cy - h / 2 - 1.6 * s)}" width="${f(w + 3.2 * s)}" height="${f(h + 3.2 * s)}" rx="${f(Math.min(w, h) * 0.3)}" fill="none" style="stroke:var(--accent,#0a84ff)" stroke-width="${f(Math.max(1, 1.3 * s))}"/>`)
  return `<g><title>${esc(`${p.label} · ${p.connector}${plugged ? ` · cabled${cable ? ` (${cable})` : ''}` : ''}`)}</title>${out.join('')}</g>`
}

// MARK: Port layout

interface Cluster { label: string; glyph: Glyph; ports: PortTemplate[]; colMajor: boolean; rows: number }

function clustersOf(ports: PortTemplate[]): Cluster[] {
  const out: Cluster[] = []
  for (const p of ports) {
    const g = glyphOf(p)
    const row = /^r(\d+)\.c\d+/.exec(p.id)?.[1]
    const label = row ? `row${row}` : (p.group ?? '')
    const last = out[out.length - 1]
    if (last && last.label === label && last.glyph === g) last.ports.push(p)
    else out.push({ label, glyph: g, ports: [p], colMajor: false, rows: 1 })
  }
  for (const c of out) if ((c.glyph === 'rj45' || c.glyph === 'sfp') && c.ports.length >= 6) { c.colMajor = true; c.rows = 2 }
  return out
}

/** Lays clusters of connectors into a box, shrinking and wrapping until they fit. */
function placePorts(ports: PortTemplate[], box: { x: number; y: number; w: number; h: number }, o: RackArtOptions, ink: string, align: 'left' | 'right' | 'spread', glyph?: Glyph): string {
  if (!ports.length || box.w < 10) return ''
  const cls = clustersOf(ports)
  if (glyph) for (const c of cls) c.glyph = glyph
  const out: string[] = []
  const bayRows = cls.length > 1 && cls.every((c) => c.label.startsWith('row'))
  if (bayRows) {
    // Patch bay: one row per strip, a white designation strip above each.
    const bandH = box.h / cls.length
    // Multipin rears (TT bays on DB25s): one connector per 8 jacks.
    if (cls[0].glyph === 'dsub') {
      cls.forEach((c, ri) => {
        const groups = Math.ceil(c.ports.length / 8), pitch = box.w / groups, F = FOOT.dsub
        const s = Math.min(1.2, pitch / F.px, (bandH * 0.6) / F.py)
        const y0 = box.y + bandH * ri
        for (let g = 0; g < groups; g++) {
          const ps = c.ports.slice(g * 8, g * 8 + 8)
          const cab = ps.map((x) => o.cabled.get(x.id)).find((x) => x !== undefined)
          const cx = box.x + pitch * (g + 0.5), cy = y0 + bandH * 0.55
          const rep = { ...ps[0], label: `${ps[0].label} – ${ps[ps.length - 1].label}` }
          out.push(connector('dsub', rep, cx, cy, s, cab, ps.some((x) => o.hot.has(x.id))))
          out.push(text(cx, cy - F.h * s / 2 - 2.4, `${jackNo(ps[0], g * 8)}–${jackNo(ps[ps.length - 1], g * 8 + 7)}`, Math.min(3, 2.4 * s + 0.5), ink, { anchor: 'middle', opacity: 0.8 }))
        }
      })
      return out.join('')
    }
    cls.forEach((c, ri) => {
      const n = c.ports.length, pitch = box.w / n, F = FOOT[c.glyph]
      const s = Math.min(1.4, pitch / F.px * 1.05, (bandH * 0.62) / F.h)
      const stripH = Math.min(5.5, bandH * 0.26), y0 = box.y + bandH * ri
      out.push(`<rect x="${f(box.x)}" y="${f(y0 + 0.6)}" width="${f(box.w)}" height="${f(stripH)}" fill="#f2f0e8" rx=".4"/>`)
      const fs = Math.min(stripH * 0.72, pitch * 0.62)
      c.ports.forEach((p, i) => {
        const cx = box.x + pitch * (i + 0.5), cy = y0 + stripH + (bandH - stripH) / 2 + 0.4
        if (fs >= 1.8) out.push(text(cx, y0 + 0.6 + stripH / 2 + 0.2, jackNo(p, i), fs, '#222', { anchor: 'middle' }))
        if (i > 0 && i % 8 === 0) out.push(`<line x1="${f(box.x + pitch * i)}" y1="${f(y0 + 0.6)}" x2="${f(box.x + pitch * i)}" y2="${f(y0 + 0.6 + stripH)}" stroke="#888" stroke-width=".3"/>`)
        out.push(connector(c.glyph, p, cx, cy, s, o.cabled.get(p.id), o.hot.has(p.id)))
      })
    })
    return out.join('')
  }
  const gap = 7
  const plan = (s: number) => {
    let total = 0
    const dims = cls.map((c) => {
      const F = FOOT[c.glyph]
      const cols = Math.ceil(c.ports.length / c.rows)
      const w = cols * F.px * s, h = c.rows * F.py * s
      total += w
      return { w, h }
    })
    return { dims, total: total + gap * s * (cls.length - 1) }
  }
  const labelH = 4.5
  const rowsFit = (c: Cluster, s: number) => Math.max(1, Math.floor((box.h - labelH * s) / (FOOT[c.glyph].py * s)))
  let s = Math.min(1, box.h / Math.max(...cls.map((c) => FOOT[c.glyph].py * c.rows + labelH)))
  for (const c of cls) c.rows = Math.min(c.rows, rowsFit(c, s))
  let p = plan(s)
  for (let guard = 0; guard < 400 && p.total > box.w; guard++) {
    // Wrap the widest cluster that still has room for another row; else shrink.
    const order = cls.map((c, i) => ({ c, w: p.dims[i].w })).sort((a, b) => b.w - a.w)
    const grow = order.find(({ c }) => c.rows < rowsFit(c, s) && c.rows < c.ports.length)
    if (grow) grow.c.rows++
    else { s *= 0.92; if (s < 0.22) break }
    p = plan(s)
  }
  const free = Math.max(0, box.w - p.total)
  const spread = align === 'spread' && cls.length > 1 ? Math.min(free / (cls.length - 1), 30) : 0
  let x = align === 'right' ? box.x + free : align === 'spread' ? box.x + Math.max(0, free - spread * (cls.length - 1)) / 2 : box.x
  cls.forEach((c, ci) => {
    const F = FOOT[c.glyph], d = p.dims[ci]
    const cols = Math.ceil(c.ports.length / c.rows)
    const showLabel = !!c.label && !c.label.startsWith('row') && !(c.colMajor && c.rows === 2 && F.px * s >= 7) && box.h - d.h >= labelH * s * 0.9 && d.w > c.label.length * 1.6 * s
    const top = box.y + Math.max(0, (box.h - d.h - (showLabel ? labelH * s : 0)) / 2) + (showLabel ? labelH * s : 0)
    if (showLabel) out.push(text(x + d.w / 2, top - labelH * s * 0.45, c.label.toUpperCase(), Math.min(3.2, 3 * s + 0.6), ink, { anchor: 'middle', spacing: 0.25, opacity: 0.75, maxW: Math.max(d.w, 30) }))
    const numbers = F.px * s >= 7
    c.ports.forEach((pt, i) => {
      const col = c.colMajor ? Math.floor(i / c.rows) : i % cols, row = c.colMajor ? i % c.rows : Math.floor(i / cols)
      // Gap every 6 / 8 columns, like switch and stage-box port blocks.
      const cx = x + (col + 0.5) * F.px * s, cy = top + (row + 0.5) * F.py * s - (F.py - F.h) * s * 0.18
      out.push(connector(c.glyph, pt, cx, cy, s, o.cabled.get(pt.id), o.hot.has(pt.id)))
      if (numbers) {
        const below = !(c.colMajor && c.rows === 2 && row === 0)
        const ny = below ? cy + F.h * s / 2 + 2.2 * s : cy - F.h * s / 2 - 2.2 * s
        out.push(text(cx, ny, jackNo(pt, i), Math.min(3, 2.6 * s + 0.4), ink, { anchor: 'middle', opacity: 0.85 }))
      }
    })
    x += d.w + gap * s + spread
  })
  return out.join('')
}

/** What a patch bay's front jacks are (its ports describe the rear). */
function bayFront(p: ProductDefinition, ports: PortTemplate[]): Glyph | undefined {
  const m = `${p.model} ${p.summary ?? ''}`
  if (/\bTT\b|bantam/i.test(m)) return 'bantam'
  if (/longframe|1\/4|TRS|\bPT\b/i.test(m)) return 'trs'
  if (/video|BNC|midsize|musa/i.test(m)) return 'bnc'
  if (/cat ?\d|rj-?45|ethernet|punch|data/i.test(m)) return 'rj45'
  const g = glyphOf(ports[0])
  return g === 'dsub' || g === 'euro' || g === 'multipin' ? 'bantam' : undefined
}

// MARK: Front-panel furniture

const lcd = (x: number, y: number, w: number, h: number, lines: string[] = []) => {
  const fs = Math.min(h / (lines.length + 1.2), 4.2)
  return `<rect x="${f(x - 1)}" y="${f(y - 1)}" width="${f(w + 2)}" height="${f(h + 2)}" rx="1.2" fill="#0a0a0b" stroke="#3a3b3f" stroke-width=".5"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx=".8" fill="#102a3a"/>` +
    lines.map((l, i) => text(x + 1.8, y + fs * (i + 0.9), l, fs, '#7fd3ff', { maxW: w - 3, opacity: 0.9 })).join('')
}
const led = (x: number, y: number, on: string | null, r = 1.1) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${on ?? '#2a2b2e'}"${on ? ` stroke="${on}" stroke-opacity=".35" stroke-width="${f(r * 0.9)}"` : ''}/>`
const button = (x: number, y: number, w: number, h: number) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(w, h) * 0.3)}" fill="#3a3b3f" stroke="#111" stroke-width=".4"/>`
const knob = (cx: number, cy: number, r: number, uid: string) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r + 0.8)}" fill="#0c0c0d"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#kn${uid})"/><line x1="${f(cx)}" y1="${f(cy - r * 0.85)}" x2="${f(cx)}" y2="${f(cy - r * 0.35)}" stroke="#fff" stroke-width="${f(Math.max(0.5, r * 0.12))}" stroke-linecap="round"/>`
const power = (cx: number, cy: number, r: number) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#2b2c30" stroke="#111" stroke-width=".5"/><path d="M ${f(cx - r * 0.38)} ${f(cy - r * 0.3)} a ${f(r * 0.5)} ${f(r * 0.5)} 0 1 0 ${f(r * 0.76)} 0" fill="none" stroke="#9ad" stroke-width="${f(r * 0.14)}" stroke-linecap="round"/><line x1="${f(cx)}" y1="${f(cy - r * 0.55)}" x2="${f(cx)}" y2="${f(cy - r * 0.05)}" stroke="#9ad" stroke-width="${f(r * 0.14)}" stroke-linecap="round"/>`
const vents = (x: number, y: number, w: number, h: number, slot = 2.2) => {
  const out: string[] = []
  const pitch = slot * 2.4, n = Math.max(1, Math.floor(h / pitch))
  const y0 = y + (h - n * pitch) / 2 + (pitch - slot) / 2
  for (let i = 0; i < n; i++) out.push(`<rect x="${f(x)}" y="${f(y0 + i * pitch)}" width="${f(w)}" height="${f(slot)}" rx="${f(slot / 2)}" fill="#0b0b0c"/>`)
  return out.join('')
}
const honeycomb = (x: number, y: number, w: number, h: number) => {
  const out: string[] = [], r = 1.5, dx = r * 2.6, dy = r * 2.3
  for (let j = 0, cy = y + r + 0.6; cy < y + h - r; j++, cy += dy) for (let cx = x + r + (j % 2 ? dx / 2 : 0); cx < x + w - r; cx += dx) out.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#0b0b0c"/>`)
  return out.join('')
}
const fan = (cx: number, cy: number, r: number) => {
  const rings = [1, 0.75, 0.5, 0.25].map((k) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * k)}" fill="none" stroke="#45464a" stroke-width=".7"/>`).join('')
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#0d0d0e"/>${rings}<line x1="${f(cx - r)}" y1="${f(cy)}" x2="${f(cx + r)}" y2="${f(cy)}" stroke="#45464a" stroke-width=".7"/><line x1="${f(cx)}" y1="${f(cy - r)}" x2="${f(cx)}" y2="${f(cy + r)}" stroke="#45464a" stroke-width=".7"/>`
}

const count = (p: ProductDefinition, re: RegExp) => p.ports.filter((x) => re.test(`${x.label} ${x.group ?? ''}`)).length

/** The front of a unit whose I/O is round the back: what that kind of unit has on its face. */
function furniture(p: ProductDefinition, box: { x: number; y: number; w: number; h: number }, uid: string): string {
  const { x, y, w, h } = box
  const out: string[] = []
  const cy = y + h / 2
  const m = `${p.model} ${p.summary ?? ''}`
  const lcdH = Math.min(h * 0.55, 18)
  const pw = (r = Math.min(4.2, h * 0.16)) => power(x + w - r - 1, cy, r)
  const tx = /\b(P\d+T|PSM|IEM|transmitter|SR\s?IEM|EW IEM)\b/i.test(m)
  if (p.category === 'wirelessReceiver' && !tx) {
    const q = /(\dQ|Q\b|quad)/i.test(p.model) ? 4 : /(\dD|D\b|dual)/i.test(p.model) ? 2 : /(\dS|S\b|single)/i.test(p.model) ? 1 : 0
    const ch = q || Math.max(1, Math.min(8, count(p, /\b(out|output)\b/i) - count(p, /a\s*\+\s*b|mix/i) || 1))
    const cw = (w - 16) / ch
    for (let i = 0; i < ch; i++) {
      const cx = x + i * cw
      out.push(lcd(cx + 2, cy - lcdH / 2, cw * 0.56, lcdH, [`CH ${i + 1}`, '▮▮▮▮▯ RF', '-12 dB']))
      out.push(led(cx + cw * 0.64, cy - lcdH * 0.3, '#30c25a'), led(cx + cw * 0.64, cy + lcdH * 0.05, i % 2 ? '#2a2b2e' : '#30c25a'))
      out.push(button(cx + cw * 0.7, cy - 3.6, cw * 0.11, 3.2), button(cx + cw * 0.7, cy + 0.6, cw * 0.11, 3.2), button(cx + cw * 0.84, cy - 3.6, cw * 0.09, 7.4))
    }
    out.push(pw())
    return out.join('')
  }
  if (tx) {
    out.push(lcd(x + 2, cy - lcdH / 2, Math.min(w * 0.35, 46), lcdH, ['TX 1', 'G55 518.200']))
    const bx = x + Math.min(w * 0.35, 46) + 8
    out.push(button(bx, cy - 4, 6, 3.4), button(bx, cy + 0.8, 6, 3.4), button(bx + 8, cy - 4, 6, 3.4), button(bx + 8, cy + 0.8, 6, 3.4))
    out.push(knob(bx + 26, cy, Math.min(7, h * 0.3), uid), led(bx + 37, cy - 4, '#30c25a'), led(bx + 37, cy + 1, '#f2b705'))
    out.push(`<circle cx="${f(x + w - 18)}" cy="${f(cy)}" r="${f(Math.min(5, h * 0.18))}" fill="#a7a8ad"/><circle cx="${f(x + w - 18)}" cy="${f(cy)}" r="${f(Math.min(2.6, h * 0.1))}" fill="#0c0c0d"/>`)
    out.push(pw())
    return out.join('')
  }
  if (p.category === 'amplifier') {
    const ch = Math.max(1, Math.min(16, count(p, /\b(out|output|speaker)\b/i) || 2))
    const mw = Math.min(10, (w * 0.45) / ch)
    out.push(honeycomb(x + 2, y + 2, w * 0.45, h - 4))
    for (let i = 0; i < ch; i++) for (let k = 0; k < 4; k++) out.push(led(x + w * 0.5 + i * mw + mw / 2, cy + (k - 1.5) * Math.min(4, h / 6), k === 0 ? '#e03131' : k === 1 ? '#f2b705' : '#30c25a', 0.9))
    out.push(pw())
    return out.join('')
  }
  if (p.category === 'ups' || /\bUPS\b|smart-?ups/i.test(m)) {
    out.push(honeycomb(x + 2, y + 2, w * 0.62, h - 4), lcd(x + w * 0.68, cy - lcdH / 2, Math.min(34, w * 0.18), lcdH, ['ONLINE', '120V 34%']))
    out.push(button(x + w * 0.68 + Math.min(34, w * 0.18) + 4, cy - 3, 5, 6), pw())
    return out.join('')
  }
  if (p.category === 'pdu' || p.category === 'powerSource') {
    out.push(lcd(x + 2, cy - Math.min(lcdH, 10) / 2, 20, Math.min(lcdH, 10), ['12.4A']), vents(x + 28, y + 3, w - 50, h - 6), pw())
    return out.join('')
  }
  if (p.category === 'computer' || p.category === 'mediaPlayer' || p.category === 'recorder') {
    out.push(vents(x + 2, y + 3, w * 0.55, h - 6), led(x + w * 0.62, cy - 3, '#4dabf7'), led(x + w * 0.62, cy + 3, '#2a2b2e'))
    out.push(`<rect x="${f(x + w * 0.66)}" y="${f(cy - 2)}" width="${f(w * 0.22)}" height="4" rx="1" fill="#0b0b0c"/>`, pw())
    return out.join('')
  }
  if (p.category === 'networkSwitch') { out.push(vents(x + 2, y + 3, w - 20, h - 6), pw()); return out.join('') }
  // DSP, processors, converters, switchers, encoders…: a small screen, status LEDs, a vent field.
  const sw = Math.min(42, w * 0.22)
  out.push(lcd(x + 2, cy - lcdH / 2, sw, lcdH, [p.model.slice(0, 14), 'READY']))
  const lx = x + sw + 9
  const labels = ['PWR', 'NET', 'SIG', 'ERR']
  labels.forEach((l, i) => { out.push(led(lx + i * 9, cy - 2.2, i === 0 || i === 1 ? '#30c25a' : i === 2 ? '#4dabf7' : null), text(lx + i * 9, cy + 3.4, l, 2.2, '#a8a9ad', { anchor: 'middle' })) })
  const vx = lx + labels.length * 9 + 4
  if (x + w - 14 - vx > 20) out.push(vents(vx, y + 3, x + w - 14 - vx, h - 6))
  out.push(pw())
  return out.join('')
}

// MARK: Whole unit

/** SVG (mm units) of one panel of a racked device. */
export function rackArtSVG(eq: EquipmentInstance, panel: RackFace, o: RackArtOptions): string {
  const p = eq.product
  const W = o.half ? RACK_W_MM / 2 : RACK_W_MM, H = o.heightU * U_MM - 0.8
  const L = lookOf(p), uid = o.uid.replace(/[^a-z0-9]/gi, '')
  const defs = `<defs><linearGradient id="pl${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.plateHi}"/><stop offset=".08" stop-color="${L.plate}"/><stop offset=".92" stop-color="${L.plate}"/><stop offset="1" stop-color="#0d0d0e"/></linearGradient>` +
    `<radialGradient id="kn${uid}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#6b6c70"/><stop offset="1" stop-color="#1d1e20"/></radialGradient></defs>`
  const out: string[] = [defs]
  const shelf = p.physical.mounting !== 'rack' && !p.plate && !p.fiber && p.category !== 'patchBay'
  const tagLabel = (x: number, y: number, maxW: number, size: number) => {
    const fs = Math.min(size, 9), tw = Math.min(maxW, eq.tag.length * fs * 0.62 + 4)
    return `<rect x="${f(x)}" y="${f(y - fs * 0.75)}" width="${f(tw)}" height="${f(fs * 1.5)}" rx=".6" fill="#f4f1e4" stroke="#00000040" stroke-width=".3"/>` + text(x + tw / 2, y + 0.2, eq.tag, fs, '#111', { anchor: 'middle', weight: 700, maxW: tw - 2 })
  }

  if (shelf) {
    // Shelf gear: a cantilever shelf with the box (to scale) sitting on it.
    out.push(`<rect x="0" y="0" width="${f(W)}" height="${f(Math.min(H, 9))}" fill="#26272a"/>`, `<rect x="0" y="${f(H - 3)}" width="${f(W)}" height="3" fill="#3a3b3f"/>`)
    for (const sx of [8, W - 8]) out.push(`<rect x="${f(sx - 4)}" y="2.4" width="8" height="4.2" rx="2" fill="#0b0b0c"/>`)
    const bw = Math.min(W - 60, Math.max(60, p.physical.widthMM || 200)), bh = Math.min(H - 6, Math.max(12, p.physical.heightMM || 40))
    const bx = (W - bw) / 2, by = H - 3 - bh
    const silver = L.silver
    out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="${f(silver ? 4 : 1.5)}" fill="${silver ? '#d4d5d8' : '#232427'}" stroke="#000" stroke-opacity=".5" stroke-width=".5"/>`)
    const ports = panelPorts(p, panel)
    if (ports.length) out.push(placePorts(ports, { x: bx + 6, y: by + 2, w: bw - 12, h: bh - 4 }, o, silver ? '#333' : L.ink, 'spread'))
    else {
      out.push(led(bx + bw - 6, by + bh / 2, '#e9ecef', 0.8))
      out.push(text(bx + bw / 2, by + bh / 2, p.model, Math.min(5, bh * 0.3), silver ? '#555' : '#bbb', { anchor: 'middle', maxW: bw - 16 }))
    }
    out.push(tagLabel(4, Math.min(H, 9) / 2 + 0.2, 60, 7))
    return wrap(W, H, out)
  }

  if (panel === 'front') {
    out.push(`<rect x="0" y="0" width="${f(W)}" height="${f(H)}" rx="1.2" fill="url(#pl${uid})"/>`)
    // Ears and their slotted holes.
    const ears = o.half ? [] : [EAR / 2, W - EAR / 2]
    for (const ex of ears) for (let u = 0; u < o.heightU; u++) for (const dy of [6.35, 38.1]) {
      out.push(`<rect x="${f(ex - 3.6)}" y="${f(u * U_MM + dy - 2.6)}" width="7.2" height="5.2" rx="2.6" fill="#08080a"/><circle cx="${f(ex)}" cy="${f(u * U_MM + dy)}" r="2.2" fill="#8d8e93"/><line x1="${f(ex - 1.3)}" y1="${f(u * U_MM + dy)}" x2="${f(ex + 1.3)}" y2="${f(u * U_MM + dy)}" stroke="#3a3b3e" stroke-width=".5"/>`)
    }
    if (!o.half) for (const ex of [EAR, W - EAR]) out.push(`<line x1="${f(ex)}" y1="1" x2="${f(ex)}" y2="${f(H - 1)}" stroke="#000" stroke-opacity=".45" stroke-width=".5"/>`)
    const x0 = o.half ? 4 : EAR + 4, x1 = o.half ? W - 4 : W - EAR - 4
    const ports = panelPorts(p, 'front')
    const bay = p.category === 'patchBay'
    // Maker / model silkscreen and the tag on label tape, top-left.
    const zone = bay ? 0 : o.half ? 52 : 74
    const one = o.heightU === 1
    const bs = one ? 6 : 7
    if (!bay) {
      out.push(text(x0, one ? 8.5 : 10, p.manufacturer.toUpperCase(), bs, L.ink, { weight: 700, spacing: 0.4, maxW: zone - 4 }))
      out.push(text(x0, one ? 16.5 : 19, p.model, bs * 0.78, L.ink, { opacity: 0.75, maxW: zone - 4 }))
      out.push(tagLabel(x0, one ? 31 : 32, zone - 6, one ? 8.5 : 9))
    } else {
      out.push(tagLabel(x0, 5, 40, Math.min(6, H * 0.14)))
    }
    const fx = x0 + zone, fw = x1 - fx
    if (ports.length) {
      const top = bay ? 10.5 : 3, bot = 3
      // A patch bay's cables land on the back; its front jacks are for patch cords.
      out.push(placePorts(ports, { x: fx, y: top, w: fw, h: H - top - bot }, bay ? { ...o, cabled: new Map() } : o, L.ink, bay ? 'left' : 'right', bay ? bayFront(p, ports) : undefined))
      if (!bay && !ports.length) out.push(power(x1 - 4, H / 2, 3.6))
    } else out.push(furniture(p, { x: fx, y: 3, w: fw, h: H - 6 }, uid))
    if (bay) out.push(text(x1, 5, `${p.manufacturer} ${p.model}`.toUpperCase(), Math.min(3.2, H * 0.08), L.ink, { anchor: 'end', opacity: 0.6, maxW: 120 }))
    return wrap(W, H, out)
  }

  // Rear: the chassis back between the rails (no ears), with the real rear I/O.
  const inset = o.half ? 3 : 20
  out.push(`<rect x="${f(inset)}" y="0" width="${f(W - inset * 2)}" height="${f(H)}" rx="1" fill="url(#pl${uid})"/>`)
  const ports = panelPorts(p, 'rear')
  const x0 = inset + 4, x1 = W - inset - 4
  out.push(tagLabel(x0, Math.min(8, H / 2), 44, Math.min(7.5, H * 0.2)))
  const sig = ports.filter((x) => !isPower(x)), pwr = ports.filter(isPower)
  const pw = pwr.length ? Math.min(x1 - x0 - 40, pwr.length * FOOT[glyphOf(pwr[0])].px + 6) : 0
  const tagW = 48
  const top = H > 30 ? 3 : 2
  if (pwr.length) out.push(placePorts(pwr, { x: x1 - pw, y: top, w: pw, h: H - top * 2 }, o, L.ink, 'right'))
  const sx = x0 + tagW, sw = x1 - pw - 6 - sx
  if (sig.length) out.push(placePorts(sig, { x: sx, y: top, w: sw, h: H - top * 2 }, o, L.ink, 'spread'))
  else if (sw > 40 && !['patchBay', 'connectorPanel', 'fiberEnclosure', 'pdu', 'powerSource', 'rackAccessory'].includes(p.category)) {
    const r = Math.min(H / 2 - 4, 22)
    out.push(fan(sx + sw / 2, H / 2, r))
  }
  if (H < 30) out.push(text(x0 + 1, H - 5, p.model, 3, L.ink, { opacity: 0.55, maxW: tagW - 4 }))
  else out.push(text(x0 + 1, H - 6, `${p.manufacturer} ${p.model}`, 3, L.ink, { opacity: 0.55, maxW: tagW - 4 }))
  return wrap(W, H, out)
}

const wrap = (W: number, H: number, out: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="100%" height="100%" preserveAspectRatio="none">${out.join('')}</svg>`

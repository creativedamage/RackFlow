// CAD-style rack elevation drawings: monochrome line work, rack titles above,
// ears with screws, tag on the left, manufacturer / model / type centred,
// blank, brush, vent and logo panels drawn and labelled.

import { productFace } from '../platelayout'
import { faceProduct } from '../boxports'
import { CATEGORIES, type Project, type Rack, type RackFace } from '../model'
import { RackLayout, type RackOccupant } from '../rack'
import { accessoryLabel } from '../rackpanels'
import { newSheet, sheetSize, type SheetOptions } from './sheet'
import { Svg, textWidth } from './svg'

export interface RackPrintOptions extends SheetOptions {
  face: RackFace | 'both'
  /** Racks to include (default: all). */
  racks?: string[]
  showUnitNumbers: boolean
  /** Draw devices on the other face as dashed outlines. */
  showOtherFace: boolean
}

export const defaultRackPrint = (): RackPrintOptions => ({
  sheet: 'ansiB', titleBlock: true, title: 'RACK ELEVATIONS', face: 'front', showUnitNumbers: false, showOtherFace: false,
})

const U = 44.45            // mm per rack unit
const PANEL_W = 482.6      // 19" panel incl. ears
const EAR = 15.9           // ear width
const SIDE = 14            // enclosure wall beside the rails
const RACK_W = PANEL_W + SIDE * 2
const GAP = 40             // between racks
const TITLE_H = 70         // rack title above each rack
const MIN_SCALE = 0.16     // smallest readable scale before splitting across sheets

/** One SVG string per sheet. */
export function rackElevationSheets(p: Project, o: RackPrintOptions): string[] {
  const racks = p.racks.filter((r) => !o.racks || o.racks.includes(r.id))
  if (!racks.length) return []
  const faces: RackFace[] = o.face === 'both' ? ['front', 'rear'] : [o.face]
  const jobs = faces.flatMap((f) => racks.map((r) => ({ rack: r, face: f })))
  // How many racks fit on one sheet at a readable scale.
  const probe = newSheet(p, o, 1, 1).area
  const tallest = Math.max(...racks.map((r) => r.spec.rackUnits)) * U + TITLE_H + 30
  // Height sets the best possible scale; only split when width makes it much worse than that.
  const byHeight = probe.h / tallest
  const byWidth = (k: number) => probe.w / (k * RACK_W + (k - 1) * GAP)
  let perSheet = jobs.length
  while (perSheet > 1 && byWidth(perSheet) < Math.min(byHeight, MIN_SCALE)) perSheet--
  // Keep front and rear of a rack on separate sheets but racks of one face together.
  const chunks: typeof jobs[] = []
  for (const f of faces) {
    const js = jobs.filter((j) => j.face === f)
    for (let i = 0; i < js.length; i += perSheet) chunks.push(js.slice(i, i + perSheet))
  }
  const sheets: string[] & { names?: string[] } = chunks.map((chunk, i) => {
    const sub = o.face === 'both' ? `${chunk[0].face.toUpperCase()} VIEW` : ''
    const { svg, area } = newSheet(p, o, i + 1, chunks.length, sub)
    const k = chunk.length
    const scale = Math.min(area.w / (k * RACK_W + (k - 1) * GAP), area.h / tallest, 1)
    const totalW = (k * RACK_W + (k - 1) * GAP) * scale
    const ox = area.x + (area.w - totalW) / 2, oy = area.y + 4
    svg.group(`translate(${ox} ${oy}) scale(${scale})`, (g) => {
      chunk.forEach((j, n) => drawRack(g, p, j.rack, j.face, n * (RACK_W + GAP), 0, tallest, o))
    })
    return svg.toString()
  })
  // Page names for viewers: "Front", "Rear" (numbered when a face needs several sheets).
  sheets.names = chunks.map((chunk, i) => {
    const face = chunk[0].face === 'front' ? 'Front' : 'Rear'
    const same = chunks.filter((c) => c[0].face === chunk[0].face)
    return same.length > 1 ? `${face} ${same.indexOf(chunks[i]) + 1}` : face
  })
  return sheets
}

function drawRack(svg: Svg, p: Project, rack: Rack, face: RackFace, x: number, y: number, tallest: number, o: RackPrintOptions) {
  const layout = RackLayout.of(p, rack.id)
  if (!layout) return
  const units = rack.spec.rackUnits
  const h = units * U
  const top = y + TITLE_H + (tallest - TITLE_H - 30 - h) // bottom-align racks of different heights
  // Title
  svg.text(x + RACK_W / 2, top - 22, `${rack.name.toUpperCase()}${o.face === 'both' ? ` (${face.toUpperCase()})` : ''}`, { size: 30, anchor: 'middle' })
  // Enclosure and rails
  svg.rect(x, top - 8, RACK_W, h + 16, { lw: 1.2 })
  const rx = x + SIDE
  svg.line(rx, top, rx, top + h, { lw: 0.6 })
  svg.line(rx + PANEL_W, top, rx + PANEL_W, top + h, { lw: 0.6 })
  svg.line(rx + EAR, top, rx + EAR, top + h, { lw: 0.35 })
  svg.line(rx + PANEL_W - EAR, top, rx + PANEL_W - EAR, top + h, { lw: 0.35 })
  const yOf = (unit: number) => top + (units - unit) * U // top edge of a unit
  // U ticks on the rails (visible where nothing is mounted)
  for (let u = 1; u <= units; u++) {
    svg.line(rx, yOf(u) + U, rx + 6, yOf(u) + U, { lw: 0.35 })
    svg.line(rx + PANEL_W - 6, yOf(u) + U, rx + PANEL_W, yOf(u) + U, { lw: 0.35 })
    if (o.showUnitNumbers) svg.text(x + SIDE / 2, yOf(u) + U / 2, String(u), { size: 7, anchor: 'middle', fill: '#555' })
  }
  for (const occ of layout.occupants) {
    const mine = occ.face === face || occ.depthMM > rack.spec.mountingDepthMM * 0.8
    if (!mine && !o.showOtherFace) continue
    const oy = yOf(occ.high), oh = (occ.high - occ.low + 1) * U
    const ox = rx + (occ.halfSlot === 'right' ? PANEL_W / 2 : 0), ow = occ.halfSlot ? PANEL_W / 2 : PANEL_W
    if (!mine) { svg.rect(ox + EAR, oy + 1, ow - EAR * 2, oh - 2, { lw: 0.35, dash: '6 4', stroke: '#777' }); continue }
    drawOccupant(svg, p, rack, occ, ox, oy, ow, oh)
  }
}

function screws(svg: Svg, x: number, y: number, h: number, w: number) {
  const r = 3.2
  const ys = h <= U * 1.01 ? [y + h / 2] : [y + U / 2, y + h - U / 2]
  for (const cx of [x + EAR / 2, x + w - EAR / 2]) for (const cy of ys) {
    svg.circle(cx, cy, r, { lw: 0.4 })
    svg.line(cx - r * 0.7, cy, cx + r * 0.7, cy, { lw: 0.3 })
    svg.line(cx, cy - r * 0.7, cx, cy + r * 0.7, { lw: 0.3 })
  }
}

function drawOccupant(svg: Svg, p: Project, rack: Rack, occ: RackOccupant, x: number, y: number, w: number, h: number) {
  const inner = { x: x + EAR, y: y + 0.8, w: w - EAR * 2, h: h - 1.6 }
  svg.rect(x, y + 0.5, w, h - 1, { lw: 0.6 })
  svg.rect(inner.x, inner.y, inner.w, inner.h, { lw: 0.35 })
  screws(svg, x, y, h, w)
  const midY = y + h / 2
  if (occ.ref.kind === 'accessory') {
    const a = rack.accessories.find((q) => q.id === occ.ref.id)
    if (!a) return
    const logo = a.logoId ? (p.logos ?? []).find((l) => l.id === a.logoId) : undefined
    // A logo replaces the default "BLANK PANEL" text (a label you typed still shows).
    const label = logo && !a.label?.trim() ? '' : accessoryLabel(a)
    if (logo && a.kind !== 'logo') {
      if (a.kind === 'vent') for (let sy = inner.y + 6; sy < inner.y + inner.h - 4; sy += 6) { svg.rect(inner.x + 20, sy, inner.w * 0.3 - 20, 2.5, { lw: 0.25, rx: 1.2 }); svg.rect(inner.x + inner.w * 0.7, sy, inner.w * 0.3 - 20, 2.5, { lw: 0.25, rx: 1.2 }) }
      svg.image(inner.x + inner.w * 0.32, inner.y + inner.h * 0.1, inner.w * 0.36, inner.h * 0.8, logo.dataUrl, { black: logo.light })
      if (label) svg.text(inner.x + 8, midY, label, { size: 9 })
      return
    }
    if (a.kind === 'brush' || a.kind === 'vent') {
      // Brush: dense vertical bristle hatch; vent: horizontal slots.
      if (a.kind === 'brush') for (let bx = inner.x + 3; bx < inner.x + inner.w - 3; bx += 2.2) svg.line(bx, inner.y + 4, bx, inner.y + inner.h - 4, { lw: 0.18 })
      else for (let sy = inner.y + 6; sy < inner.y + inner.h - 4; sy += 6) svg.rect(inner.x + 20, sy, inner.w - 40, 2.5, { lw: 0.25, rx: 1.2 })
      if (label) {
        const tw = textWidth(label, 10) + 10
        svg.rect(x + w / 2 - tw / 2, midY - 7, tw, 14, { fill: '#fff', lw: 0.35 })
        svg.text(x + w / 2, midY, label, { size: 10, anchor: 'middle' })
      }
      return
    }
    if (a.kind === 'logo') {
      if (logo) svg.image(inner.x + inner.w * 0.2, inner.y + inner.h * 0.08, inner.w * 0.6, inner.h * 0.84, logo.dataUrl, { black: logo.light })
      if (label) svg.text(x + w / 2, midY, label, { size: 10, anchor: 'middle' })
      return
    }
    if (a.kind === 'lacing') { for (let lx = inner.x + 10; lx < inner.x + inner.w - 10; lx += 18) svg.rect(lx, midY - 3, 8, 6, { lw: 0.25 }) }
    if (label) svg.text(x + w / 2, midY, label, { size: occ.halfSlot ? 9 : 11, anchor: 'middle' })
    return
  }
  const eq = p.equipment.find((e) => e.id === occ.ref.id)
  if (!eq) return
  const tagSize = Math.min(17, Math.max(10, h * 0.34))
  const half = !!occ.halfSlot
  // Rack connector panels and fiber enclosures: draw the real face (modules, connectors, engravings).
  const face = productFace(faceProduct(eq))
  if (face?.rack && !half) {
    svg.raw(`<g transform="translate(${x} ${y}) scale(${w / face.w} ${h / face.h})">${face.inner({ bare: true })}</g>`)
    svg.text(inner.x + 2, inner.y + 3.2, eq.tag, { size: 4.2, baseline: 'middle', weight: 'bold' })
    return
  }
  // Patch panels: draw their jacks – the real connector type, rows and count from the bay's template.
  if (eq.product.category === 'patchBay') {
    const bay = p.patchBays.find((b) => b.equipment === eq.id)
    const front = eq.product.ports.filter((q) => q.face !== 'rear')
    const rows = bay?.template.rows.length ? bay.template.rows.map((r) => r.strip.channelCount) : (() => {
      const n = Math.max(1, Math.round(h / U) >= 1 ? 2 : 1), per = Math.ceil((front.length || eq.product.ports.length) / n)
      return Array.from({ length: n }, () => per)
    })()
    const format = bay?.template.format ?? guessFormat(front[0]?.connector ?? eq.product.ports[0]?.connector)
    const bandH = inner.h / rows.length
    rows.forEach((per, row) => {
      const colW = (inner.w - 16) / Math.max(1, per)
      const cy = inner.y + bandH * (row + 0.58)
      // Designation strip above the jacks.
      svg.rect(inner.x + 8, inner.y + bandH * row + 0.6, inner.w - 16, Math.min(2.6, bandH * 0.18), { lw: 0.15 })
      for (let c = 0; c < per; c++) jack(svg, format, inner.x + 8 + colW * (c + 0.5), cy, colW, bandH)
    })
    svg.text(inner.x + 3, inner.y + 4, eq.tag, { size: 5, baseline: 'middle' })
    return
  }
  // Tag (left), maker + model and type (centred), handle (right).
  svg.text(inner.x + 4, h <= U * 1.01 ? midY : inner.y + tagSize * 0.8, eq.tag, { size: tagSize, maxWidth: half ? inner.w * 0.3 : inner.w * 0.2 })
  const line1 = `${eq.product.manufacturer} ${eq.product.model}`.toUpperCase()
  const line2 = (eq.product.category === 'other' ? eq.product.summary : CATEGORIES[eq.product.category].name).toUpperCase()
  const descSize = Math.min(11, Math.max(8, h * 0.23))
  const cx = half ? inner.x + inner.w * 0.62 : inner.x + inner.w * 0.55
  const maxW = half ? inner.w * 0.6 : inner.w * 0.58
  svg.text(cx, midY - descSize * 0.6, line1, { size: descSize, anchor: 'middle', maxWidth: maxW })
  svg.text(cx, midY + descSize * 0.6, line2, { size: descSize, anchor: 'middle', maxWidth: maxW })
  if (!half) svg.rect(inner.x + inner.w - 34, inner.y + Math.min(inner.h / 2, U / 2) - 5, 26, 10, { rx: 5, lw: 0.4 })
}

/** Sheet size for the HTML / PDF wrapper. */
export const rackSheetSize = (o: RackPrintOptions) => sheetSize(o)

type JackFormat = 'ttBantam' | 'longFrame' | 'quarterInchTRS' | 'bncVideo' | 'bnc12G' | 'midsizeVideo' | 'rj45' | 'fiberLC' | 'xlr'
function guessFormat(c: string | undefined): JackFormat {
  if (!c) return 'ttBantam'
  if (/bnc|din1\.0|hdbnc/i.test(c)) return 'bncVideo'
  if (/rj45|ethercon/i.test(c)) return 'rj45'
  if (/lc|sc|st|fiber/i.test(c)) return 'fiberLC'
  if (/xlr/i.test(c)) return 'xlr'
  if (/trs6|quarter|1\/4/i.test(c)) return 'quarterInchTRS'
  return 'ttBantam'
}

/** One front jack, drawn to look like its connector so TT, video, network and fiber bays read differently. */
function jack(svg: Svg, f: JackFormat, cx: number, cy: number, colW: number, bandH: number) {
  const lim = (k: number) => Math.min(colW * k, bandH * k)
  switch (f) {
    case 'bncVideo': case 'bnc12G': case 'midsizeVideo': {
      const r = lim(f === 'midsizeVideo' ? 0.3 : 0.36)
      svg.circle(cx, cy, r, { lw: 0.35 })
      svg.circle(cx, cy, r * 0.55, { lw: 0.2 })
      svg.circle(cx, cy, r * 0.14, { fill: '#000', lw: 0 })
      svg.line(cx - r * 1.25, cy, cx - r, cy, { lw: 0.4 }); svg.line(cx + r, cy, cx + r * 1.25, cy, { lw: 0.4 })
      return
    }
    case 'rj45': {
      const w = lim(0.62), hh = w * 0.82
      svg.rect(cx - w / 2, cy - hh / 2, w, hh, { lw: 0.3, rx: 0.3 })
      svg.rect(cx - w * 0.22, cy + hh / 2 - hh * 0.28, w * 0.44, hh * 0.28, { lw: 0.2 })
      for (let k = 0; k < 4; k++) svg.line(cx - w * 0.3 + k * w * 0.2, cy - hh * 0.3, cx - w * 0.3 + k * w * 0.2, cy - hh * 0.1, { lw: 0.12 })
      return
    }
    case 'fiberLC': {
      const w = lim(0.32), hh = w * 1.3
      for (const dx of [-w * 0.62, w * 0.62]) { svg.rect(cx + dx - w / 2, cy - hh / 2, w, hh, { lw: 0.25 }); svg.circle(cx + dx, cy, w * 0.18, { fill: '#000', lw: 0 }) }
      return
    }
    case 'xlr': {
      const r = lim(0.4)
      svg.circle(cx, cy, r, { lw: 0.35 })
      for (const [dx, dy] of [[-0.38, -0.18], [0.38, -0.18], [0, 0.38]]) svg.circle(cx + dx * r, cy + dy * r, r * 0.12, { fill: '#000', lw: 0 })
      svg.rect(cx - r * 0.12, cy - r * 1.02, r * 0.24, r * 0.2, { lw: 0.15 })
      return
    }
    case 'quarterInchTRS': {
      const r = lim(0.3)
      svg.circle(cx, cy, r, { lw: 0.35 }); svg.circle(cx, cy, r * 0.45, { lw: 0.25 })
      return
    }
    default: { // TT / Bantam, long-frame: small barrel
      const r = lim(f === 'longFrame' ? 0.3 : 0.24)
      svg.circle(cx, cy, r, { lw: 0.3 }); svg.circle(cx, cy, r * 0.42, { fill: '#000', lw: 0 })
    }
  }
}

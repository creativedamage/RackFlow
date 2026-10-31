// LED wall map drawing – one renderer for the on-screen editor and printed
// sheets. Data view: each processor output's chain in its own colour, panel
// order numbers, arrows along the path, and a home-run line from the wall edge
// to the first panel. Power view: the same for circuits.

import { cellKey, chains, wallStats, type Cell, type Corner, type LedWall } from '../led'
import { newSheet, sheetSize, type SheetOptions } from './sheet'
import { Svg, textWidth } from './svg'
import type { Project } from '../model'

export type LedView = 'data' | 'power'

const DATA_COLORS = ['#1971c2', '#e8590c', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#f08c00', '#5f3dc4', '#d6336c', '#087f5b', '#e67700', '#364fc7']
const POWER_COLORS = ['#c92a2a', '#e67700', '#5c940d', '#1864ab', '#862e9c', '#a61e4d', '#0b7285', '#d9480f', '#2b8a3e', '#364fc7']
export const chainColor = (view: LedView, i: number) => (view === 'data' ? DATA_COLORS : POWER_COLORS)[(i - 1) % (view === 'data' ? DATA_COLORS.length : POWER_COLORS.length)]

const edgeOf = (c: Corner) => ({ bottom: c.startsWith('bottom'), right: c.endsWith('Right') })

export interface LedMapOpts { mono?: boolean; showRemoved?: boolean; interactive?: boolean }

/**
 * Draws the wall into `svg` with its top-left at (x, y), scaled so one
 * millimetre of wall = `scale` drawing units.
 */
export function drawLedMap(svg: Svg, w: LedWall, view: LedView, x: number, y: number, scale: number, o: LedMapOpts = {}) {
  const cw = w.panel.widthMM * scale, ch = w.panel.heightMM * scale
  const removed = new Set(w.removed)
  const cs = chains(w, view)
  const where = new Map<string, { chain: number; n: number }>()
  for (const c of cs) c.cells.forEach((cell, i) => where.set(cellKey(cell), { chain: c.index, n: i + 1 }))
  const center = (cell: Cell) => ({ x: x + (cell.c + 0.5) * cw, y: y + (cell.r + 0.5) * ch })
  const font = Math.max(2.2, Math.min(cw, ch) * 0.18)
  // Panels
  for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
    const k = `${c},${r}`
    const px = x + c * cw, py = y + r * ch
    if (removed.has(k)) {
      if (o.showRemoved) svg.raw(`<rect data-cell="${k}" x="${px}" y="${py}" width="${cw}" height="${ch}" fill="none" stroke="#999" stroke-width="${Math.max(0.15, scale * 2)}" stroke-dasharray="${cw / 10} ${cw / 10}"${o.interactive ? ' style="cursor:pointer"' : ''}/>`)
      continue
    }
    const at = where.get(k)
    const color = at ? chainColor(view, at.chain) : '#888'
    const fill = o.mono ? '#fff' : `${color}22`
    svg.raw(`<rect data-cell="${k}" x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${fill}" stroke="#222" stroke-width="${Math.max(0.2, scale * 3)}"${o.interactive ? ' style="cursor:pointer"' : ''}/>`)
    if (at) {
      const label = `${view === 'data' ? 'P' : 'C'}${at.chain}.${at.n}`
      // Label in the panel's top-left corner, clear of the chain line through the centre.
      svg.text(px + font * 0.35, py + font * 0.75, label, { size: font * 0.8, fill: o.mono ? '#000' : color, weight: 'bold' })
    }
  }
  // Chains: path through panel centres with arrows; home run from the edge to the first panel.
  for (const c of cs) {
    const color = o.mono ? '#000' : chainColor(view, c.index)
    const pts = c.cells.map(center)
    const lw = Math.max(0.35, Math.min(cw, ch) * 0.035)
    if (pts.length > 1) svg.polyline(pts, { lw, stroke: color })
    for (let i = 1; i < pts.length; i++) arrow(svg, pts[i - 1], pts[i], lw * 4, color)
    // Home run: straight off the nearest top / bottom edge (where the cable drops in).
    const first = c.cells[0], p0 = center(first)
    const s = view === 'data' ? w.data : w.power
    // Cable drops in at the wall edge nearest the chain's first panel (the start corner's edge on a tie).
    const fromBottom = w.rows - 1 - first.r, fromTop = first.r
    const e = { bottom: fromBottom === fromTop ? edgeOf(s.start).bottom : fromBottom < fromTop }
    const edgeY = e.bottom ? y + w.rows * ch : y
    const out = (e.bottom ? 1 : -1) * Math.max(ch * 0.55, 6)
    const hy = edgeY + out
    svg.line(p0.x, p0.y, p0.x, hy, { lw: lw * 1.3, stroke: color, dash: `${lw * 4} ${lw * 2}` })
    const tag = `${view === 'data' ? 'PORT' : 'CIRCUIT'} ${c.index}`
    const tw = textWidth(tag, font * 0.85) + font
    svg.rect(p0.x - tw / 2, hy + (e.bottom ? 0 : -font * 1.6), tw, font * 1.6, { fill: color, stroke: color, lw: 0.1, rx: font * 0.3 })
    svg.text(p0.x, hy + (e.bottom ? font * 0.8 : -font * 0.8), tag, { size: font * 0.85, anchor: 'middle', fill: '#fff', weight: 'bold' })
  }
}

function arrow(svg: Svg, a: { x: number; y: number }, b: { x: number; y: number }, size: number, color: string) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const p1 = { x: mx + size * Math.cos(ang), y: my + size * Math.sin(ang) }
  const p2 = { x: mx + size * Math.cos(ang + 2.5), y: my + size * Math.sin(ang + 2.5) }
  const p3 = { x: mx + size * Math.cos(ang - 2.5), y: my + size * Math.sin(ang - 2.5) }
  svg.path(`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} Z`, { fill: color, stroke: color, lw: 0.1 })
}

/** Stand-alone SVG of one view (for the editor canvas): wall + margins for home runs. */
export function ledMapSVG(w: LedWall, view: LedView, opts: LedMapOpts = {}): string {
  const W = w.cols * w.panel.widthMM, H = w.rows * w.panel.heightMM
  const m = Math.max(W, H) * 0.12 + 300
  const svg = new Svg(W + m * 2, H + m * 2)
  drawLedMap(svg, w, view, m, m, 1, opts)
  return svg.toString().replace(/width="[^"]*mm" height="[^"]*mm"/, `width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`).replace('<rect width="100%" height="100%" fill="#fff"/>', '')
}

export interface LedPrintOptions extends SheetOptions { walls?: string[]; views: LedView[] }
export const defaultLedPrint = (): LedPrintOptions => ({ sheet: 'ansiB', titleBlock: true, title: 'LED WALL MAP', views: ['data', 'power'] })

/** Printed sheets: one per wall per view, with a stats table. */
export function ledSheets(p: Project, o: LedPrintOptions): string[] {
  const walls = (p.ledWalls ?? []).filter((w) => !o.walls || o.walls.includes(w.id))
  const jobs = walls.flatMap((w) => o.views.map((v) => ({ w, v })))
  return jobs.map(({ w, v }, i) => {
    const { svg, area } = newSheet(p, o, i + 1, jobs.length, `${w.name.toUpperCase()} – ${v === 'data' ? 'DATA' : 'POWER'}`)
    const st = wallStats(w)
    // Stats column on the right.
    const colW = Math.min(80, area.w * 0.22)
    const rows: [string, string][] = [
      ['PANEL', `${w.panel.manufacturer} ${w.panel.model}`], ['PITCH', `${w.panel.pitchMM} mm`],
      ['GRID', `${w.cols} × ${w.rows} (${st.panels} panels)`], ['RESOLUTION', `${st.pxW} × ${st.pxH} px`],
      ['SIZE', `${st.widthM.toFixed(2)} × ${st.heightM.toFixed(2)} m`], ['ASPECT', st.aspect],
      ['WEIGHT', `${st.weightKG.toFixed(0)} kg`], ['POWER', `${(st.maxWatts / 1000).toFixed(1)} kW max · ${st.maxAmps.toFixed(1)} A @ ${w.power.voltage} V`],
      ['DATA PORTS', `${st.dataPorts} (≤ ${st.dataLimit} panels each)`], ['CIRCUITS', `${st.circuits} × ${w.power.circuitAmps} A (≤ ${st.powerLimit} panels each)`],
    ]
    const sx = area.x + area.w - colW
    svg.rect(sx, area.y, colW, rows.length * 9 + 8, { lw: 0.35 })
    svg.text(sx + 3, area.y + 4, v === 'data' ? 'DATA MAP' : 'POWER MAP', { size: 3.2, weight: 'bold' })
    rows.forEach(([k, val], j) => {
      svg.text(sx + 3, area.y + 10 + j * 9, k, { size: 2.2, fill: '#555' })
      svg.text(sx + 3, area.y + 14 + j * 9, val.toUpperCase(), { size: 2.8, maxWidth: colW - 6 })
    })
    const W = w.cols * w.panel.widthMM, H = w.rows * w.panel.heightMM
    // Leave room above and below the wall for home-run lines + tags (≈ 0.55 panel + tag).
    const titleH = 10
    const fit = (k: number) => {
      const cell = Math.min(w.panel.widthMM, w.panel.heightMM) * k
      return Math.max(w.panel.heightMM * k * 0.55, 6) + Math.max(2.2, cell * 0.18) * 1.8 + 2
    }
    const roomW = area.w - colW - 12
    let scale = Math.min(roomW / W, (area.h - titleH) / H)
    for (let i = 0; i < 4; i++) scale = Math.min(roomW / W, (area.h - titleH - 2 * fit(scale)) / H)
    const pad = fit(scale)
    const ox = area.x + (roomW - W * scale) / 2, oy = area.y + titleH + pad + (area.h - titleH - 2 * pad - H * scale) / 2
    svg.text(area.x + roomW / 2, area.y + 5, `${w.name.toUpperCase()} – ${v === 'data' ? 'DATA FLOW' : 'POWER FLOW'} (VIEWED FROM FRONT)`, { size: 4, anchor: 'middle', weight: 'bold' })
    drawLedMap(svg, w, v, ox, oy, scale, { mono: false })
    return svg.toString()
  })
}

export const ledSheetSize = (o: LedPrintOptions) => sheetSize(o)

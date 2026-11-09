// Button-cap label sheets: free-typed labels for switcher / panel button caps
// (Ross Carbonite, Acuity…), printed at 1:1 on clear film and cut out. They
// aren't tied to the wiring – just a grid of caps you type into.

import { AVG_ADVANCE_EM, pageSize, PT_PER_MM, type LabelPage, type LabelPrimitive, type PrintOptions } from './patchbay/layout'
import { newId, type Project } from './model'

export interface CapSheet {
  id: string
  name: string
  /** One cap insert, millimetres. */
  capW: number
  capH: number
  cols: number
  rows: number
  /** Space between caps on the printed sheet (mm). */
  gapMM: number
  /** Row-major text per cap ("" = blank); lines split on \n. */
  texts: string[]
  /** Optional colour behind each cap (hex), row-major. */
  fills?: (string | null)[]
  /** Fixed font size (pt); unset = fit each cap. */
  fontPt?: number
  bold?: boolean
}

export interface CapPreset { key: string; name: string; capW: number; capH: number; cols: number; rows: number; note?: string }

/** Starting points – measure one of your caps and adjust the size before a full run. */
export const CAP_PRESETS: CapPreset[] = [
  { key: 'ross.xpt.24', name: 'Ross crosspoint row – 24 caps', capW: 13, capH: 13, cols: 24, rows: 1, note: 'Nominal – measure a cap and set the size' },
  { key: 'ross.xpt.16', name: 'Ross crosspoint row – 16 caps', capW: 13, capH: 13, cols: 16, rows: 1, note: 'Nominal – measure a cap and set the size' },
  { key: 'ross.xpt.3x24', name: 'Ross M/E bus block – 3 × 24 caps', capW: 13, capH: 13, cols: 24, rows: 3, note: 'Nominal – measure a cap and set the size' },
  { key: 'ross.user.10', name: 'Ross user / memory buttons – 2 × 5', capW: 13, capH: 13, cols: 5, rows: 2, note: 'Nominal – measure a cap and set the size' },
  { key: 'custom', name: 'Custom grid', capW: 15, capH: 15, cols: 8, rows: 4 },
]

export const capSheetsOf = (p: Project): CapSheet[] => p.buttonCaps ?? []

export function newCapSheet(p: Project, preset: CapPreset = CAP_PRESETS[0], name?: string): CapSheet {
  const n = capSheetsOf(p).length + 1
  const s: CapSheet = { id: newId(), name: name ?? `Button Caps ${n}`, capW: preset.capW, capH: preset.capH, cols: preset.cols, rows: preset.rows, gapMM: 2, texts: Array(preset.cols * preset.rows).fill(''), bold: true }
  p.buttonCaps = [...capSheetsOf(p), s]
  return s
}

/** Changes the grid, keeping each cap's text where it was (row / column). */
export function resizeCapGrid(s: CapSheet, cols: number, rows: number) {
  cols = Math.max(1, Math.min(64, Math.round(cols))); rows = Math.max(1, Math.min(32, Math.round(rows)))
  const texts: string[] = [], fills: (string | null)[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const old = r < s.rows && c < s.cols ? r * s.cols + c : -1
    texts.push(old >= 0 ? s.texts[old] ?? '' : '')
    fills.push(old >= 0 ? s.fills?.[old] ?? null : null)
  }
  s.cols = cols; s.rows = rows; s.texts = texts
  s.fills = fills.some(Boolean) ? fills : undefined
}

/** Font size that fits these lines in a cap (pt). */
export function capFontPt(lines: string[], w: number, h: number, fixed?: number): number {
  if (fixed) return fixed
  const n = Math.max(1, lines.length)
  const longest = Math.max(1, ...lines.map((l) => l.length))
  return Math.max(3, Math.min(9, (h / n / 1.2) * PT_PER_MM, (w / (longest * AVG_ADVANCE_EM)) * PT_PER_MM))
}

export interface CapPrintOptions extends Pick<PrintOptions, 'stock' | 'landscape' | 'cutMarks' | 'captions'> {
  /** Outline round each cap (cut line). */
  outlines: boolean
}

/**
 * Lays the sheets out at 1:1 on pages: a caption, then the grid of caps with
 * thin cut outlines (and crop marks at the block corners). A grid wider than
 * the paper is split into column blocks; blocks flow down the page.
 */
export function layoutCaps(sheets: CapSheet[], o: CapPrintOptions): LabelPage[] {
  const { w: pw, h: ph } = pageSize({ ...o, gapMM: 0 })
  const m = o.stock.marginMM
  const pages: LabelPage[] = []
  let items: LabelPrimitive[] = []
  let y = m
  const flush = () => { if (items.length) pages.push({ widthMM: pw, heightMM: ph, items }); items = []; y = m }
  for (const s of sheets) {
    const pitchX = s.capW + s.gapMM, pitchY = s.capH + s.gapMM
    const perRow = Math.max(1, Math.floor((pw - 2 * m + s.gapMM) / pitchX))
    for (let c0 = 0; c0 < s.cols; c0 += perRow) {
      const c1 = Math.min(s.cols, c0 + perRow)
      const capH = o.captions ? 7 : 0
      const blockH = capH + s.rows * pitchY - s.gapMM
      if (y + blockH > ph - m && y > m) flush()
      if (o.captions) items.push({ t: 'text', lines: [`${s.name}${s.cols > perRow ? ` – caps ${c0 + 1}–${c1}` : ''} · ${s.capW}×${s.capH} mm`], r: { x: m, y, w: pw - 2 * m, h: 3.6 }, font: 'Helvetica, Arial, sans-serif', sizePt: 7, color: '#555555', bold: false, align: 'left' })
      const top = y + capH
      for (let r = 0; r < s.rows; r++) for (let c = c0; c < c1; c++) {
        const i = r * s.cols + c
        const x = m + (c - c0) * pitchX, cy = top + r * pitchY
        const rect = { x, y: cy, w: s.capW, h: s.capH }
        const fill = s.fills?.[i]
        if (fill) items.push({ t: 'rect', r: rect, stroke: null, fill, lw: 0 })
        if (o.outlines) items.push({ t: 'rect', r: rect, stroke: '#9a9a9a', fill: null, lw: 0.08 })
        const lines = (s.texts[i] ?? '').split('\n').map((l) => l.trimEnd())
        if (lines.some((l) => l.trim())) {
          const inner = { x: x + 0.4, y: cy + 0.4, w: s.capW - 0.8, h: s.capH - 0.8 }
          items.push({ t: 'text', lines, r: inner, font: 'Helvetica, Arial, sans-serif', sizePt: capFontPt(lines, inner.w, inner.h, s.fontPt), color: '#000000', bold: s.bold !== false, align: 'center' })
        }
      }
      if (o.cutMarks) {
        const bx0 = m, by0 = top, bx1 = m + (c1 - c0) * pitchX - s.gapMM, by1 = top + s.rows * pitchY - s.gapMM, L = 3, g = 1
        for (const [cx, cy, sx, sy] of [[bx0, by0, -1, -1], [bx1, by0, 1, -1], [bx0, by1, -1, 1], [bx1, by1, 1, 1]] as const) {
          items.push({ t: 'line', x1: cx + sx * g, y1: cy, x2: cx + sx * (g + L), y2: cy, stroke: '#000000', lw: 0.1 })
          items.push({ t: 'line', x1: cx, y1: cy + sy * g, x2: cx, y2: cy + sy * (g + L), stroke: '#000000', lw: 0.1 })
        }
      }
      y += blockH + 6
    }
  }
  flush()
  return pages
}

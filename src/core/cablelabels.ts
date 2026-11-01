// Wrap-around cable labels: self-laminating laser sheets (US Letter). The top
// "print area" carries the text; the clear tail wraps over it. Each pull
// schedule row becomes one or more labels (one per cable end by default).
//
// The presets are typical sheet layouts for the common label sizes – hold a
// test print (outlines only) against your sheet and adjust under Custom if the
// maker's layout differs.

import type { PullRow } from './pullschedule'

export interface LabelTemplate {
  id: string
  name: string
  /** Sheet (in). */
  pageW: number
  pageH: number
  /** One label (in): width runs along the cable, height wraps around it. */
  labelW: number
  labelH: number
  /** White printable area at the top of each label (in). */
  printH: number
  cols: number
  rows: number
  /** Gaps between labels (in). */
  gapX: number
  gapY: number
  /** Top-left label corner (in); left/top margins. */
  left: number
  top: number
}

const centred = (t: Omit<LabelTemplate, 'left' | 'top'>): LabelTemplate => ({
  ...t,
  left: Math.round(((t.pageW - t.cols * t.labelW - (t.cols - 1) * t.gapX) / 2) * 1000) / 1000,
  top: Math.round(((t.pageH - t.rows * t.labelH - (t.rows - 1) * t.gapY) / 2) * 1000) / 1000,
})

export const LABEL_TEMPLATES: LabelTemplate[] = [
  centred({ id: 'sl-1x1.5', name: '1" × 1.5" – print area 1" × 0.5" (e.g. Panduit S100X150)', pageW: 8.5, pageH: 11, labelW: 1, labelH: 1.5, printH: 0.5, cols: 7, rows: 7, gapX: 0.125, gapY: 0 }),
  centred({ id: 'sl-1x1.25', name: '1" × 1.25" – print area 1" × 0.5" (e.g. Brady WML-311)', pageW: 8.5, pageH: 11, labelW: 1, labelH: 1.25, printH: 0.5, cols: 7, rows: 8, gapX: 0.125, gapY: 0 }),
  centred({ id: 'sl-1x2.5', name: '1" × 2.5" – print area 1" × 0.75" (e.g. Brady WML-511)', pageW: 8.5, pageH: 11, labelW: 1, labelH: 2.5, printH: 0.75, cols: 7, rows: 4, gapX: 0.125, gapY: 0 }),
  centred({ id: 'sl-1.5x2', name: '1.5" × 2" – print area 1.5" × 0.75"', pageW: 8.5, pageH: 11, labelW: 1.5, labelH: 2, printH: 0.75, cols: 5, rows: 5, gapX: 0.125, gapY: 0 }),
  centred({ id: 'sl-2x1.5', name: '2" × 1.5" – print area 2" × 0.5" (8 per sheet)', pageW: 8.5, pageH: 11, labelW: 2, labelH: 1.5, printH: 0.5, cols: 4, rows: 2, gapX: 0.1, gapY: 0.25 }),
]

export interface LabelContent { cable: boolean; from: boolean; to: boolean; type: boolean; length: boolean }
export const DEFAULT_CONTENT: LabelContent = { cable: true, from: false, to: false, type: false, length: false }

export interface LabelOptions {
  /** Labels per pull row (2 = one for each end). */
  copies: number
  content: LabelContent
  /** Leave the first n labels of the first sheet empty (a partly used sheet). */
  skip: number
  /** Draw label outlines (test print / preview). */
  outlines?: boolean
  /** Shift everything (in) to match the printer. */
  offsetX?: number
  offsetY?: number
}

export interface LabelText { big: string; lines: string[] }

/** What goes on a label for a pull row. */
export function labelText(r: PullRow, c: LabelContent, lengthText?: string): LabelText {
  const lines: string[] = []
  const end = (e: { tag: string; port: string } | null) => (e ? `${e.tag} ${e.port}` : '')
  if (c.from) lines.push(`FROM ${end(r.from)}`)
  if (c.to && r.to) lines.push(`TO ${end(r.to)}`)
  const extra = [c.type ? (r.channels ? `${r.type} ${r.channels.used}/${r.channels.of}ch` : r.type) : '', c.length ? lengthText ?? '' : ''].filter(Boolean).join(' · ')
  if (extra) lines.push(extra)
  return { big: c.cable ? r.label : '', lines }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n = (v: number) => Math.round(v * 10000) / 10000

/** Font size (in) so `text` fits `w` – Helvetica-ish average glyph ≈ 0.56 em (0.62 bold). */
const fit = (text: string, w: number, max: number, bold = false) => Math.max(0.028, Math.min(max, w / Math.max(1, text.length * (bold ? 0.62 : 0.56))))

function drawLabel(t: LabelTemplate, x: number, y: number, txt: LabelText | null, outlines: boolean): string {
  const out: string[] = []
  if (outlines) {
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${t.labelW}" height="${t.labelH}" rx="0.04" fill="none" stroke="#999" stroke-width="0.006" stroke-dasharray="0.03 0.02"/>`)
    out.push(`<line x1="${n(x)}" y1="${n(y + t.printH)}" x2="${n(x + t.labelW)}" y2="${n(y + t.printH)}" stroke="#bbb" stroke-width="0.005"/>`)
  }
  if (!txt) return out.join('')
  const pad = Math.min(0.05, t.labelW * 0.05), w = t.labelW - pad * 2
  const lines = txt.lines.filter(Boolean)
  // Split the print area: the cable number gets ~45% when there are detail lines.
  const avail = t.printH - pad * 1.2
  const bigH = txt.big ? (lines.length ? avail * 0.45 : avail * 0.8) : 0
  const lineH = lines.length ? (avail - bigH) / lines.length : 0
  let cy = y + pad * 0.6
  if (txt.big) {
    const fs = fit(txt.big, w, bigH * 0.9, true)
    cy += bigH
    out.push(`<text x="${n(x + t.labelW / 2)}" y="${n(cy - (bigH - fs) / 2 - fs * 0.12)}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${n(fs)}" text-anchor="middle">${esc(txt.big)}</text>`)
  }
  for (const l of lines) {
    const fs = fit(l, w, Math.min(lineH * 0.88, 0.11))
    cy += lineH
    out.push(`<text x="${n(x + t.labelW / 2)}" y="${n(cy - (lineH - fs) / 2 - fs * 0.12)}" font-family="Helvetica, Arial, sans-serif" font-size="${n(fs)}" text-anchor="middle">${esc(l)}</text>`)
  }
  return out.join('')
}

/** One SVG per sheet (inch units, exact page size). */
export function labelSheets(t: LabelTemplate, labels: LabelText[], o: LabelOptions): string[] {
  const per = t.cols * t.rows
  const slots: (LabelText | null)[] = [...Array(Math.max(0, Math.min(o.skip, per - 1))).fill(null), ...labels]
  const pages: string[] = []
  const ox = o.offsetX ?? 0, oy = o.offsetY ?? 0
  for (let p = 0; p * per < Math.max(1, slots.length); p++) {
    const body: string[] = []
    for (let i = 0; i < per; i++) {
      const k = p * per + i
      const c = i % t.cols, r = Math.floor(i / t.cols)
      const x = t.left + ox + c * (t.labelW + t.gapX), y = t.top + oy + r * (t.labelH + t.gapY)
      body.push(drawLabel(t, x, y, slots[k] ?? null, !!o.outlines))
    }
    pages.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${t.pageW}in" height="${t.pageH}in" viewBox="0 0 ${t.pageW} ${t.pageH}">${body.join('')}</svg>`)
  }
  return pages
}

/** Labels for pull rows: `copies` of each (one per cable end by default). */
export function labelsFor(rows: PullRow[], o: Pick<LabelOptions, 'copies' | 'content'>, lengthOf?: (r: PullRow) => string): LabelText[] {
  return rows.filter((r) => r.cable).flatMap((r) => Array(Math.max(1, o.copies)).fill(labelText(r, o.content, lengthOf?.(r))))
}

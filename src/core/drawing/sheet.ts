// Sheet sizes, borders and the title block shared by printed drawings.

import type { LogoAsset, Project } from '../model'
import { Svg } from './svg'
import { sheetLabel } from '../sheetnumbers'
import { fieldValue, fillVariables, itemRect, titleBlockBoxes, titleBlockOf, type TBContext, type TBSide, type TitleBlockTemplate } from '../titleblock'

export interface SheetSize { key: string; name: string; w: number; h: number }
/** Landscape dimensions in mm. */
export const SHEETS: SheetSize[] = [
  { key: 'ansiB', name: 'Tabloid / ANSI B (11×17 in)', w: 431.8, h: 279.4 },
  { key: 'archC', name: 'ARCH C (18×24 in)', w: 609.6, h: 457.2 },
  { key: 'archD', name: 'ARCH D (24×36 in)', w: 914.4, h: 609.6 },
  { key: 'ansiD', name: 'ANSI D (22×34 in)', w: 863.6, h: 558.8 },
  { key: 'letter', name: 'Letter (8.5×11 in)', w: 279.4, h: 215.9 },
  { key: 'a3', name: 'A3', w: 420, h: 297 },
  { key: 'a1', name: 'A1', w: 841, h: 594 },
]

export interface SheetOptions {
  sheet: string
  portrait?: boolean
  titleBlock: boolean
  logoId?: string
  /** Drawing title, e.g. "RACK ELEVATIONS". */
  title: string
  drawingNumber?: string
}

export interface SheetFrame {
  svg: Svg
  /** Drawable area (inside the border, above / left of the title block). */
  area: { x: number; y: number; w: number; h: number }
}

const MARGIN = 10

export function sheetSize(o: SheetOptions): { w: number; h: number } {
  const s = SHEETS.find((x) => x.key === o.sheet) ?? SHEETS[0]
  return o.portrait ? { w: s.h, h: s.w } : { w: s.w, h: s.h }
}

/** A blank sheet with border and (optionally) a title block along the bottom. */
export function newSheet(p: Project, o: SheetOptions, page: number, pages: number, subtitle = '', sheetNo?: string): SheetFrame {
  const { w, h } = sheetSize(o)
  const svg = new Svg(w, h)
  svg.rect(MARGIN / 2, MARGIN / 2, w - MARGIN, h - MARGIN, { lw: 0.5 })
  let area = { x: MARGIN, y: MARGIN, w: w - MARGIN * 2, h: h - MARGIN * 2 }
  if (o.titleBlock) {
    const tb = titleBlockOf(p)
    const T = Math.max(14, Math.min(tb.items ? 140 : 80, tb.height))
    const side: TBSide = tb.items ? tb.side ?? 'bottom' : 'bottom'
    const r = side === 'bottom' ? { x: MARGIN / 2, y: h - MARGIN / 2 - T, w: w - MARGIN, h: T }
      : side === 'right' ? { x: w - MARGIN / 2 - T, y: MARGIN / 2, w: T, h: h - MARGIN }
      : { x: MARGIN / 2, y: MARGIN / 2, w: T, h: h - MARGIN }
    const ctx: TBContext & { paper?: string } = {
      drawing: [o.title, subtitle].filter(Boolean).join(' – '),
      sheet: sheetNo ?? sheetLabel(o.drawingNumber, page - 1) ?? `${page} OF ${pages}`,
      rev: (p.revisions?.length ? p.revisions[p.revisions.length - 1].rev : p.info.revision) || '',
      date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
      page, pages, pageTitle: subtitle, drawingNo: o.drawingNumber ?? sheetNo, paper: SHEETS.find((s) => s.key === o.sheet)?.name,
    }
    if (tb.items) {
      // Free-form: the strip's inner edge, then every item.
      if (side === 'bottom') svg.line(r.x, r.y, r.x + r.w, r.y, { lw: 0.5 })
      else if (side === 'right') svg.line(r.x, r.y, r.x, r.y + r.h, { lw: 0.5 })
      else svg.line(r.x + r.w, r.y, r.x + r.w, r.y + r.h, { lw: 0.5 })
      drawFreeItems(svg, p, tb, ctx, r, side)
    } else titleBlock(svg, p, o, r, page, pages, subtitle, sheetNo ?? sheetLabel(o.drawingNumber, page - 1))
    area = side === 'bottom' ? { ...area, h: r.y - MARGIN - 2 } : side === 'right' ? { ...area, w: r.x - MARGIN - 2 } : { ...area, x: r.x + r.w + MARGIN / 2 + 2, w: area.w - T - 2 }
    // Revision block: bottom-right corner of the drawing area (latest revisions).
    const revs = (p.revisions ?? []).slice(-6)
    if (revs.length) {
      const rw = Math.min(170, w * 0.4), rh = 5.5, head = 6
      const bh = head + rh * (revs.length + 1)
      const bx = (side === 'right' ? r.x : w - MARGIN / 2) - rw, by = (side === 'bottom' ? r.y : h - MARGIN / 2) - bh
      svg.rect(bx, by, rw, bh, { lw: 0.5, fill: '#fff' })
      svg.text(bx + 2, by + head / 2, 'REVISIONS', { size: 2.6, weight: 'bold' })
      const cols = [{ t: 'REV', w: 0.1 }, { t: 'DATE', w: 0.18 }, { t: 'DESCRIPTION', w: 0.57 }, { t: 'BY', w: 0.15 }]
      let y = by + head
      svg.line(bx, y, bx + rw, y, { lw: 0.35 })
      const row = (vals: string[], bold: boolean) => {
        let x = bx
        cols.forEach((c, i) => {
          svg.text(x + 1.5, y + rh / 2, vals[i], { size: bold ? 2.2 : 2.6, weight: bold ? 'bold' : 'normal', maxWidth: rw * c.w - 3, fill: bold ? '#555' : '#000' })
          x += rw * c.w
          if (i < cols.length - 1) svg.line(x, y, x, by + bh, { lw: 0.25 })
        })
        y += rh
        svg.line(bx, y, bx + rw, y, { lw: 0.25 })
      }
      row(cols.map((c) => c.t), true)
      for (const rv of revs) row([rv.rev, rv.date, rv.description.toUpperCase(), rv.by.toUpperCase()], false)
      area = { ...area, h: Math.min(area.h, by - MARGIN - 2) }
    }
  }
  return { svg, area }
}

function titleBlock(svg: Svg, p: Project, o: SheetOptions, r: { x: number; y: number; w: number; h: number }, page: number, pages: number, subtitle: string, sheetNo?: string) {
  const tb = titleBlockOf(p)
  svg.line(r.x, r.y, r.x + r.w, r.y, { lw: 0.5 })
  // Logo: the title block's own (saved with it), else one picked in the print dialog (older projects).
  const legacy: LogoAsset | undefined = (p.logos ?? []).find((l) => l.id === o.logoId)
  const logo = tb.logo?.dataUrl ?? legacy?.dataUrl
  const logoBlack = tb.logo ? !!tb.logo.light : !!legacy?.light
  const logoW = logo ? Math.min(tb.logoWidth, r.w * 0.25) : 0
  if (logo && logoW) {
    const lx = tb.logoSide === 'right' ? r.x + r.w - logoW : r.x
    svg.image(lx + 2, r.y + 2, logoW - 4, r.h - 4, logo, { black: logoBlack })
    svg.line(tb.logoSide === 'right' ? lx : lx + logoW, r.y, tb.logoSide === 'right' ? lx : lx + logoW, r.y + r.h, { lw: 0.35 })
  }
  const ctx: TBContext = {
    drawing: [o.title, subtitle].filter(Boolean).join(' – '),
    sheet: sheetNo ?? `${page} OF ${pages}`,
    rev: (p.revisions?.length ? p.revisions[p.revisions.length - 1].rev : p.info.revision) || '',
    date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    page, pages, pageTitle: subtitle, drawingNo: sheetNo ?? o.drawingNumber,
  }
  const lay = titleBlockBoxes(tb, r, !!logo)
  const byId = new Map(tb.fields.map((f) => [f.id, f]))
  // Row dividers and box dividers.
  const rowYs = [...new Set(lay.fields.map((b) => b.y))].sort((a, b) => a - b)
  for (const y of rowYs.slice(1)) { const bs = lay.fields.filter((b) => b.y === y); svg.line(Math.min(...bs.map((b) => b.x)), y, Math.max(...bs.map((b) => b.x + b.w)), y, { lw: 0.35 }) }
  for (const b of lay.fields) {
    const f = byId.get(b.id)!
    const last = !lay.fields.some((q) => q.y === b.y && q.x > b.x)
    if (!last) svg.line(b.x + b.w, b.y, b.x + b.w, b.y + b.h, { lw: 0.35 })
    const caption = f.source === 'sheet' && sheetNo ? `${f.label || 'SHEET'}  ·  ${page} OF ${pages}` : f.label
    const al = f.align ?? 'left'
    const tx = al === 'center' ? b.x + b.w / 2 : al === 'right' ? b.x + b.w - 2 : b.x + 2
    const anchor = al === 'center' ? 'middle' as const : al === 'right' ? 'end' as const : undefined
    if (caption) svg.text(b.x + 2, b.y + Math.min(4, b.h * 0.18), caption, { size: 2.2, fill: '#555', baseline: 'middle' })
    const lines = fieldValue(p, f, ctx, tb).toUpperCase().split('\n').filter((l, k, all) => l || all.length === 1)
    const size = Math.min(f.big ? 5 : 4, (b.h - (caption ? 6 : 3)) / Math.max(1, lines.length) / 1.2)
    const top = b.y + (caption ? 6 : 2) + (b.h - (caption ? 6 : 2) - lines.length * size * 1.2) / 2 + size * 0.6
    lines.forEach((l, k) => svg.text(tx, top + k * size * 1.2, l, { size: k === 0 ? size : size * 0.8, weight: f.big && k === 0 ? 'bold' : 'normal', maxWidth: b.w - 4, ...(anchor ? { anchor } : {}) }))
  }
}

const escX = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Splits text into lines that fit `width` mm at `size` (paragraph breaks kept). */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const em = (bold ? 0.64 : 0.6) * size // average Helvetica glyph width
  const fits = (s: string) => s.length * em <= width + 0.01
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!para.trim()) { out.push(''); continue }
    let line = ''
    for (const word0 of para.split(/\s+/).filter(Boolean)) {
      let word = word0
      const next = line ? `${line} ${word}` : word
      if (fits(next)) { line = next; continue }
      if (line) { out.push(line); line = '' }
      // A word wider than the box: break it.
      while (!fits(word) && word.length > 1) {
        let n = Math.max(1, Math.floor(width / em))
        out.push(word.slice(0, n)); word = word.slice(n)
      }
      line = word
    }
    out.push(line)
  }
  return out
}

/** Draws a free-form title block's items into the strip r. */
export function drawFreeItems(svg: Svg, p: Project, tb: TitleBlockTemplate, ctx: TBContext & { paper?: string }, r: { x: number; y: number; w: number; h: number }, side: TBSide) {
  for (const it of tb.items ?? []) {
    const b = itemRect(it, r, side)
    if (it.kind === 'rect') svg.rect(Math.min(b.x, b.x + b.w), Math.min(b.y, b.y + b.h), Math.abs(b.w), Math.abs(b.h), { stroke: it.stroke ?? '#000', fill: it.fill || 'none', lw: it.strokeWidth ?? 0.35, rx: it.radius, dash: it.dash ? '2 1' : undefined })
    else if (it.kind === 'line') svg.line(b.x, b.y, b.x + b.w, b.y + b.h, { stroke: it.stroke ?? '#000', lw: it.strokeWidth ?? 0.35, dash: it.dash ? '2 1' : undefined })
    else if (it.kind === 'image' && it.src) svg.image(b.x, b.y, b.w, b.h, it.src, { black: !!it.light })
    else if (it.kind === 'text' && it.text) {
      const rot = (((it.rotate ?? 0) % 360) + 360) % 360
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2
      // Lay the text out in the box as seen when reading it (a quarter-turn swaps width and height).
      const quarter = rot === 90 || rot === 270
      const bw = quarter ? Math.abs(b.h) : Math.abs(b.w), bh = quarter ? Math.abs(b.w) : Math.abs(b.h)
      // Wrap to the box width (word by word); if it's still too tall for the box, shrink the text until it fits.
      const filled = fillVariables(it.text, p, ctx, tb)
      let size = it.size ?? 3
      let lines = wrapText(filled, bw, size, !!it.bold)
      while (lines.length * size * 1.2 > bh + 0.01 && size > 1.2) { size *= 0.92; lines = wrapText(filled, bw, size, !!it.bold) }
      const lh = size * 1.2, total = lines.length * lh
      const al = it.align ?? 'left', va = it.vAlign ?? 'top'
      const x0 = cx - bw / 2, y0 = cy - bh / 2
      const tx = al === 'center' ? cx : al === 'right' ? x0 + bw : x0
      const ty = va === 'middle' ? cy - total / 2 + lh / 2 : va === 'bottom' ? y0 + bh - total + lh / 2 : y0 + lh / 2
      const parts = lines.map((l, k) => `<text x="${(tx).toFixed(2)}" y="${(ty + k * lh).toFixed(2)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}"${it.bold ? ' font-weight="bold"' : ''} text-anchor="${al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start'}" dominant-baseline="middle" fill="${escX(it.color ?? '#000')}">${escX(l)}</text>`)
      svg.raw(rot ? `<g transform="rotate(${rot} ${cx.toFixed(2)} ${cy.toFixed(2)})">${parts.join('')}</g>` : parts.join(''))
    }
  }
}

/** HTML wrapper for printing / PDF (one SVG per page, exact sheet size). */
export function sheetsToHTML(pages: string[], size: { w: number; h: number }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${size.w}mm ${size.h}mm; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
.page { page-break-after: always; break-after: page; line-height: 0; width: ${size.w}mm; height: ${size.h}mm; overflow: hidden }
.page:last-child { page-break-after: auto; break-after: auto }
.page svg { width: ${size.w}mm; height: ${size.h}mm }
</style></head><body>${pages.map((s) => `<div class="page">${s}</div>`).join('\n')}</body></html>`
}

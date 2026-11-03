// Exact-scale label layout (millimetres, origin top-left) → renderer-agnostic
// primitives → SVG. The PDF path renders the same SVG via Chromium's
// printToPDF with a CSS @page size, so screen, SVG and PDF are identical.

import type { CellStyle, LabelStripGeometry, LabelStyle, PatchBay } from '../model'
import { arrowGlyph, rowOnBottom, findCell, NORMAL_SYMBOLS, NORMAL_WORDS, rowLetter, rowMode } from './patchbay'
import { cellSpanMM } from './template'

export interface LabelStock { key: string; name: string; widthMM: number; heightMM: number; marginMM: number }

export const STOCKS: LabelStock[] = [
  { key: 'letter', name: 'US Letter', widthMM: 215.9, heightMM: 279.4, marginMM: 8 },
  { key: 'legal', name: 'US Legal', widthMM: 215.9, heightMM: 355.6, marginMM: 8 },
  { key: 'tabloid', name: 'Tabloid 11×17', widthMM: 279.4, heightMM: 431.8, marginMM: 8 },
  { key: 'a4', name: 'A4', widthMM: 210, heightMM: 297, marginMM: 8 },
  { key: 'a3', name: 'A3', widthMM: 297, heightMM: 420, marginMM: 8 },
]

export interface PrintOptions { stock: LabelStock; landscape: boolean; gapMM: number; cutMarks: boolean; captions: boolean; normals?: boolean }
export const defaultPrintOptions = (): PrintOptions => ({ stock: STOCKS[2], landscape: true, gapMM: 4, cutMarks: true, captions: true, normals: true })

export function pageSize(o: PrintOptions) {
  const a = o.stock.widthMM, b = o.stock.heightMM
  return o.landscape ? { w: Math.max(a, b), h: Math.min(a, b) } : { w: Math.min(a, b), h: Math.max(a, b) }
}

export interface MMRect { x: number; y: number; w: number; h: number }

export type LabelPrimitive =
  | { t: 'rect'; r: MMRect; stroke: string | null; fill: string | null; lw: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; lw: number }
  | { t: 'text'; lines: string[]; r: MMRect; font: string; sizePt: number; color: string; bold: boolean
      italic?: boolean; underline?: boolean; strike?: boolean; align?: 'left' | 'center' | 'right' }

export interface LabelPage { widthMM: number; heightMM: number; items: LabelPrimitive[] }

export const PT_PER_MM = 72 / 25.4
/** Average advance of caps in Helvetica Bold ≈ 0.62 em (conservative). */
export const AVG_ADVANCE_EM = 0.62

export function fittedFontPt(lines: string[], r: { w: number; h: number }, style: Pick<LabelStyle, 'maxFontPt' | 'minFontPt'>): number {
  const n = Math.max(lines.length, 1)
  const byHeight = (r.h / n / 1.15) * PT_PER_MM
  const longest = Math.max(1, ...lines.map((l) => l.length))
  const byWidth = (r.w / (longest * AVG_ADVANCE_EM)) * PT_PER_MM
  return Math.max(style.minFontPt, Math.min(style.maxFontPt, byHeight, byWidth))
}

interface Segment { first: number; last: number; origin: number; width: number }

/**
 * Split a strip at channel boundaries so each piece fits `maxWidth`, using as
 * few pieces as possible and balancing them (48 → 24 + 24, not 46 + 2), and
 * preferring bank boundaries when the strip has banks.
 */
export function segments(g: LabelStripGeometry, maxWidth: number): Segment[] {
  const n = g.channelCount
  if (n <= 0) return []
  if (g.stripWidthMM <= maxWidth) return [{ first: 0, last: n - 1, origin: 0, width: g.stripWidthMM }]
  const right = (i: number) => (i === n - 1 ? g.stripWidthMM : cellSpanMM(g, i).x + cellSpanMM(g, i).width)
  const left = (i: number) => (i === 0 ? 0 : cellSpanMM(g, i).x)
  const build = (cuts: number[]) => {
    const segs: Segment[] = []
    let start = 0
    for (const c of [...cuts, n]) { segs.push({ first: start, last: c - 1, origin: left(start), width: right(c - 1) - left(start) }); start = c }
    return segs
  }
  for (let k = 2; k <= n; k++) {
    const size = Math.ceil(n / k)
    let cuts = Array.from({ length: k - 1 }, (_, i) => (i + 1) * size).filter((c) => c < n)
    const bank = g.groupSize
    if (bank && size % bank !== 0) {
      const snapped = cuts.map((c) => Math.round(c / bank) * bank).filter((c, i, a) => c > 0 && c < n && a.indexOf(c) === i)
      if (snapped.length === cuts.length && build(snapped).every((s) => s.width <= maxWidth)) cuts = snapped
    }
    const segs = build(cuts)
    if (segs.every((s) => s.width <= maxWidth)) return segs
  }
  return Array.from({ length: n }, (_, i) => ({ first: i, last: i, origin: left(i), width: right(i) - left(i) }))
}

export function layoutLabels(bays: PatchBay[], o: PrintOptions): LabelPage[] {
  const { w: pw, h: ph } = pageSize(o)
  const m = o.stock.marginMM
  const printableW = pw - 2 * m
  const captionH = o.captions ? 3.5 : 0
  const pages: LabelPage[] = []
  let items: LabelPrimitive[] = []
  let y = m
  const flush = () => { pages.push({ widthMM: pw, heightMM: ph, items }); items = []; y = m }

  for (const bay of bays) {
    for (const row of bay.template.rows) {
      const g = row.strip
      segments(g, printableW).forEach((seg, si) => {
        const blockH = captionH + g.stripHeightMM
        if (y + blockH > ph - m && items.length) flush()
        const x0 = m
        if (o.captions) items.push({ t: 'text', lines: [`${bay.name} – ${row.name}${si > 0 ? ' (cont.)' : ''}   ch ${seg.first + 1}–${seg.last + 1}`], r: { x: x0, y, w: printableW, h: captionH }, font: 'Helvetica, Arial, sans-serif', sizePt: 6, color: '#666666', bold: false, })
        const sy = y + captionH
        const h = g.stripHeightMM
        const strip: MMRect = { x: x0, y: sy, w: seg.width, h }
        const rowFill = bay.rowFill?.[String(row.id)]
        if (rowFill) items.push({ t: 'rect', r: strip, stroke: null, fill: rowFill, lw: 0 })
        const { titleH, normH } = stripBands(bay, row.id, h, o.normals !== false)
        const cellY = sy + titleH + (g.padTopMM ?? 0), cellH = h - titleH - normH - (g.padTopMM ?? 0) - (g.padBottomMM ?? 0)
        const xOf = (ch: number) => x0 + cellSpanMM(g, ch).x - seg.origin
        const arrow = arrowGlyph(bay.arrows?.[String(row.id)])
        const bottomRow = rowOnBottom(bay, row.id)
        const tabs = !!bay.rowTabs?.on
        const mode = tabs ? rowMode(bay, row.id) : null
        // With strip-end tabs, bands and dividers stop at the tabs – nothing runs under the row letters.
        const lastCh = cellSpanMM(g, g.channelCount - 1)
        const tabL = tabs && seg.first === 0 && cellSpanMM(g, 0).x >= 3.5 ? cellSpanMM(g, 0).x : 0
        const tabR = tabs && seg.last === g.channelCount - 1 && g.stripWidthMM - (lastCh.x + lastCh.width) >= 3.5 ? g.stripWidthMM - (lastCh.x + lastCh.width) : 0
        const bx0 = x0 + tabL, bx1 = x0 + seg.width - tabR

        // Group titles (spanning, PatchCAD-style bracket line with centred text).
        for (const t of bay.spans ?? []) {
          if (t.row !== row.id) continue
          const a = Math.max(t.start - 1, seg.first), b = Math.min(t.end - 1, seg.last)
          if (a > b) continue
          const tx = xOf(a), tw = xOf(b) + cellSpanMM(g, b).width - tx
          items.push(...titlePrims(t.text, { x: tx, y: sy, w: tw, h: titleH }, t.style, bay.style.fontFamily))
        }
        if (titleH > 0) items.push({ t: 'line', x1: bx0, y1: cellY, x2: bx1, y2: cellY, stroke: '#000000', lw: 0.06 })

        for (let ch = seg.first; ch <= seg.last; ch++) {
          const span = cellSpanMM(g, ch)
          const cx = xOf(ch)
          const cell = findCell(bay, row.id, ch + 1)
          const st = cell?.style
          const fill = st?.fill ?? (cell?.fill ? cell.fill + '33' : null)
          if (fill) items.push({ t: 'rect', r: { x: cx, y: cellY, w: span.width, h: cellH }, stroke: null, fill, lw: 0 })
          if (bay.style.cellDividers && ch > seg.first) items.push({ t: 'line', x1: cx, y1: cellY, x2: cx, y2: cellY + cellH, stroke: '#000000', lw: 0.08 })
          let lines = (cell?.text ?? '').split('\n')
          if (bay.style.showChannelNumbers) lines = [String(ch + 1), ...lines]
          lines = lines.slice(0, g.linesPerCell + (bay.style.showChannelNumbers ? 1 : 0))
          if (!lines.some((l) => l.trim())) continue
          // ▲ / ▼ on each port label, centred over the jack it names, on the jack's side of the text:
          // under it on a top row, above it on a bottom row.
          const ah = arrow ? Math.min(2.2, cellH * 0.3) : 0
          if (arrow) items.push({ t: 'text', lines: [arrow], r: { x: cx, y: bottomRow ? cellY + 0.1 : cellY + cellH - ah - 0.1, w: span.width, h: ah }, font: 'Helvetica, Arial, sans-serif', sizePt: Math.min(5, ah * PT_PER_MM * 0.95), color: '#000000', bold: false, align: 'center' })
          const r = { x: cx + 0.4, y: cellY + 0.3 + (bottomRow ? ah : 0), w: span.width - 0.8, h: cellH - 0.6 - ah }
          items.push({
            t: 'text', lines, r, font: st?.fontFamily ?? bay.style.fontFamily,
            sizePt: st?.sizePt ?? fittedFontPt(lines, r, bay.style), color: st?.color ?? '#000000',
            bold: st?.bold ?? true, italic: st?.italic, underline: st?.underline, strike: st?.strike, align: st?.align,
          })
        }

        // Normalling symbols along the bottom edge.
        if (normH > 0) {
          const band = bay.normals.find((n) => n.afterRow === row.id)!
          items.push({ t: 'line', x1: bx0, y1: sy + h - normH, x2: bx1, y2: sy + h - normH, stroke: '#000000', lw: 0.06 })
          for (let ch = seg.first; ch <= seg.last; ch++) {
            // With strip-end words, the row's own mode is printed once at the end; only the odd ones out get a symbol.
            if (tabs && (band.modes[ch] ?? 'none') === rowMode(bay, row.id)) continue
            const glyph = NORMAL_SYMBOLS[band.modes[ch] ?? 'none'].glyph
            if (!glyph) continue
            const span = cellSpanMM(g, ch)
            items.push({ t: 'text', lines: [glyph], r: { x: xOf(ch), y: sy + h - normH, w: span.width, h: normH }, font: 'Helvetica, Arial, sans-serif', sizePt: Math.min(6, normH * PT_PER_MM * 0.8), color: '#000000', bold: false })
          }
        }
        // Strip ends: the row letter, and under it the arrow and the row's normalling word.
        if (tabs) {
          const n = g.channelCount
          const leftW = cellSpanMM(g, 0).x, lastSpan = cellSpanMM(g, n - 1)
          const rightW = g.stripWidthMM - (lastSpan.x + lastSpan.width)
          const word = mode ? NORMAL_WORDS[mode] : ''
          // Stacked and centred: letter, then the arrow under it, then the word under that.
          const end = (x: number, w: number) => {
            if (w < 3.5) return
            const glyph = word ? (arrow || (bottomRow ? '▲' : '▼')) : ''
            const wordH = word ? Math.min(h * 0.2, 2.2) : 0, glyphH = glyph ? Math.min(h * 0.2, 2.2) : 0
            const letterH = h - wordH - glyphH - 0.4
            // Bottom rows: arrow first (on top), then letter, then word. Top rows: letter, arrow, word.
            const gy = bottomRow ? sy + 0.2 : sy + 0.2 + letterH, ly = bottomRow ? sy + 0.2 + glyphH : sy + 0.2
            items.push({ t: 'text', lines: [rowLetter(bay, row.id)], r: { x, y: ly, w, h: letterH }, font: bay.style.fontFamily, sizePt: Math.min(letterH * 0.9, w * 0.85) * PT_PER_MM, color: '#000000', bold: true, align: 'center' })
            if (glyph) items.push({ t: 'text', lines: [glyph], r: { x, y: gy, w, h: glyphH }, font: 'Helvetica, Arial, sans-serif', sizePt: Math.min(glyphH * 0.95 * PT_PER_MM, 6), color: '#000000', bold: false, align: 'center' })
            if (word) items.push({ t: 'text', lines: [word], r: { x: x + 0.15, y: sy + 0.2 + letterH + glyphH, w: w - 0.3, h: wordH }, font: bay.style.fontFamily, sizePt: Math.min(wordH * 0.9 * PT_PER_MM, ((w - 0.6) / (word.length * AVG_ADVANCE_EM * 1.12)) * PT_PER_MM, 6), color: '#000000', bold: true, align: 'center' })
          }
          if (seg.first === 0) { end(x0, leftW); if (leftW >= 3.5) items.push({ t: 'line', x1: x0 + leftW, y1: sy, x2: x0 + leftW, y2: sy + h, stroke: '#000000', lw: 0.1 }) }
          if (seg.last === n - 1) { const rx = x0 + lastSpan.x + lastSpan.width - seg.origin; end(rx, rightW); if (rightW >= 3.5) items.push({ t: 'line', x1: rx, y1: sy, x2: rx, y2: sy + h, stroke: '#000000', lw: 0.1 }) }
        }
        items.push({ t: 'rect', r: strip, stroke: '#000000', fill: null, lw: 0.1 })
        if (o.cutMarks) items.push(...cutMarks(strip))
        y += blockH + o.gapMM
      })
    }
  }
  if (items.length || pages.length === 0) flush()
  return pages
}

/** Heights of the title band (top) and normalling band (bottom) within a strip. */
export function stripBands(bay: PatchBay, rowId: number, h: number, normals = true) {
  const hasTitles = (bay.spans ?? []).some((s) => s.row === rowId)
  const band = normals ? bay.normals?.find((n) => n.afterRow === rowId) : undefined
  const own = bay.rowTabs?.on ? rowMode(bay, rowId) : null
  // With strip-end words only the channels that differ from the row's mode need a symbol.
  const hasNormals = !!band && band.modes.some((m) => (own ? m !== own : m !== 'none') && NORMAL_SYMBOLS[m].glyph)
  return { titleH: hasTitles ? Math.min(h * 0.36, 4) : 0, normH: hasNormals ? Math.min(h * 0.24, 2.6) : 0 }
}

function titlePrims(text: string, r: MMRect, st: CellStyle | undefined, font: string): LabelPrimitive[] {
  const size = st?.sizePt ?? Math.min(6, (r.h * 0.62) * PT_PER_MM)
  const sizeMM = size / PT_PER_MM
  const textW = Math.min(r.w - 2, text.length * AVG_ADVANCE_EM * sizeMM + 1.5)
  const mid = r.y + r.h / 2, cx = r.x + r.w / 2
  const color = st?.color ?? '#000000'
  const out: LabelPrimitive[] = []
  if (st?.fill) out.push({ t: 'rect', r, stroke: null, fill: st.fill, lw: 0 })
  const l1 = r.x + 0.8, l2 = cx - textW / 2, r1 = cx + textW / 2, r2 = r.x + r.w - 0.8
  if (l2 - l1 > 0.5) {
    out.push({ t: 'line', x1: l1, y1: mid, x2: l2, y2: mid, stroke: color, lw: 0.1 })
    out.push({ t: 'line', x1: r1, y1: mid, x2: r2, y2: mid, stroke: color, lw: 0.1 })
    out.push({ t: 'line', x1: l1, y1: mid - 0.6, x2: l1, y2: mid + 0.6, stroke: color, lw: 0.1 })
    out.push({ t: 'line', x1: r2, y1: mid - 0.6, x2: r2, y2: mid + 0.6, stroke: color, lw: 0.1 })
  }
  if (text.trim()) out.push({ t: 'text', lines: [text], r: { x: l2, y: r.y, w: textW, h: r.h }, font: st?.fontFamily ?? font, sizePt: size, color, bold: st?.bold ?? true, italic: st?.italic, underline: st?.underline, strike: st?.strike })
  return out
}

function cutMarks(r: MMRect): LabelPrimitive[] {
  const len = 2.5, off = 1
  const out: LabelPrimitive[] = []
  for (const [x, d] of [[r.x, -1], [r.x + r.w, 1]] as const)
    for (const y of [r.y, r.y + r.h]) out.push({ t: 'line', x1: x + d * off, y1: y, x2: x + d * (off + len), y2: y, stroke: '#000000', lw: 0.1 })
  return out
}

// MARK: SVG

const f = (v: number) => v.toFixed(3)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Exact-scale SVG: width/height in mm and viewBox in mm (1 unit = 1 mm). */
export function pageToSVG(page: LabelPage): string {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(page.widthMM)}mm" height="${f(page.heightMM)}mm" viewBox="0 0 ${f(page.widthMM)} ${f(page.heightMM)}">\n`
  s += `<rect x="0" y="0" width="${f(page.widthMM)}" height="${f(page.heightMM)}" fill="#ffffff"/>\n`
  for (const it of page.items) {
    if (it.t === 'rect') {
      s += `<rect x="${f(it.r.x)}" y="${f(it.r.y)}" width="${f(it.r.w)}" height="${f(it.r.h)}" fill="${it.fill ?? 'none'}" stroke="${it.stroke ?? 'none'}" stroke-width="${f(it.lw)}"/>\n`
    } else if (it.t === 'line') {
      s += `<line x1="${f(it.x1)}" y1="${f(it.y1)}" x2="${f(it.x2)}" y2="${f(it.y2)}" stroke="${it.stroke}" stroke-width="${f(it.lw)}"/>\n`
    } else {
      const size = it.sizePt / PT_PER_MM
      const lh = size * 1.15
      const top = it.r.y + (it.r.h - lh * it.lines.length) / 2 + size * 0.85
      const align = it.align ?? (it.r.w < 150 ? 'center' : 'left')
      const x = align === 'center' ? it.r.x + it.r.w / 2 : align === 'right' ? it.r.x + it.r.w : it.r.x
      const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
      const deco = [it.underline && 'underline', it.strike && 'line-through'].filter(Boolean).join(' ')
      s += `<text font-family="${esc(it.font)}" font-weight="${it.bold ? 'bold' : 'normal'}"${it.italic ? ' font-style="italic"' : ''}${deco ? ` text-decoration="${deco}"` : ''} font-size="${f(size)}" fill="${it.color}" text-anchor="${anchor}">`
      it.lines.forEach((line, i) => {
        // Compress (never stretch) lines the estimate thinks are too wide.
        const est = line.length * AVG_ADVANCE_EM * size
        const fit = est > it.r.w ? ` textLength="${f(it.r.w)}" lengthAdjust="spacingAndGlyphs"` : ''
        s += `<tspan x="${f(x)}" y="${f(top + i * lh)}"${fit}>${esc(line)}</tspan>`
      })
      s += '</text>\n'
    }
  }
  return s + '</svg>\n'
}

/** A print-ready HTML document (one page per sheet) for printToPDF / print. */
export function pagesToPrintHTML(pages: LabelPage[]): string {
  const p0 = pages[0]
  const size = p0 ? `${f(p0.widthMM)}mm ${f(p0.heightMM)}mm` : 'auto'
  const body = pages.map((p) => `<div class="page">${pageToSVG(p)}</div>`).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${size}; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
.page { page-break-after: always; break-after: page; line-height: 0 }
.page:last-child { page-break-after: auto; break-after: auto }
</style></head><body>${body}</body></html>`
}

// Sheet sizes, borders and the title block shared by printed drawings.

import type { LogoAsset, Project } from '../model'
import { Svg } from './svg'
import { sheetLabel } from '../sheetnumbers'

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
const TB_H = 30

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
    const top = h - MARGIN / 2 - TB_H
    titleBlock(svg, p, o, { x: MARGIN / 2, y: top, w: w - MARGIN, h: TB_H }, page, pages, subtitle, sheetNo ?? sheetLabel(o.drawingNumber, page - 1))
    area = { ...area, h: top - MARGIN - 2 }
    // Revision block: bottom-right, just above the title block (latest revisions).
    const revs = (p.revisions ?? []).slice(-6)
    if (revs.length) {
      const rw = Math.min(170, w * 0.4), rh = 5.5, head = 6
      const bh = head + rh * (revs.length + 1)
      const bx = w - MARGIN / 2 - rw, by = top - bh
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
      for (const r of revs) row([r.rev, r.date, r.description.toUpperCase(), r.by.toUpperCase()], false)
      area = { ...area, h: Math.min(area.h, by - MARGIN - 2) }
    }
  }
  return { svg, area }
}

function titleBlock(svg: Svg, p: Project, o: SheetOptions, r: { x: number; y: number; w: number; h: number }, page: number, pages: number, subtitle: string, sheetNo?: string) {
  svg.line(r.x, r.y, r.x + r.w, r.y, { lw: 0.5 })
  const logo: LogoAsset | undefined = (p.logos ?? []).find((l) => l.id === o.logoId)
  const cells: { label: string; value: string; w: number }[] = [
    { label: 'PROJECT', value: p.info.name || 'Untitled Project', w: 0.24 },
    { label: 'CLIENT', value: p.info.client || '', w: 0.14 },
    { label: 'LOCATION', value: p.info.location || '', w: 0.12 },
    { label: 'DRAWING', value: [o.title, subtitle].filter(Boolean).join(' – '), w: 0.2 },
    { label: 'DESIGNER', value: p.info.designer || '', w: 0.1 },
    { label: 'REV', value: (p.revisions?.length ? p.revisions[p.revisions.length - 1].rev : p.info.revision) || '', w: 0.05 },
    { label: 'DATE', value: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), w: 0.08 },
    { label: sheetNo ? `SHEET  ·  ${page} OF ${pages}` : 'SHEET', value: sheetNo ?? `${page} OF ${pages}`, w: 0.07 },
  ]
  const logoW = logo ? Math.min(60, r.w * 0.12) : 0
  let x = r.x
  if (logo) {
    svg.image(x + 2, r.y + 2, logoW - 4, r.h - 4, logo.dataUrl)
    x += logoW
    svg.line(x, r.y, x, r.y + r.h, { lw: 0.35 })
  }
  const rest = r.w - logoW
  for (const c of cells) {
    const cw = rest * c.w
    svg.text(x + 2, r.y + 4, c.label, { size: 2.2, fill: '#555', baseline: 'middle' })
    const size = c.label === 'PROJECT' || c.label === 'DRAWING' || (sheetNo && c.label.startsWith('SHEET')) ? 5 : 4
    svg.text(x + 2, r.y + r.h / 2 + 3, c.value.toUpperCase(), { size, weight: c.label === 'PROJECT' || c.label === 'DRAWING' || (sheetNo && c.label.startsWith('SHEET')) ? 'bold' : 'normal', maxWidth: cw - 4 })
    x += cw
    if (x < r.x + r.w - 1) svg.line(x, r.y, x, r.y + r.h, { lw: 0.35 })
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

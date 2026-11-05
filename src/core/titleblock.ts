// Title blocks: the strip along the bottom of every printed sheet. A project
// carries its own (fields, layout, logo) so the logo and layout are saved with
// it; any title block can also be saved as a template and reused in other
// projects (the logo travels inside the template).

import { newId, type Project } from './model'

export type TBSource =
  | 'project' | 'client' | 'location' | 'designer' | 'drawing' | 'rev' | 'date' | 'sheet' | 'custom'
  | 'sheetOf' | 'pageTitle' | 'drawingNo' | 'revDesc' | 'checkedBy' | 'approvedBy' | 'scale' | 'company'

export const TB_SOURCES: { value: TBSource; label: string }[] = [
  { value: 'project', label: 'Project name' },
  { value: 'client', label: 'Client' },
  { value: 'location', label: 'Location' },
  { value: 'designer', label: 'Designer' },
  { value: 'drawing', label: 'Drawing title' },
  { value: 'rev', label: 'Revision' },
  { value: 'date', label: 'Date' },
  { value: 'sheet', label: 'Sheet number' },
  { value: 'sheetOf', label: 'Sheet X of Y' },
  { value: 'pageTitle', label: 'Page / view name' },
  { value: 'drawingNo', label: 'Drawing number' },
  { value: 'revDesc', label: 'Latest revision note' },
  { value: 'checkedBy', label: 'Checked by' },
  { value: 'approvedBy', label: 'Approved by' },
  { value: 'scale', label: 'Scale' },
  { value: 'company', label: 'Company (from template)' },
  { value: 'custom', label: 'Fixed text…' },
]

export interface TBField {
  id: string
  /** Small caption above the value ("PROJECT"). */
  label: string
  source: TBSource
  /** Text for 'custom' fields (company name, address, licence no.…). Multiple lines allowed. */
  text?: string
  /** Relative width within its row. */
  width: number
  /** Row, top to bottom (rows split the block's height evenly). */
  row: 0 | 1 | 2
  big?: boolean
  align?: 'left' | 'center' | 'right'
}

export interface TitleBlockTemplate {
  id: string
  name: string
  /** Height in mm. */
  height: number
  logo?: { name: string; dataUrl: string; light?: boolean }
  logoSide: 'left' | 'right'
  /** Logo box width in mm. */
  logoWidth: number
  fields: TBField[]
  /** Company name / address lines shown by 'company' boxes. */
  company?: string
  /** Shown by 'scale' boxes (default NTS). */
  scale?: string
  /** Shown by 'checkedBy' / 'approvedBy' boxes. */
  checkedBy?: string
  approvedBy?: string
  /** Saved template this was made from (so the export dialog knows which one a project uses). */
  templateId?: string
  /** Built in the free-form builder: these items replace the field boxes. */
  items?: TBItem[]
  /** Free-form blocks: along the bottom (height = height) or down the left / right edge (width = height). */
  side?: TBSide
}

/** App-wide title block settings: the template new projects start with. */
export interface TitleBlockPrefs { defaultId?: string }

const F = (label: string, source: TBSource, width: number, extra: Partial<TBField> = {}): TBField => ({ id: newId(), label, source, width, row: 0, ...extra })

export function defaultTitleBlock(): TitleBlockTemplate {
  return {
    id: 'default', name: 'Standard', height: 30, logoSide: 'left', logoWidth: 50,
    fields: [
      F('PROJECT', 'project', 24, { big: true }), F('CLIENT', 'client', 14), F('LOCATION', 'location', 12),
      F('DRAWING', 'drawing', 20, { big: true }), F('DESIGNER', 'designer', 10), F('REV', 'rev', 5), F('DATE', 'date', 8), F('SHEET', 'sheet', 7, { big: true }),
    ],
  }
}

/** Two-row example (company block + project details) offered as a starting point. */
export function twoRowTitleBlock(): TitleBlockTemplate {
  return {
    id: newId(), name: 'Two-row with company', height: 36, logoSide: 'left', logoWidth: 55,
    fields: [
      F('', 'custom', 22, { text: 'YOUR COMPANY\n123 Main St · City · (555) 555-0100', big: true }),
      F('PROJECT', 'project', 30, { big: true }), F('CLIENT', 'client', 16), F('LOCATION', 'location', 16), F('SHEET', 'sheet', 10, { big: true }),
      F('DRAWING', 'drawing', 40, { row: 1, big: true }), F('DESIGNER', 'designer', 16, { row: 1 }), F('REV', 'rev', 8, { row: 1 }), F('DATE', 'date', 16, { row: 1 }),
    ],
  }
}

export const titleBlockOf = (p: Project): TitleBlockTemplate => p.titleBlock ?? defaultTitleBlock()

export interface TBContext { drawing: string; sheet: string; rev: string; date: string; page?: number; pages?: number; pageTitle?: string; drawingNo?: string }

export function fieldValue(p: Project, f: TBField, c: TBContext, tb: TitleBlockTemplate = titleBlockOf(p)): string {
  switch (f.source) {
    case 'sheetOf': return c.page ? `${c.page} OF ${c.pages ?? c.page}` : ''
    case 'pageTitle': return c.pageTitle ?? ''
    case 'drawingNo': return c.drawingNo ?? c.sheet
    case 'revDesc': { const r = p.revisions?.[p.revisions.length - 1]; return r ? `${r.rev} – ${r.description}` : '' }
    case 'checkedBy': return tb.checkedBy ?? ''
    case 'approvedBy': return tb.approvedBy ?? ''
    case 'scale': return tb.scale?.trim() || 'NTS'
    case 'company': return tb.company ?? ''
    case 'project': return p.info.name || 'Untitled Project'
    case 'client': return p.info.client || ''
    case 'location': return p.info.location || ''
    case 'designer': return p.info.designer || ''
    case 'drawing': return c.drawing
    case 'rev': return c.rev
    case 'date': return c.date
    case 'sheet': return c.sheet
    case 'custom': return f.text ?? ''
  }
}

/** Saved-template wrapper for files / the app's template list. */
export const cloneTemplate = (t: TitleBlockTemplate, name?: string): TitleBlockTemplate =>
  ({ ...structuredClone(t), id: newId(), name: name ?? t.name })


/** The boxes of a title block laid out in a strip (mm): logo and each field, row by row. */
export interface TBBox { id: string; x: number; y: number; w: number; h: number }
export function titleBlockBoxes(tb: TitleBlockTemplate, r: { x: number; y: number; w: number; h: number }, hasLogo = !!tb.logo): { logo?: TBBox; fields: TBBox[]; rows: number } {
  const logoW = hasLogo ? Math.min(tb.logoWidth, r.w * 0.25) : 0
  const logo = hasLogo ? { id: 'logo', x: tb.logoSide === 'right' ? r.x + r.w - logoW : r.x, y: r.y, w: logoW, h: r.h } : undefined
  const x0 = r.x + (tb.logoSide === 'left' ? logoW : 0), w = r.w - logoW
  const used = [0, 1, 2].filter((k) => tb.fields.some((f) => (f.row ?? 0) === k))
  const rows = Math.max(1, used.length)
  const rowH = r.h / rows
  const fields: TBBox[] = []
  used.forEach((row, ri) => {
    const fs = tb.fields.filter((f) => (f.row ?? 0) === row)
    const total = fs.reduce((t, f) => t + Math.max(1, f.width), 0)
    let x = x0
    for (const f of fs) { const cw = (w * Math.max(1, f.width)) / total; fields.push({ id: f.id, x, y: r.y + ri * rowH, w: cw, h: rowH }); x += cw }
  })
  return { logo, fields, rows }
}

/** A template for a project: a copy, remembering which saved template it came from. */
export const useTemplate = (t: TitleBlockTemplate): TitleBlockTemplate => ({ ...structuredClone(t), templateId: t.id })

// MARK: Free-form title blocks (builder)
//
// A title block can be drawn freely: text (with {variables} that fill in from the
// project and sheet), boxes / sections, lines and images. Positions run along the
// strip as a fraction of its length (so one design fits every paper size) and
// across it in mm (its fixed height for a bottom strip, width for a side strip).

export type TBSide = 'bottom' | 'left' | 'right'
export type TBItemKind = 'text' | 'rect' | 'line' | 'image'
export interface TBItem {
  id: string
  kind: TBItemKind
  /** Along the strip: 0–1 of its length. Across: mm. */
  a: number; b: number
  /** Size along (fraction) and across (mm). Lines: a line from (a, b) to (a + da, b + db). */
  da: number; db: number
  /** Text: may contain {variables}; several lines allowed. */
  text?: string
  size?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  vAlign?: 'top' | 'middle' | 'bottom'
  color?: string
  /** Shapes */
  stroke?: string
  strokeWidth?: number
  fill?: string
  dash?: boolean
  radius?: number
  /** Image */
  src?: string
  light?: boolean
  /** Text: rotation in degrees (clockwise), about the box centre – 90 / 270 read up or down a side strip. */
  rotate?: number
}

export interface TBVariable { key: string; label: string; group: string }
export const TB_VARIABLES: TBVariable[] = [
  { key: 'project', label: 'Project name', group: 'Project' },
  { key: 'client', label: 'Client', group: 'Project' },
  { key: 'location', label: 'Location', group: 'Project' },
  { key: 'designer', label: 'Designer', group: 'Project' },
  { key: 'rev', label: 'Revision', group: 'Project' },
  { key: 'revDate', label: 'Revision date', group: 'Project' },
  { key: 'revDesc', label: 'Latest revision note', group: 'Project' },
  { key: 'devices', label: 'Number of devices', group: 'Project' },
  { key: 'cables', label: 'Number of cables', group: 'Project' },
  { key: 'racks', label: 'Number of racks', group: 'Project' },
  { key: 'drawing', label: 'Drawing title', group: 'Sheet' },
  { key: 'pageTitle', label: 'Page / view name', group: 'Sheet' },
  { key: 'sheet', label: 'Sheet number (AV101…)', group: 'Sheet' },
  { key: 'page', label: 'Sheet index (1, 2…)', group: 'Sheet' },
  { key: 'pages', label: 'Total sheets', group: 'Sheet' },
  { key: 'sheetOf', label: 'Sheet X of Y', group: 'Sheet' },
  { key: 'drawingNo', label: 'Drawing number', group: 'Sheet' },
  { key: 'paper', label: 'Paper size', group: 'Sheet' },
  { key: 'date', label: 'Date printed', group: 'Date' },
  { key: 'year', label: 'Year', group: 'Date' },
  { key: 'company', label: 'Company', group: 'Title block' },
  { key: 'scale', label: 'Scale', group: 'Title block' },
  { key: 'checkedBy', label: 'Checked by', group: 'Title block' },
  { key: 'approvedBy', label: 'Approved by', group: 'Title block' },
]

/** Fills {variables} in a text from the project, sheet and title block. Unknown names stay as typed. */
export function fillVariables(text: string, p: Project, c: TBContext & { paper?: string }, tb: TitleBlockTemplate = titleBlockOf(p)): string {
  const rev = p.revisions?.[p.revisions.length - 1]
  const v: Record<string, string> = {
    project: p.info.name || 'Untitled Project', client: p.info.client || '', location: p.info.location || '', designer: p.info.designer || '',
    rev: c.rev, revDate: rev?.date ?? '', revDesc: rev ? rev.description : '',
    devices: String(p.equipment.length), cables: String(p.cables.length), racks: String(p.racks.length),
    drawing: c.drawing, pageTitle: c.pageTitle ?? '', sheet: c.sheet, page: String(c.page ?? ''), pages: String(c.pages ?? ''),
    sheetOf: c.page ? `${c.page} OF ${c.pages ?? c.page}` : '', drawingNo: c.drawingNo ?? c.sheet, paper: c.paper ?? '',
    date: c.date, year: String(new Date().getFullYear()),
    company: tb.company ?? '', scale: tb.scale?.trim() || 'NTS', checkedBy: tb.checkedBy ?? '', approvedBy: tb.approvedBy ?? '',
  }
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m))
}

/** Where a free-form item sits on the sheet (mm), for a strip at r (bottom or right). */
export function itemRect(it: TBItem, r: { x: number; y: number; w: number; h: number }, side: TBSide) {
  return side === 'bottom'
    ? { x: r.x + it.a * r.w, y: r.y + it.b, w: it.da * r.w, h: it.db }
    : { x: r.x + it.b, y: r.y + it.a * r.h, w: it.db, h: it.da * r.h }
}

/** Turns a box-and-row title block into free-form items (same look) so it can be edited in the builder. */
export function fieldsToItems(tb: TitleBlockTemplate): TBItem[] {
  const L = 1000, H = tb.height
  const lay = titleBlockBoxes(tb, { x: 0, y: 0, w: L, h: H }, !!tb.logo)
  const out: TBItem[] = []
  const id = () => newId()
  if (lay.logo && tb.logo) {
    out.push({ id: id(), kind: 'image', a: (lay.logo.x + 2) / L, b: 2, da: (lay.logo.w - 4) / L, db: H - 4, src: tb.logo.dataUrl, light: tb.logo.light })
    const lx = tb.logoSide === 'right' ? lay.logo.x : lay.logo.x + lay.logo.w
    out.push({ id: id(), kind: 'line', a: lx / L, b: 0, da: 0, db: H, strokeWidth: 0.35 })
  }
  const byId = new Map(tb.fields.map((f) => [f.id, f]))
  const rowYs = [...new Set(lay.fields.map((b) => b.y))].sort((a, b) => a - b)
  for (const y of rowYs.slice(1)) { const bs = lay.fields.filter((b) => b.y === y); out.push({ id: id(), kind: 'line', a: Math.min(...bs.map((b) => b.x)) / L, b: y, da: (Math.max(...bs.map((b) => b.x + b.w)) - Math.min(...bs.map((b) => b.x))) / L, db: 0, strokeWidth: 0.35 }) }
  const varOf: Partial<Record<TBSource, string>> = { project: '{project}', client: '{client}', location: '{location}', designer: '{designer}', drawing: '{drawing}', rev: '{rev}', date: '{date}', sheet: '{sheet}', sheetOf: '{sheetOf}', pageTitle: '{pageTitle}', drawingNo: '{drawingNo}', revDesc: '{revDesc}', checkedBy: '{checkedBy}', approvedBy: '{approvedBy}', scale: '{scale}', company: '{company}' }
  for (const b of lay.fields) {
    const f = byId.get(b.id)!
    if (lay.fields.some((q) => q.y === b.y && q.x > b.x)) out.push({ id: id(), kind: 'line', a: (b.x + b.w) / L, b: b.y, da: 0, db: b.h, strokeWidth: 0.35 })
    if (f.label) out.push({ id: id(), kind: 'text', a: (b.x + 2) / L, b: b.y + 1.2, da: (b.w - 4) / L, db: 3.6, text: f.label, size: 2.2, color: '#555555', vAlign: 'middle' })
    out.push({ id: id(), kind: 'text', a: (b.x + 2) / L, b: b.y + (f.label ? 5 : 1.5), da: (b.w - 4) / L, db: b.h - (f.label ? 6 : 3), text: f.source === 'custom' ? f.text ?? '' : varOf[f.source] ?? '', size: f.big ? 5 : 4, bold: !!f.big, align: f.align ?? 'left', vAlign: 'middle' })
  }
  return out
}

/** A blank free-form title block to start a new design from (laid out for its side). */
export function blankFreeTitleBlock(side: TBSide = 'bottom', size = side === 'bottom' ? 30 : 45): TitleBlockTemplate {
  const T = size
  const items: TBItem[] = side === 'bottom'
    ? [{ id: newId(), kind: 'text', a: 0.01, b: 4, da: 0.4, db: T - 8, text: '{project}\n{drawing}', size: 5, bold: true, vAlign: 'middle' },
      { id: newId(), kind: 'line', a: 0.8, b: 0, da: 0, db: T, strokeWidth: 0.35 },
      { id: newId(), kind: 'text', a: 0.81, b: 1.5, da: 0.18, db: 4, text: 'SHEET', size: 2.2, color: '#555555' },
      { id: newId(), kind: 'text', a: 0.81, b: 7, da: 0.18, db: T - 10, text: '{sheet}', size: 7, bold: true, vAlign: 'middle' }]
    : [{ id: newId(), kind: 'text', a: 0.02, b: 3, da: 0.12, db: T - 6, text: '{company}', size: 3.5, bold: true, align: 'center' },
      { id: newId(), kind: 'line', a: 0.16, b: 0, da: 0, db: T, strokeWidth: 0.35 },
      { id: newId(), kind: 'text', a: 0.2, b: T / 2 - 6, da: 0.6, db: 12, text: '{project} – {drawing}', size: 6, bold: true, align: 'center', vAlign: 'middle', rotate: side === 'right' ? 270 : 90 },
      { id: newId(), kind: 'line', a: 0.86, b: 0, da: 0, db: T, strokeWidth: 0.35 },
      { id: newId(), kind: 'text', a: 0.87, b: 2, da: 0.03, db: T - 4, text: 'SHEET', size: 2.2, color: '#555555', align: 'center' },
      { id: newId(), kind: 'text', a: 0.9, b: 2, da: 0.09, db: T - 4, text: '{sheet}', size: 7, bold: true, align: 'center', vAlign: 'middle' }]
  return { id: newId(), name: 'New title block', height: T, logoSide: 'left', logoWidth: 50, fields: [], side, items }
}

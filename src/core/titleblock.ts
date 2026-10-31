// Title blocks: the strip along the bottom of every printed sheet. A project
// carries its own (fields, layout, logo) so the logo and layout are saved with
// it; any title block can also be saved as a template and reused in other
// projects (the logo travels inside the template).

import { newId, type Project } from './model'

export type TBSource =
  | 'project' | 'client' | 'location' | 'designer' | 'drawing' | 'rev' | 'date' | 'sheet' | 'custom'

export const TB_SOURCES: { value: TBSource; label: string }[] = [
  { value: 'project', label: 'Project name' },
  { value: 'client', label: 'Client' },
  { value: 'location', label: 'Location' },
  { value: 'designer', label: 'Designer' },
  { value: 'drawing', label: 'Drawing title' },
  { value: 'rev', label: 'Revision' },
  { value: 'date', label: 'Date' },
  { value: 'sheet', label: 'Sheet number' },
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
  /** 0 = top row, 1 = bottom row (rows split the block's height). */
  row: 0 | 1
  big?: boolean
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
}

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

export interface TBContext { drawing: string; sheet: string; rev: string; date: string }

export function fieldValue(p: Project, f: TBField, c: TBContext): string {
  switch (f.source) {
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

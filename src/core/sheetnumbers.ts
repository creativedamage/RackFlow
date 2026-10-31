// Sheet numbers for wiring-diagram pages ("AV101", "AV102"…): a project-wide
// prefix + start number, with a custom number on any page or signal view.
// Also used for other drawings' "Drawing no." (AV501 → AV501, AV502…).

import type { Project } from './model'
import { groupsOf } from './groups'
import { viewsOf } from './views'

export interface SheetNumbering {
  prefix: string
  start: number
  step: number
}

export const GENERAL_PAGE = 'general'

export const defaultNumbering = (): SheetNumbering => ({ prefix: 'AV', start: 101, step: 1 })

/** "AV101" + 2 → "AV103"; keeps zero padding ("E-001" → "E-003"). No trailing number → "X.3". */
export function bumpNumber(base: string, by: number): string {
  const m = base.match(/^(.*?)(\d+)$/)
  if (!m) return by === 0 ? base : `${base}.${by + 1}`
  const n = String(Number(m[2]) + by)
  return m[1] + (n.length < m[2].length ? n.padStart(m[2].length, '0') : n)
}

/** The nth (0-based) automatic number. */
export const autoNumber = (n: SheetNumbering, i: number) => `${n.prefix}${n.start + i * n.step}`

/** Does the project's diagram (or anything printed without pages) need a "general" sheet? */
const hasGeneral = (p: Project) => {
  const gs = new Set(groupsOf(p).map((g) => g.id))
  return !gs.size || p.equipment.some((e) => !e.groupId || !gs.has(e.groupId))
}

/**
 * Sheet number of every page, in print order: pages (tab order), the general
 * sheet for devices on no page, then signal views. Custom numbers win; the
 * rest count up from the start number by position (so numbers stay put when
 * one page gets a custom number).
 */
export function pageNumbers(p: Project): Map<string, string> {
  const n = p.diagram?.numbering
  const out = new Map<string, string>()
  const keys: { id: string; custom?: string }[] = [
    ...groupsOf(p).map((g) => ({ id: g.id, custom: g.number })),
    ...(hasGeneral(p) ? [{ id: GENERAL_PAGE, custom: p.diagram?.generalNumber }] : []),
    ...viewsOf(p).map((v) => ({ id: v.id, custom: v.number })),
  ]
  keys.forEach((k, i) => {
    const label = k.custom?.trim() || (n ? autoNumber(n, i) : '')
    if (label) out.set(k.id, label)
  })
  return out
}

/** Sheet label for the i-th (0-based) sheet of a drawing set with an optional drawing number. */
export function sheetLabel(drawingNumber: string | undefined, i: number): string | undefined {
  return drawingNumber?.trim() ? bumpNumber(drawingNumber.trim(), i) : undefined
}

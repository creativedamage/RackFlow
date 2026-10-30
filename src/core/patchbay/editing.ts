// Spreadsheet-style editing operations for patch bay labels. All functions
// mutate a bay in place (works on Immer drafts) and treat channel ranges as
// inclusive, 1-based, in any order.

import { newId, type CellStyle, type NormalMode, type PatchBay } from '../model'
import { findCell, setCell } from './patchbay'

export interface CellRange { row: number; a: number; b: number }
const span = (r: CellRange) => [Math.min(r.a, r.b), Math.max(r.a, r.b)] as const
const channels = (r: CellRange) => { const [lo, hi] = span(r); return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) }

export const rowChannelCount = (bay: PatchBay, row: number) => bay.template.rows.find((r) => r.id === row)?.strip.channelCount ?? 0

/** Apply a style patch to cells (or toggle a boolean if `toggle` is set). */
export function styleRange(bay: PatchBay, r: CellRange, patch: CellStyle) {
  for (const ch of channels(r)) {
    const c = findCell(bay, r.row, ch) ?? (setCell(bay, r.row, ch, {}), findCell(bay, r.row, ch)!)
    c.style = clean({ ...c.style, ...patch })
  }
}

/** Toggle a boolean style: on for all if any cell is off, else off for all. */
export function toggleStyle(bay: PatchBay, r: CellRange, key: 'bold' | 'italic' | 'underline' | 'strike') {
  const anyOff = channels(r).some((ch) => !findCell(bay, r.row, ch)?.style?.[key])
  styleRange(bay, r, { [key]: anyOff ? true : undefined })
}

export function clearFormatting(bay: PatchBay, r: CellRange) {
  for (const ch of channels(r)) { const c = findCell(bay, r.row, ch); if (c) delete c.style }
}

/** Write texts left→right starting at the range start (paste, fill). Marks cells manual. */
export function writeTexts(bay: PatchBay, row: number, start: number, texts: string[]) {
  const max = rowChannelCount(bay, row)
  texts.forEach((t, i) => { const ch = start + i; if (ch <= max) setCell(bay, row, ch, { text: t, manual: true }) })
}

export function clearRange(bay: PatchBay, r: CellRange) {
  for (const ch of channels(r)) setCell(bay, r.row, ch, { text: '', manual: false })
}

/**
 * Fill a series. Pattern tokens: {n} number, {nn} zero-padded to 2, {A} letter
 * (A…Z, AA…), {a} lower-case letter. Plain text without tokens gets a number
 * appended (e.g. "MIC" → "MIC 1").
 */
export function fillSeries(bay: PatchBay, r: CellRange, pattern: string, start = 1) {
  const p = /\{(n|nn|A|a)\}/.test(pattern) ? pattern : `${pattern}${pattern ? ' ' : ''}{n}`
  const [lo] = span(r)
  writeTexts(bay, r.row, lo, channels(r).map((_, i) => {
    const n = start + i
    return p.replaceAll('{nn}', String(n).padStart(2, '0')).replaceAll('{n}', String(n))
      .replaceAll('{A}', letters(n)).replaceAll('{a}', letters(n).toLowerCase())
  }))
}

export function letters(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

/** Merge a range into a spanning group title. Overlapping titles on that row are replaced. */
export function mergeTitle(bay: PatchBay, r: CellRange, text: string) {
  const [lo, hi] = span(r)
  trimTitles(bay, r.row, lo, hi)
  const id = newId<string>()
  bay.spans.push({ id, row: r.row, start: lo, end: hi, text })
  bay.spans.sort((x, y) => x.row - y.row || x.start - y.start)
  return id
}

export function removeTitles(bay: PatchBay, r: CellRange) {
  const [lo, hi] = span(r)
  trimTitles(bay, r.row, lo, hi)
}

/** Cut channels lo…hi out of existing titles on a row, keeping the parts outside. */
function trimTitles(bay: PatchBay, row: number, lo: number, hi: number) {
  const out: typeof bay.spans = []
  for (const s of bay.spans) {
    if (s.row !== row || s.end < lo || s.start > hi) { out.push(s); continue }
    if (s.start < lo) out.push({ ...s, end: lo - 1 })
    if (s.end > hi) out.push({ ...s, id: s.start < lo ? newId<string>() : s.id, start: hi + 1 })
  }
  bay.spans = out
}

export const titlesIn = (bay: PatchBay, row: number) => bay.spans.filter((s) => s.row === row)

/** Set normalling for a channel range on the band below `afterRow`. */
export function setNormals(bay: PatchBay, afterRow: number, a: number, b: number, mode: NormalMode) {
  const band = bay.normals.find((n) => n.afterRow === afterRow)
  if (!band) return
  const lo = Math.min(a, b), hi = Math.max(a, b)
  for (let ch = lo; ch <= hi; ch++) if (ch >= 1 && ch <= band.modes.length) band.modes[ch - 1] = mode
}

/** Cycle one channel none → half → full → parallel → none. */
export function cycleNormal(bay: PatchBay, afterRow: number, ch: number) {
  const order: NormalMode[] = ['none', 'half', 'full', 'parallel']
  const band = bay.normals.find((n) => n.afterRow === afterRow)
  if (!band) return
  band.modes[ch - 1] = order[(order.indexOf(band.modes[ch - 1] ?? 'none') + 1) % order.length]
}

/** Copy a range as TSV (one row), the format Excel/Numbers paste. */
export function copyRange(bay: PatchBay, r: CellRange): string {
  return channels(r).map((ch) => (findCell(bay, r.row, ch)?.text ?? '').replace(/\n/g, ' / ')).join('\t')
}

/** Paste TSV/lines at a cell: tabs go across; newlines also go across (single strip). */
export function pasteAt(bay: PatchBay, row: number, start: number, data: string) {
  const parts = data.replace(/\r/g, '').replace(/\n$/, '').split(/\t|\n/).map((s) => s.replace(/ \/ /g, '\n'))
  writeTexts(bay, row, start, parts)
}

function clean(s: CellStyle): CellStyle | undefined {
  const out: CellStyle = {}
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== false && v !== '') (out as Record<string, unknown>)[k] = v
  return Object.keys(out).length ? out : undefined
}

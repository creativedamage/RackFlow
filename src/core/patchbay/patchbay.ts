import {
  newId, type CanvasPoint, type LabelCell, type LabelFormat, type LabelStyle, type NormalBand, type NormalMode, type PatchBay,
  type PatchBayTemplate, type Project,
} from '../model'
import { addEquipment, removeEquipment } from '../project'
import { makePatchProduct } from './template'

export const DEFAULT_FORMAT: LabelFormat = { template: '{tag}\n{port}', uppercase: true, maxCharsPerLine: 0 }
export const DEFAULT_STYLE: LabelStyle = { fontFamily: 'Helvetica, Arial, sans-serif', maxFontPt: 7, minFontPt: 4, showChannelNumbers: false, colorByDomain: false, cellDividers: true }

/** Tokens: {tag} {port} {signal} {cable} {room} {ch} {model} – "\n" = new line. */
export const FORMAT_PRESETS: { name: string; format: LabelFormat }[] = [
  { name: 'Device / Port', format: { ...DEFAULT_FORMAT } },
  { name: 'Port only', format: { ...DEFAULT_FORMAT, template: '{port}' } },
  { name: 'Cable number', format: { ...DEFAULT_FORMAT, template: '{cable}' } },
  { name: 'Device / Port / Cable', format: { ...DEFAULT_FORMAT, template: '{tag}\n{port}\n{cable}' } },
  { name: 'Room / Device', format: { ...DEFAULT_FORMAT, template: '{room}\n{tag}' } },
]

/** PatchCAD-style symbols for the normalling row. */
export const NORMAL_SYMBOLS: Record<NormalMode, { glyph: string; name: string }> = {
  none: { glyph: '', name: 'Non-normalled' },
  half: { glyph: '↓', name: 'Half-normalled' },
  full: { glyph: '↕', name: 'Full-normalled' },
  parallel: { glyph: '‖', name: 'Parallel / multed' },
}

export function blankCells(t: PatchBayTemplate): LabelCell[] {
  return t.rows.flatMap((r) => Array.from({ length: Math.max(r.strip.channelCount, 1) }, (_, i) => ({ row: r.id, channel: i + 1, text: '', manual: false, fill: null })))
}

/** One normalling band between each top/bottom pair of rows, seeded from the template. */
export function defaultNormals(t: PatchBayTemplate): NormalBand[] {
  const mode: NormalMode = t.normalling === 'half' ? 'half' : t.normalling === 'full' ? 'full' : 'none'
  const bands: NormalBand[] = []
  for (let i = 0; i + 1 < t.rows.length; i += 2) {
    bands.push({ afterRow: t.rows[i].id, modes: Array.from({ length: t.rows[i].strip.channelCount }, () => mode) })
  }
  return bands
}

/** Fills fields added after a project was saved (additive migration). */
export function upgradeBay(bay: PatchBay): PatchBay {
  bay.spans ??= []
  bay.location ??= ''
  bay.rowFill ??= {}
  bay.normals ??= defaultNormals(bay.template)
  return bay
}

export const findCell = (bay: PatchBay, row: number, channel: number) => bay.cells.find((c) => c.row === row && c.channel === channel)

export function setCell(bay: PatchBay, row: number, channel: number, patch: Partial<LabelCell>) {
  const c = findCell(bay, row, channel)
  if (c) Object.assign(c, patch)
  else bay.cells.push({ row, channel, text: '', manual: false, fill: null, ...patch })
}

/** Adds the bay as equipment (so it can be wired and racked) plus its label set. */
export function addPatchBay(p: Project, template: PatchBayTemplate, at: CanvasPoint): PatchBay {
  const eq = addEquipment(p, makePatchProduct(template), at)
  const bay: PatchBay = {
    id: newId(), name: eq.tag, location: '', equipment: eq.id, template: structuredClone(template),
    format: { ...DEFAULT_FORMAT }, style: { ...DEFAULT_STYLE, ...(template.defaultStyle ?? {}) }, cells: blankCells(template),
    spans: [], normals: defaultNormals(template), rowFill: {},
  }
  p.patchBays.push(bay)
  return bay
}

/** Removes a bay and its equipment (and therefore its cables). */
export function removePatchBay(p: Project, bayId: string) {
  const bay = p.patchBays.find((b) => b.id === bayId)
  if (bay) removeEquipment(p, [bay.equipment])
}

export function moveBay(p: Project, bayId: string, delta: -1 | 1) {
  const i = p.patchBays.findIndex((b) => b.id === bayId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= p.patchBays.length) return
  ;[p.patchBays[i], p.patchBays[j]] = [p.patchBays[j], p.patchBays[i]]
}

/**
 * Changes a placed bay's layout (rows, ports, termination, category…). Labels
 * stay on cells that still exist; cables on ports that no longer exist are
 * removed (returned count).
 */
export function retemplateBay(p: Project, bayId: string, t: PatchBayTemplate): number {
  const bay = p.patchBays.find((b) => b.id === bayId)
  const eq = bay && p.equipment.find((e) => e.id === bay.equipment)
  if (!bay || !eq) return 0
  const product = makePatchProduct(t)
  eq.product = product
  const ids = new Set(product.ports.map((x) => x.id))
  const before = p.cables.length
  p.cables = p.cables.filter((c) => !((c.from.equipment === eq.id && !ids.has(c.from.port)) || (c.to.equipment === eq.id && !ids.has(c.to.port))))
  const sameRows = bay.template.rows.length === t.rows.length && bay.template.rows.every((r, i) => r.strip.channelCount === t.rows[i].strip.channelCount)
  bay.template = structuredClone(t)
  const old = new Map(bay.cells.map((c) => [`${c.row}/${c.channel}`, c]))
  bay.cells = blankCells(t).map((c) => old.get(`${c.row}/${c.channel}`) ?? c)
  bay.spans = bay.spans.filter((s) => { const r = t.rows.find((x) => x.id === s.row); return !!r && s.end <= r.strip.channelCount })
  if (!sameRows) bay.normals = defaultNormals(t)
  return before - p.cables.length
}

// The whole drawing set as individual sheets (for the web viewer): every
// wiring page and view, rack elevation, wall box / panel fabrication sheet,
// patch-label page and LED wall map – each rendered on demand as SVG (mm units).

import type { Project } from '../model'
import { exportChoices } from '../exportall'
import { defaultSchematic, schematicSheets } from './schematic'
import { defaultRackPrint, rackElevationSheets } from './rackprint'
import { defaultFabrication, fabricationSheets } from './fabrication'
import { defaultLedPrint, ledSheets } from './ledmap'
import { defaultPrintOptions, layoutLabels, pageToSVG } from '../patchbay/layout'

export type SheetGroup = 'Wiring' | 'Signal views' | 'Racks' | 'Wall boxes & panels' | 'Patch labels' | 'LED walls'
export interface DrawingSheet { id: string; group: SheetGroup; title: string; render: () => string[] }

export function drawingSet(p: Project): DrawingSheet[] {
  const ch = exportChoices(p)
  const out: DrawingSheet[] = []
  const wiring = { ...defaultSchematic(p), sheet: 'archD', split: p.groups?.length ? 'group' as const : 'none' as const }
  for (const c of ch.wiring ?? []) out.push({ id: `wiring:${c.id}`, group: c.label.startsWith('View:') ? 'Signal views' : 'Wiring', title: c.label.replace(/^(Page|View): /, ''), render: () => schematicSheets(p, { ...wiring, onlySheets: [c.id] }) })
  for (const c of ch.racks ?? []) out.push({ id: `rack:${c.id}`, group: 'Racks', title: c.label, render: () => rackElevationSheets(p, { ...defaultRackPrint(), face: 'both', racks: [c.id] }) })
  for (const c of ch.panels ?? []) out.push({ id: `panel:${c.id}`, group: 'Wall boxes & panels', title: c.label, render: () => fabricationSheets(p, { ...defaultFabrication(), only: [c.id] }) })
  for (const b of p.patchBays) out.push({ id: `labels:${b.id}`, group: 'Patch labels', title: b.name, render: () => layoutLabels([b], defaultPrintOptions()).map(pageToSVG) })
  for (const c of ch.led ?? []) out.push({ id: `led:${c.id}`, group: 'LED walls', title: c.label, render: () => ledSheets(p, { ...defaultLedPrint(), walls: [c.id] }) })
  return out
}

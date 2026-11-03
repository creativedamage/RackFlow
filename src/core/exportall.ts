// "Export Everything": every drawing and schedule in one go.

import { lenUnit, toLen, toWt, wtUnit } from './units'
import type { Project } from './model'
import { schematicSheets, defaultSchematic } from './drawing/schematic'
import { rackElevationSheets, defaultRackPrint } from './drawing/rackprint'
import { ledSheets, defaultLedPrint } from './drawing/ledmap'
import { defaultFabrication, fabricationSheets } from './drawing/fabrication'
import { sheetsToHTML, sheetSize } from './drawing/sheet'
import { defaultPrintOptions, layoutLabels, pagesToPrintHTML } from './patchbay/layout'
import { cablesToCSV } from './schedule'
import { pullScheduleCSV } from './pullschedule'
import { networkRows, rowSwitch, rowSwitchPort, rowVlan, switchPortRows } from './network'
import { CATEGORIES } from './model'

export type ExportPart = 'wiring' | 'racks' | 'panels' | 'labels' | 'led' | 'cables' | 'pull' | 'equipment' | 'network' | 'switchports'
export const EXPORT_PARTS: { key: ExportPart; name: string; file: string }[] = [
  { key: 'wiring', name: 'Wiring diagram (every page)', file: 'Wiring Diagram.pdf' },
  { key: 'racks', name: 'Rack elevations (front & rear)', file: 'Rack Elevations.pdf' },
  { key: 'panels', name: 'Wall plate & panel fabrication drawings (for fabricators)', file: 'Panel Fabrication.pdf' },
  { key: 'labels', name: 'Patch bay labels', file: 'Patch Labels.pdf' },
  { key: 'led', name: 'LED wall maps (data & power)', file: 'LED Wall Maps.pdf' },
  { key: 'cables', name: 'Cable schedule (CSV)', file: 'Cable Schedule.csv' },
  { key: 'pull', name: 'Pull schedule (CSV, incl. unwired ports)', file: 'Pull Schedule.csv' },
  { key: 'equipment', name: 'Equipment list (CSV)', file: 'Equipment List.csv' },
  { key: 'network', name: 'Network / IP schedule (CSV)', file: 'Network Schedule.csv' },
  { key: 'switchports', name: 'Switch ports & VLANs (CSV)', file: 'Switch Ports VLANs.csv' },
]

export interface ExportFile { name: string; kind: 'pdf' | 'text'; content: string; count: number }

const csv = (rows: string[][]) => rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n')

/** Builds every requested file (PDFs as print-ready HTML, schedules as CSV). Parts with nothing in them are skipped. */
export function buildExport(p: Project, parts: ExportPart[], sheet = 'ansiB'): ExportFile[] {
  const out: ExportFile[] = []
  const name = (k: ExportPart) => EXPORT_PARTS.find((x) => x.key === k)!.file
  if (parts.includes('wiring') && p.equipment.length) {
    const o = { ...defaultSchematic(p), sheet: sheet === 'ansiB' ? 'archD' : sheet, split: p.groups?.length ? 'group' as const : 'none' as const }
    const pages = schematicSheets(p, o)
    if (pages.length) out.push({ name: name('wiring'), kind: 'pdf', content: sheetsToHTML(pages, sheetSize(o)), count: pages.length })
  }
  if (parts.includes('racks') && p.racks.length) {
    const o = { ...defaultRackPrint(), sheet, face: 'both' as const }
    const pages = rackElevationSheets(p, o)
    if (pages.length) out.push({ name: name('racks'), kind: 'pdf', content: sheetsToHTML(pages, sheetSize(o)), count: pages.length })
  }
  if (parts.includes('panels')) {
    const o = { ...defaultFabrication(), sheet }
    const pages = fabricationSheets(p, o)
    if (pages.length) out.push({ name: name('panels'), kind: 'pdf', content: sheetsToHTML(pages, sheetSize(o)), count: pages.length })
  }
  if (parts.includes('labels') && p.patchBays.length) {
    const pages = layoutLabels(p.patchBays, defaultPrintOptions())
    if (pages.length) out.push({ name: name('labels'), kind: 'pdf', content: pagesToPrintHTML(pages), count: pages.length })
  }
  if (parts.includes('led') && p.ledWalls?.length) {
    const o = { ...defaultLedPrint(), sheet }
    const pages = ledSheets(p, o)
    if (pages.length) out.push({ name: name('led'), kind: 'pdf', content: sheetsToHTML(pages, sheetSize(o)), count: pages.length })
  }
  if (parts.includes('cables') && p.cables.length) out.push({ name: name('cables'), kind: 'text', content: cablesToCSV(p), count: p.cables.length })
  if (parts.includes('pull') && p.equipment.length) out.push({ name: name('pull'), kind: 'text', content: pullScheduleCSV(p, { unwired: true }), count: p.cables.length })
  if (parts.includes('equipment') && p.equipment.length) {
    const page = (id?: string) => p.groups?.find((g) => g.id === id)?.name ?? ''
    out.push({ name: name('equipment'), kind: 'text', count: p.equipment.length, content: csv([
      ['Tag', 'Manufacturer', 'Model', 'Category', 'Room', 'Page', 'Rack', 'U', 'Max W', `Weight (${wtUnit()})`, `Depth (${lenUnit()})`, 'Notes'],
      ...p.equipment.map((e) => [e.tag, e.product.manufacturer, e.product.model, CATEGORIES[e.product.category].name, e.room, page(e.groupId),
        p.racks.find((r) => r.id === e.rackPlacement?.rack)?.name ?? '', e.rackPlacement ? String(e.rackPlacement.startUnit) : '', String(e.product.power.maxWatts), String(Number(toWt(e.product.physical.weightKG).toFixed(1))), String(Number(toLen(e.product.physical.depthMM).toFixed(1))), e.notes]),
    ]) })
  }
  if (parts.includes('network')) {
    const rows = networkRows(p)
    if (rows.length) out.push({ name: name('network'), kind: 'text', count: rows.length, content: csv([
      ['IP Address', 'Device ID', 'Interface', 'Manufacturer', 'Model', 'Location', 'Switch', 'Switch Port', 'VLAN', 'Notes'],
      ...rows.map((r) => [r.info.ip ?? '', r.eq.tag, r.interface, r.eq.product.manufacturer, r.eq.product.model, r.eq.room, r.isSwitch ? '' : rowSwitch(r), r.isSwitch ? '' : rowSwitchPort(r), rowVlan(r).vlan, r.info.notes ?? '']),
    ]) })
  }
  if (parts.includes('switchports')) {
    const sp = switchPortRows(p)
    if (sp.length) out.push({ name: name('switchports'), kind: 'text', count: sp.length, content: csv([
      ['Switch', 'Port', 'Mode', 'VLAN (untagged)', 'Tagged VLANs', 'Connected Device', 'Device Interface', 'Via', 'Notes'],
      ...sp.map((r) => [r.sw.tag, r.port.label, r.info.mode === 'trunk' ? 'Trunk' : r.info.vlan ? 'Access' : '', r.info.vlan ?? '', r.info.tagged ?? '', r.device?.eq.tag ?? '', r.device?.interface ?? '', r.device?.link?.via.join(' > ') ?? '', r.info.notes ?? '']),
    ]) })
  }
  return out
}

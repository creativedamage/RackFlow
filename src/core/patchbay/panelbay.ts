// Custom rack panels that are patch panels too: a connector panel built in the
// plate designer can be listed on the Patch Labels page. Its jacks become the
// bay's cells – one strip row per row of jacks, each cell centred over its jack –
// and the labels read the wiring on the panel's own ports.

import type { EquipmentInstance, LabelStripGeometry, PatchBay, PatchBayTemplate, PatchFormat, PortTemplate, Project, ProductDefinition } from '../model'
import { newId } from '../model'
import { DEFAULT_FORMAT, DEFAULT_STYLE } from './patchbay'
import { finishPerCell, FORMATS } from './template'

/** Rack ears: the label strip runs between them. */
const EAR_MM = 25.4
const STRIP_H_MM = 9.5

/** Is this product a rack panel set to show on the Patch Labels page? */
export const isPanelBayProduct = (p: ProductDefinition) => p.plate?.kind === 'rackPanel' && !!p.plate.patchBay

/** Bays made from a rack panel (their cells map to the panel's own jack ids). */
export const isPanelBay = (b: PatchBay) => !!b.portMap

const formatFor = (ports: PortTemplate[]): PatchFormat => {
  const count = (re: RegExp) => ports.filter((x) => re.test(x.connector)).length
  const best = ([['rj45', count(/^(rj45|etherCON)$/)], ['xlr', count(/^(xlr|miniXlr)/)], ['fiberLC', count(/^(lcDuplex|scDuplex|opticalCON|mdc|mpo)/)],
    ['bncVideo', count(/^bnc$/)], ['quarterInchTRS', count(/^trs/)], ['ttBantam', count(/^bantam/)]] as [PatchFormat, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : 'xlr'
}

/**
 * The label layout of a rack panel: its front jacks grouped into rows by height
 * (top to bottom), each row ordered left to right, cells split half-way between
 * neighbouring jacks. Returns null when the panel has no signal jacks.
 */
export function panelBayLayout(product: ProductDefinition): { template: PatchBayTemplate; portMap: Record<string, string> } | null {
  const spec = product.plate
  if (!spec || spec.kind !== 'rackPanel') return null
  const L = spec.layout
  const W = L?.w ?? 482.6
  const front = product.ports.filter((x) => x.face === 'front' && x.group !== 'Power' && x.id.endsWith('.f'))
  if (!front.length) return null
  // Where each jack sits; jacks without a position are spread evenly along one row.
  const placed = front.map((port, i) => {
    const base = port.id.slice(0, -2)
    const at = L?.jacks[base]
    return { port, base, x: at?.x ?? EAR_MM + ((W - 2 * EAR_MM) * (i + 0.5)) / front.length, y: at?.y ?? 0 }
  })
  const rows: (typeof placed)[] = []
  for (const j of [...placed].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - j.y) <= 8)
    if (row) row.push(j)
    else rows.push([j])
  }
  const stripW = W - 2 * EAR_MM
  const portMap: Record<string, string> = {}
  const tRows = rows.map((r, ri) => {
    r.sort((a, b) => a.x - b.x)
    const xs = r.map((j) => Math.min(stripW, Math.max(0, j.x - EAR_MM)))
    const half = (i: number) => (i + 1 < xs.length ? (xs[i + 1] - xs[i]) / 2 : i > 0 ? (xs[i] - xs[i - 1]) / 2 : 12)
    const left = Math.max(0, xs[0] - half(0))
    const edges = [left, ...xs.map((x, i) => (i + 1 < xs.length ? (x + xs[i + 1]) / 2 : Math.min(stripW, x + half(i))))]
    const widths = xs.map((_, i) => Math.max(1, edges[i + 1] - edges[i]))
    const strip: LabelStripGeometry = finishPerCell({
      stripWidthMM: stripW, stripHeightMM: STRIP_H_MM, channelCount: r.length, channelPitchMM: widths[0], firstChannelCenterMM: xs[0],
      groupSize: null, groupGapMM: 0, linesPerCell: 2, cellWidthsMM: widths, gapsAfterMM: {}, padLeftMM: left, padRightMM: Math.max(0, stripW - edges[edges.length - 1]),
    })
    r.forEach((j, ci) => { portMap[`${ri + 1}.${ci + 1}`] = j.base })
    return { id: ri + 1, name: rows.length === 1 ? 'Port' : `Row ${ri + 1}`, strip, rearDirection: 'bidirectional' as const }
  })
  const format = formatFor(front)
  const ru = product.physical.rackUnits ?? 1
  return {
    portMap,
    template: {
      key: `panel.${product.key}`, manufacturer: product.manufacturer, series: product.model, format, rackUnits: ru,
      rows: tRows, normalling: 'open', rearConnector: FORMATS[format].rear, source: 'user', dimensionsVerified: true,
      notes: 'Made from a custom rack panel – change its jacks in the panel designer.',
    },
  }
}

/**
 * Keeps the Patch Labels page in step with a placed rack panel: adds its bay when
 * the panel is set to be a patch panel, updates the layout when the panel changes
 * (labels stay on the jacks that are still there), and removes it when unset.
 */
export function syncPanelBay(p: Project, eq: EquipmentInstance) {
  const at = p.patchBays.findIndex((b) => b.equipment === eq.id)
  const bay = at >= 0 ? p.patchBays[at] : undefined
  if (bay && !isPanelBay(bay)) return // an ordinary patch bay
  const lay = isPanelBayProduct(eq.product) ? panelBayLayout(eq.product) : null
  if (!lay) { if (bay) p.patchBays.splice(at, 1); return }
  if (!bay) {
    p.patchBays.push({
      id: newId(), name: eq.tag, location: '', equipment: eq.id, template: lay.template, portMap: lay.portMap,
      format: { ...DEFAULT_FORMAT }, style: { ...DEFAULT_STYLE }, spans: [], normals: [], rowFill: {},
      cells: lay.template.rows.flatMap((r) => Array.from({ length: r.strip.channelCount }, (_, i) => ({ row: r.id, channel: i + 1, text: '', manual: false, fill: null }))),
    })
    return
  }
  // Re-layout: keep each label with its jack.
  const byPort = new Map<string, PatchBay['cells'][number]>()
  for (const c of bay.cells) { const base = bay.portMap?.[`${c.row}.${c.channel}`]; if (base) byPort.set(base, c) }
  bay.cells = lay.template.rows.flatMap((r) => Array.from({ length: r.strip.channelCount }, (_, i) => {
    const old = byPort.get(lay.portMap[`${r.id}.${i + 1}`])
    return old ? { ...old, row: r.id, channel: i + 1 } : { row: r.id, channel: i + 1, text: '', manual: false, fill: null }
  }))
  bay.template = lay.template
  bay.portMap = lay.portMap
  bay.spans = []
  bay.normals = []
}

/** Runs syncPanelBay on every rack panel in the project. */
export function syncPanelBays(p: Project) {
  for (const e of p.equipment) if (e.product.plate?.kind === 'rackPanel') syncPanelBay(p, e)
}

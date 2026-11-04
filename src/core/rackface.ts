// Rack elevation faces for gear without a drawn panel: each port on that face as a
// numbered jack, laid out like the real thing – patch bays row by row, switches in
// odd-over-even pairs, everything else in one or two rows – so the rack page can
// show which jacks are used and draw patch cords between them.

import type { EquipmentInstance, PortTemplate, RackFace } from './model'

export type JackGlyph = 'rj45' | 'xlr' | 'round' | 'fiber' | 'power' | 'usb' | 'rect'
export interface JackSpot { port: PortTemplate; x: number; y: number; n: string; glyph: JackGlyph; labelAbove: boolean }
export interface RackFaceLayout { jacks: JackSpot[]; size: number; labels: boolean }

const glyphOf = (p: PortTemplate): JackGlyph => {
  const c = p.connector as string
  if (/^(rj45|etherCON|rj11)/i.test(c)) return 'rj45'
  if (/^xlr|^miniXlr/i.test(c)) return 'xlr'
  if (/bnc|rca|trs|bantam|speakon|powerCON/i.test(c)) return 'round'
  if (/lc|sfp|optical|fiber|st$|sc$/i.test(c)) return 'fiber'
  if (/iec|nema|schuko|c13|c14|c19|c20/i.test(c)) return 'power'
  if (/usb/i.test(c)) return 'usb'
  return 'rect'
}

/** Which panel of a device you see from this side of the rack: its front if it's mounted on that side. */
export const visiblePanel = (eq: EquipmentInstance, viewFace: RackFace): RackFace => ((eq.rackPlacement?.face ?? 'front') === viewFace ? 'front' : 'rear')

/**
 * Ports drawn on a panel of the unit. When the product says which ports are on
 * the front and which on the back, each panel shows its own (the back also its
 * power inlets). When it doesn't – most catalog gear lists everything as "rear" –
 * the panel facing you shows all its signal ports, so the elevation can be
 * patched like the real rack, and the back shows nothing extra.
 */
export function rackFacePorts(eq: EquipmentInstance, panel: RackFace): PortTemplate[] {
  const ports = eq.product.ports
  const side = (p: PortTemplate): RackFace => (p.face === 'front' ? 'front' : 'rear')
  const split = ports.some((p) => side(p) === 'front' && p.group !== 'Power') && ports.some((p) => side(p) === 'rear' && p.group !== 'Power')
  if (split) return ports.filter((p) => side(p) === panel && (panel === 'rear' || p.group !== 'Power'))
  return panel === 'front' ? ports.filter((p) => p.group !== 'Power' && !/^(pwr|power|ac)\./i.test(p.id)) : []
}

/** Short jack number: the last number in the label ("Port 12" → 12, "Top 3" → 3), else its position. */
const jackNo = (p: PortTemplate, i: number) => p.label.match(/(\d+)(?!.*\d)/)?.[1] ?? String(i + 1)

/**
 * Jack positions inside a w × h box (px). Patch bays (r1.c01…) keep one line
 * per row; long runs go odd-top / even-bottom in pairs like a switch; short
 * runs sit in one row on the right, leaving room for the tag at the left.
 */
export function rackFaceLayout(eq: EquipmentInstance, panel: RackFace, w: number, h: number): RackFaceLayout {
  const ports = rackFacePorts(eq, panel)
  if (!ports.length) return { jacks: [], size: 0, labels: false }
  const left = 50, right = 6, top = 3, bottom = 3
  const W = w - left - right, H = h - top - bottom
  const rows = new Map<string, PortTemplate[]>()
  for (const p of ports) { const m = /^r(\d+)\.c\d+/.exec(p.id); const k = m ? `r${m[1]}` : '_'; rows.set(k, [...(rows.get(k) ?? []), p]) }
  const patch = rows.size > 1 && !rows.has('_')
  let lines: PortTemplate[][]
  if (patch) lines = [...rows.values()]
  else {
    // As many lines as fit at a readable jack size; pairs (1/2, 3/4…) when two lines.
    const maxLines = Math.max(1, Math.min(4, Math.floor(H / 10)))
    const perLine = (n: number) => Math.ceil(ports.length / n)
    let n = 1
    while (n < maxLines && W / perLine(n) < 11) n++
    // Switches and other long runs of network/fibre ports: odd over even, like the real front panel.
    if (n === 1 && maxLines >= 2 && ports.length >= 12 && ports.filter((p) => ['rj45', 'fiber'].includes(glyphOf(p))).length >= ports.length * 0.6) n = 2
    if (n === 1) lines = [ports]
    else if (n === 2) lines = [ports.filter((_, i) => i % 2 === 0), ports.filter((_, i) => i % 2 === 1)]
    else lines = Array.from({ length: n }, (_, k) => ports.slice(k * perLine(n), (k + 1) * perLine(n)))
  }
  const cols = Math.max(...lines.map((l) => l.length))
  const banks = Math.floor((cols - 1) / 8)
  const bankGap = cols > 8 ? Math.min(8, W * 0.02) : 0
  const pitch = Math.min(22, (W - banks * bankGap) / cols)
  const lineH = H / lines.length
  const size = Math.max(4, Math.min(pitch * 0.72, lineH * (lines.length > 1 ? 0.55 : 0.5), 14))
  const labels = size >= 6.5
  const usedW = cols * pitch + banks * bankGap
  const x0 = left + Math.max(0, W - usedW)
  const jacks: JackSpot[] = []
  let idx = 0
  lines.forEach((line, li) => {
    const cy = top + lineH * (li + 0.5) + (labels ? (lines.length > 1 && li === 0 ? -size * 0.15 : size * 0.25) : 0)
    line.forEach((p, ci) => {
      const cx = x0 + ci * pitch + Math.floor(ci / 8) * bankGap + pitch / 2
      jacks.push({ port: p, x: cx, y: cy, n: jackNo(p, idx++), glyph: glyphOf(p), labelAbove: !(lines.length > 1 && li === lines.length - 1) })
    })
  })
  return { jacks, size, labels }
}

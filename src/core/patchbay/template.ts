import type { CableCategory, LabelStripGeometry, PatchBayTemplate, PatchFormat, PatchRowTemplate, PatchTermination, PortTemplate, ProductDefinition } from '../model'
import { newId } from '../model'
import type { ConnectorType, SignalType } from '../signals'

export const NOMINAL_STRIP_WIDTH_MM = 431.8 // 17" printable strip on a 19" 1RU bay

export const FORMATS: Record<PatchFormat, { name: string; rear: ConnectorType; signals: SignalType[]; normalled: boolean }> = {
  ttBantam: { name: 'TT / Bantam', rear: 'db25', signals: ['analogLine', 'analogMic', 'aes3'], normalled: true },
  longFrame: { name: 'Long-Frame (B-gauge)', rear: 'db25', signals: ['analogLine', 'analogMic', 'aes3'], normalled: true },
  quarterInchTRS: { name: '1/4" TRS', rear: 'trs6_35', signals: ['analogLine', 'analogMic', 'aes3'], normalled: true },
  bncVideo: { name: 'BNC Video', rear: 'bnc', signals: ['sdi3G', 'sdiHD', 'analogComposite'], normalled: true },
  bnc12G: { name: '12G-SDI BNC', rear: 'bnc', signals: ['sdi12G', 'sdi6G', 'sdi3G', 'sdiHD'], normalled: false },
  midsizeVideo: { name: 'Midsize Video', rear: 'bnc', signals: ['sdi3G', 'sdiHD', 'analogComposite'], normalled: true },
  rj45: { name: 'RJ45 Network', rear: 'rj45', signals: ['ethernet1G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'sacn', 'artNet', 'ipControl', 'hdbaseT'], normalled: false },
  fiberLC: { name: 'Fiber LC', rear: 'lcDuplex', signals: ['ethernet10G', 'ethernet1G', 'st2110', 'dante', 'ndi'], normalled: false },
  xlr: { name: 'XLR', rear: 'xlr3', signals: ['analogLine', 'analogMic', 'aes3'], normalled: false },
}
export const FORMAT_KEYS = Object.keys(FORMATS) as PatchFormat[]

/** Formats whose panels are wired on both sides (front jack + rear termination). */
export const TWO_SIDED_FORMATS: PatchFormat[] = ['rj45', 'fiberLC', 'xlr']

export const TERMINATIONS: Record<PatchTermination, { name: string; short: string; keystone: boolean }> = {
  rearOnly: { name: 'Rear only (classic patch bay)', short: 'Rear', keystone: false },
  punchdown: { name: 'Punch-down (110 IDC rear)', short: 'Punch-down', keystone: false },
  feedThrough: { name: 'Feed-through (coupler, RJ45 both sides)', short: 'Feed-through', keystone: false },
  keystonePunchdown: { name: 'Keystone – punch-down jacks', short: 'Keystone punch-down', keystone: true },
  keystoneFeedThrough: { name: 'Keystone – feed-through couplers', short: 'Keystone coupler', keystone: true },
}
export const TERMINATION_KEYS = Object.keys(TERMINATIONS) as PatchTermination[]

export const CABLE_CATEGORIES: Record<CableCategory, { name: string; signals: PortTemplate['signals'] }> = {
  cat5e: { name: 'Cat5e', signals: ['ethernet1G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'sacn', 'artNet', 'ipControl', 'hdbaseT'] },
  cat6: { name: 'Cat6', signals: ['ethernet1G', 'ethernet10G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'sacn', 'artNet', 'ipControl', 'hdbaseT', 'avbMilan'] },
  cat6a: { name: 'Cat6A', signals: ['ethernet10G', 'ethernet1G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'st2110', 'sacn', 'artNet', 'ipControl', 'hdbaseT', 'avbMilan'] },
  cat8: { name: 'Cat8', signals: ['ethernet10G', 'ethernet1G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'st2110', 'sacn', 'artNet', 'ipControl', 'hdbaseT', 'avbMilan'] },
}
export const CABLE_CATEGORY_KEYS = Object.keys(CABLE_CATEGORIES) as CableCategory[]

/** True when the panel's front jacks are also wireable (network panels). */
export const isTwoSided = (t: PatchBayTemplate) => !!t.termination && t.termination !== 'rearOnly'

/** Front connector of a two-sided panel. */
export const frontConnector = (t: PatchBayTemplate) => (t.format === 'fiberLC' ? 'lcDuplex' : t.format === 'xlr' ? 'xlr3' : 'rj45')
/** Rear connector implied by the termination. */
export function rearConnectorFor(t: PatchBayTemplate) {
  if (!isTwoSided(t)) return t.rearConnector
  return t.termination === 'punchdown' || t.termination === 'keystonePunchdown' ? 'idcPunchdown' : frontConnector(t)
}
export function patchSignals(t: PatchBayTemplate) {
  if (t.format === 'rj45' && t.cableCategory) return [...CABLE_CATEGORIES[t.cableCategory].signals]
  return [...FORMATS[t.format].signals]
}
/** "Cat6A punch-down" style description. */
export function panelDescription(t: PatchBayTemplate) {
  const cat = t.format === 'rj45' && t.cableCategory ? `${CABLE_CATEGORIES[t.cableCategory].name}${t.shielded ? ' shielded' : ''} ` : ''
  return `${cat}${isTwoSided(t) ? TERMINATIONS[t.termination!].short.toLowerCase() + ' ' : ''}`.trim()
}

export const NORMALLING_NAMES = { open: 'Open (non-normalled)', half: 'Half-normalled', full: 'Full-normalled', isolated: 'Isolated / thru' } as const

// MARK: Geometry

const perCell = (g: LabelStripGeometry) => !!g.cellWidthsMM && g.cellWidthsMM.length >= g.channelCount
const gapAfter = (g: LabelStripGeometry, n: number) => g.gapsAfterMM?.[String(n)] ?? 0

export function channelCenterMM(g: LabelStripGeometry, i: number): number {
  if (perCell(g)) { const s = cellSpanMM(g, i); return s.x + s.width / 2 }
  const bank = g.groupSize && g.groupSize > 0 ? Math.floor(i / g.groupSize) : 0
  return g.firstChannelCenterMM + i * g.channelPitchMM + bank * g.groupGapMM
}

/** Cell span (x, width) for channel index `i` (0-based). */
export function cellSpanMM(g: LabelStripGeometry, i: number) {
  if (perCell(g)) {
    const w = g.cellWidthsMM!
    let x = g.padLeftMM ?? 0
    for (let k = 0; k < i; k++) x += w[k] + gapAfter(g, k + 1)
    return { x, width: w[i] }
  }
  return { x: channelCenterMM(g, i) - g.channelPitchMM / 2, width: g.channelPitchMM }
}

/** True when there is a bank gap between channel index i-1 and i (0-based). */
export function gapBefore(g: LabelStripGeometry, i: number): boolean {
  if (i <= 0) return false
  if (perCell(g)) return gapAfter(g, i) > 0
  return !!g.groupSize && i % g.groupSize === 0
}

/** Converts any strip to per-cell form (widths + explicit gaps + paddings), same positions. */
export function toPerCell(g: LabelStripGeometry): LabelStripGeometry {
  if (perCell(g)) return { ...g, cellWidthsMM: g.cellWidthsMM!.slice(0, g.channelCount) }
  const widths = Array.from({ length: g.channelCount }, () => round3(g.channelPitchMM))
  const gaps: Record<string, number> = {}
  if (g.groupSize && g.groupGapMM > 0) for (let n = g.groupSize; n < g.channelCount; n += g.groupSize) gaps[String(n)] = g.groupGapMM
  const padLeft = Math.max(0, round3(g.firstChannelCenterMM - g.channelPitchMM / 2))
  const last = cellSpanMM(g, g.channelCount - 1)
  return finishPerCell({ ...g, cellWidthsMM: widths, gapsAfterMM: gaps, padLeftMM: padLeft, padRightMM: Math.max(0, round3(g.stripWidthMM - last.x - last.width)) })
}

/** Recomputes the derived fields (strip width, mean pitch, first centre) from per-cell data. */
export function finishPerCell(g: LabelStripGeometry): LabelStripGeometry {
  if (!g.cellWidthsMM) return g
  const n = g.channelCount
  let widths = g.cellWidthsMM.slice(0, n)
  const fill = widths[widths.length - 1] ?? g.channelPitchMM ?? 10
  while (widths.length < n) widths.push(fill)
  widths = widths.map((w) => Math.max(0.5, w))
  const gaps: Record<string, number> = {}
  for (const [k, v] of Object.entries(g.gapsAfterMM ?? {})) if (+k >= 1 && +k < n && v > 0) gaps[k] = v
  const total = (g.padLeftMM ?? 0) + widths.reduce((a, b) => a + b, 0) + Object.values(gaps).reduce((a, b) => a + b, 0) + (g.padRightMM ?? 0)
  return {
    ...g, cellWidthsMM: widths, gapsAfterMM: gaps, stripWidthMM: round3(total),
    channelPitchMM: round3(widths.reduce((a, b) => a + b, 0) / Math.max(n, 1)),
    firstChannelCenterMM: round3((g.padLeftMM ?? 0) + widths[0] / 2), groupSize: null, groupGapMM: 0,
  }
}

/** PatchCAD "Repeat Till End": repeats the widths and gaps of cells 1…k across the rest of the strip. */
export function repeatPattern(g: LabelStripGeometry, k: number): LabelStripGeometry {
  const p = toPerCell(g)
  if (k < 1 || k >= p.channelCount) return p
  const widths = p.cellWidthsMM!.slice()
  const gaps: Record<string, number> = {}
  for (let n = 1; n < k; n++) if (gapAfter(p, n)) gaps[String(n)] = gapAfter(p, n)
  const tail = gapAfter(p, k) // gap between repeats
  for (let i = k; i < p.channelCount; i++) widths[i] = widths[i % k]
  for (let n = 1; n < p.channelCount; n++) {
    const pos = n % k
    if (pos === 0) { if (tail) gaps[String(n)] = tail } else if (gapAfter(p, pos)) gaps[String(n)] = gapAfter(p, pos)
  }
  return finishPerCell({ ...p, cellWidthsMM: widths, gapsAfterMM: gaps })
}

/** Scales cell widths (not gaps or padding) so the strip is exactly `totalMM` wide. */
export function fitToWidth(g: LabelStripGeometry, totalMM: number): LabelStripGeometry {
  const p = toPerCell(g)
  const fixed = (p.padLeftMM ?? 0) + (p.padRightMM ?? 0) + Object.values(p.gapsAfterMM ?? {}).reduce((a, b) => a + b, 0)
  const sum = p.cellWidthsMM!.reduce((a, b) => a + b, 0)
  if (sum <= 0 || totalMM <= fixed) return p
  const k = (totalMM - fixed) / sum
  return finishPerCell({ ...p, cellWidthsMM: p.cellWidthsMM!.map((w) => round3(w * k)) })
}

const round3 = (x: number) => Math.round(x * 1000) / 1000

export function evenlySpaced(stripWidthMM: number, stripHeightMM: number, channelCount: number,
  opts: { sideMarginMM?: number; groupSize?: number | null; groupGapMM?: number; linesPerCell?: number } = {}): LabelStripGeometry {
  const margin = opts.sideMarginMM ?? 6
  const groupSize = opts.groupSize ?? null
  const gap = groupSize ? opts.groupGapMM ?? 4 : 0
  const gaps = groupSize ? Math.floor((channelCount - 1) / Math.max(groupSize, 1)) : 0
  const pitch = (stripWidthMM - 2 * margin - gaps * gap) / Math.max(channelCount, 1)
  return { stripWidthMM, stripHeightMM, channelCount, channelPitchMM: pitch, firstChannelCenterMM: margin + pitch / 2, groupSize, groupGapMM: gap, linesPerCell: opts.linesPerCell ?? 2 }
}

export function geometryProblems(g: LabelStripGeometry): string[] {
  const out: string[] = []
  if ((g.padTopMM ?? 0) + (g.padBottomMM ?? 0) >= g.stripHeightMM) out.push('Top + bottom padding leave no room for text.')
  if (g.channelCount < 1) out.push('Channel count must be at least 1.')
  if (g.channelPitchMM <= 0) out.push('Channel pitch must be positive.')
  if (g.stripHeightMM <= 0 || g.stripWidthMM <= 0) out.push('Strip size must be positive.')
  if (g.channelCount > 0 && g.channelPitchMM > 0) {
    const last = cellSpanMM(g, g.channelCount - 1)
    if (last.x + last.width > g.stripWidthMM + 0.01) out.push('Channels overrun the strip width.')
    if (cellSpanMM(g, 0).x < -0.01) out.push('First channel starts before the strip edge.')
  }
  return out
}

/** Derive pitch from calipers: first & last channel centres measured from the strip's left edge. */
export function applyMeasured(g: LabelStripGeometry, firstMM: number, lastMM: number): LabelStripGeometry {
  if (g.channelCount < 2 || lastMM <= firstMM) return g
  const gaps = g.groupSize ? Math.floor((g.channelCount - 1) / Math.max(g.groupSize, 1)) * g.groupGapMM : 0
  return { ...g, firstChannelCenterMM: firstMM, channelPitchMM: (lastMM - firstMM - gaps) / (g.channelCount - 1) }
}

// MARK: Templates

export const patchPortId = (row: number, channel: number) => `r${row}.c${String(channel).padStart(2, '0')}`
export const templateName = (t: PatchBayTemplate) => `${t.manufacturer} ${t.series}`
export const totalChannels = (t: PatchBayTemplate) => t.rows.reduce((a, r) => a + r.strip.channelCount, 0)

/** The bay as ordinary equipment: one rear port per channel. This is what makes
 *  signal-to-label binding possible – the bay lives in the wiring diagram. */
export function makePatchProduct(t: PatchBayTemplate): ProductDefinition {
  const f = FORMATS[t.format]
  const two = isTwoSided(t)
  const signals = patchSignals(t)
  const rear = rearConnectorFor(t)
  const desc = panelDescription(t)
  return {
    key: `patchbay.${t.key}`, manufacturer: t.manufacturer, model: t.series,
    summary: two ? `${totalChannels(t)}-port ${desc} ${t.format === 'rj45' ? 'patch panel' : f.name + ' panel'}`.replace(/\s+/g, ' ') : `${totalChannels(t)}-point ${f.name} patch bay`,
    category: 'patchBay', tags: ['patch', t.format, ...(t.cableCategory ? [t.cableCategory] : [])],
    physical: { rackUnits: t.rackUnits, halfWidth: false, widthMM: 482.6, heightMM: t.rackUnits * 44.45, depthMM: 100, weightKG: 1.5 * t.rackUnits, mounting: 'rack' },
    power: { acceptedVoltages: [], typicalWatts: 0, maxWatts: 0, publishedBTU: null, efficiency: null, poweredByPoE: false },
    ports: t.rows.flatMap((row, ri) => Array.from({ length: Math.max(row.strip.channelCount, 1) }, (_, i): PortTemplate[] => {
      const id = patchPortId(row.id, i + 1)
      // Network panels number straight through (1–48 on a 2×24); patch bays use row names.
      const before = t.rows.slice(0, ri).reduce((a, r) => a + Math.max(r.strip.channelCount, 1), 0)
      const label = two ? `Port ${before + i + 1}` : `${row.name} ${i + 1}`
      const back: PortTemplate = { id, label: two ? `${label} (rear)` : label, connector: rear, gender: 'female', direction: two ? 'bidirectional' : row.rearDirection, signals: [...signals], group: row.name, face: 'rear', maxConnections: 1 }
      if (!two) return [back]
      // Two-sided panels: the front jack (patch cord to the switch) is wireable too.
      return [{ ...back, id: `${id}.f`, label, connector: frontConnector(t), face: 'front' }, back]
    }).flat()),
    source: t.source, revision: 1,
  }
}

export function rowsFor(count: number, strip: LabelStripGeometry, existing: PatchRowTemplate[] = [], panel = false): PatchRowTemplate[] {
  // Patch bays: Top / Bottom pairs. Network / fiber panels: one row per rack unit, numbered.
  const names = panel ? Array.from({ length: count }, (_, i) => (count === 1 ? 'Port' : `Row ${i + 1}`))
    : count === 1 ? ['Row'] : count === 2 ? ['Top', 'Bottom'] : Array.from({ length: count }, (_, i) => `Row ${i + 1}`)
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1
    const prev = existing.find((r) => r.id === id)
    return prev ?? { id, name: names[i], strip: { ...strip }, rearDirection: panel || count === 1 ? 'bidirectional' : id % 2 === 1 ? 'input' : 'output' }
  })
}

export function newCustomTemplate(format: PatchFormat = 'ttBantam', rackUnits = 1, rows = 2, channels = 24): PatchBayTemplate {
  const strip = evenlySpaced(NOMINAL_STRIP_WIDTH_MM, 9.5, channels)
  return {
    key: `user.${newId()}`, manufacturer: 'Custom', series: `${rackUnits}RU ${FORMATS[format].name}`, format, rackUnits,
    rows: rowsFor(rows, strip), normalling: FORMATS[format].normalled ? 'half' : 'open', rearConnector: FORMATS[format].rear,
    source: 'user', dimensionsVerified: true, notes: '',
  }
}

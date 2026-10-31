// Built-in patch bay templates.
//
// DATA POLICY: geometry is *nominal* (19" panel, even spacing) and every
// manufacturer entry ships with dimensionsVerified = false. Before release,
// measure each against the manufacturer's designation-strip template for a
// specific part number. A 0.3 mm pitch error accumulates to ~14 mm over 48 points.

import type { CableCategory, PatchBayTemplate, PatchFormat, PatchTermination } from '../model'
import { evenlySpaced, FORMATS, NOMINAL_STRIP_WIDTH_MM } from './template'

const NOTE = 'Nominal geometry. Verify against the manufacturer’s designation-strip template for your exact part number.'

function dual(key: string, mfr: string, series: string, format: PatchFormat, ru: number, perRow: number,
  h: number, group: number | null = null, lines = 2, notes = 'Nominal geometry.'): PatchBayTemplate {
  const strip = evenlySpaced(NOMINAL_STRIP_WIDTH_MM, h, perRow, { groupSize: group, groupGapMM: group ? 4 : 0, linesPerCell: lines })
  return {
    key, manufacturer: mfr, series, format, rackUnits: ru,
    rows: [{ id: 1, name: 'Top', strip, rearDirection: 'input' }, { id: 2, name: 'Bottom', strip: { ...strip }, rearDirection: 'output' }],
    normalling: FORMATS[format].normalled ? 'half' : 'open', rearConnector: FORMATS[format].rear,
    source: 'builtIn', dimensionsVerified: false, notes,
  }
}

function single(key: string, mfr: string, series: string, format: PatchFormat, ru: number, count: number,
  h: number, group: number | null = null, notes = 'Nominal geometry.'): PatchBayTemplate {
  const strip = evenlySpaced(NOMINAL_STRIP_WIDTH_MM, h, count, { groupSize: group, groupGapMM: group ? 4 : 0 })
  return {
    key, manufacturer: mfr, series, format, rackUnits: ru, rows: [{ id: 1, name: 'Row', strip, rearDirection: 'bidirectional' }],
    normalling: 'isolated', rearConnector: FORMATS[format].rear, source: 'builtIn', dimensionsVerified: false, notes,
  }
}

const PN = 'Nominal geometry and port spacing. Check the part number, category and termination against the manufacturer’s data sheet.'

/** Network / fiber / XLR panel: one strip row per rack unit, wired on both sides. */
function panel(key: string, mfr: string, series: string, format: PatchFormat, ru: number, perRow: number,
  termination: PatchTermination, category?: CableCategory, opts: { shielded?: boolean; group?: number; rows?: number; notes?: string } = {}): PatchBayTemplate {
  const rows = opts.rows ?? ru
  const group = opts.group ?? (perRow % 6 === 0 ? 6 : null)
  const strip = evenlySpaced(NOMINAL_STRIP_WIDTH_MM, 9, perRow, { groupSize: group, groupGapMM: group ? 4 : 0, linesPerCell: 2 })
  return {
    key, manufacturer: mfr, series, format, rackUnits: ru,
    rows: Array.from({ length: rows }, (_, i) => ({ id: i + 1, name: rows === 1 ? 'Port' : `Row ${i + 1}`, strip: { ...strip }, rearDirection: 'bidirectional' as const })),
    normalling: 'isolated', rearConnector: termination === 'punchdown' || termination === 'keystonePunchdown' ? 'idcPunchdown' : FORMATS[format].rear,
    source: 'builtIn', dimensionsVerified: false, notes: opts.notes ?? PN, termination, cableCategory: category, shielded: opts.shielded,
  }
}

export const BUILT_IN_PATCH_TEMPLATES: PatchBayTemplate[] = [
  dual('generic.tt.2x48', 'Generic', 'TT 2×48 (1RU)', 'ttBantam', 1, 48, 9.5, 24),
  dual('generic.tt.2x48.2ru', 'Generic', 'TT 2×48 (2RU, wide strip)', 'ttBantam', 2, 48, 16, 24, 3),
  dual('generic.lf.2x26', 'Generic', 'Long-Frame 2×26', 'longFrame', 2, 26, 14, null, 3),
  dual('generic.trs.2x24', 'Generic', '1/4" TRS 2×24 (1RU)', 'quarterInchTRS', 1, 24, 10, 12),
  dual('generic.bnc.2x16', 'Generic', 'BNC Video 2×16 (1RU)', 'bncVideo', 1, 16, 10, null, 3),
  dual('generic.bnc.2x26', 'Generic', 'BNC Video 2×26 (2RU)', 'bncVideo', 2, 26, 14, null, 3),
  dual('generic.12g.2x16', 'Generic', '12G-SDI 2×16 (1RU)', 'bnc12G', 1, 16, 10, null, 3),
  dual('generic.midsize.2x32', 'Generic', 'Midsize Video 2×32 (1RU)', 'midsizeVideo', 1, 32, 9.5, 16),
  panel('generic.rj45.24', 'Generic', 'Cat6 Punch-down 24-port (1RU)', 'rj45', 1, 24, 'punchdown', 'cat6'),
  panel('generic.rj45.48', 'Generic', 'Cat6 Punch-down 48-port (2RU, 2×24)', 'rj45', 2, 24, 'punchdown', 'cat6'),
  panel('generic.rj45.c6a.24', 'Generic', 'Cat6A Punch-down 24-port (1RU)', 'rj45', 1, 24, 'punchdown', 'cat6a'),
  panel('generic.rj45.c6a.48', 'Generic', 'Cat6A Punch-down 48-port (2RU, 2×24)', 'rj45', 2, 24, 'punchdown', 'cat6a'),
  panel('generic.rj45.ft.24', 'Generic', 'Cat6A Feed-Through 24-port (1RU)', 'rj45', 1, 24, 'feedThrough', 'cat6a'),
  panel('generic.rj45.ft.48', 'Generic', 'Cat6A Feed-Through 48-port (2RU, 2×24)', 'rj45', 2, 24, 'feedThrough', 'cat6a'),
  panel('generic.rj45.ft.48hd', 'Generic', 'Cat6 Feed-Through 48-port High-Density (1RU)', 'rj45', 1, 48, 'feedThrough', 'cat6', { group: 12 }),
  panel('generic.rj45.ks.24', 'Generic', 'Keystone 24-port (1RU)', 'rj45', 1, 24, 'keystonePunchdown', 'cat6a'),
  panel('generic.rj45.ks.48', 'Generic', 'Keystone 48-port (2RU, 2×24)', 'rj45', 2, 24, 'keystonePunchdown', 'cat6a'),
  panel('generic.rj45.ksft.24', 'Generic', 'Keystone Coupler 24-port (1RU)', 'rj45', 1, 24, 'keystoneFeedThrough', 'cat6a'),
  panel('generic.lc.24', 'Generic', 'Fiber LC Duplex 24-port (1RU)', 'fiberLC', 1, 24, 'feedThrough', undefined, { group: 12 }),
  panel('generic.xlr.16', 'Generic', 'XLR 16-port Feed-Through (1RU)', 'xlr', 1, 16, 'feedThrough', undefined, { group: 8 }),

  panel('leviton.69586-u24', 'Leviton', 'eXtreme Cat6 69586-U24 (24-port, 1RU)', 'rj45', 1, 24, 'punchdown', 'cat6'),
  panel('leviton.69586-u48', 'Leviton', 'eXtreme Cat6 69586-U48 (48-port, 2RU)', 'rj45', 2, 24, 'punchdown', 'cat6'),
  panel('leviton.6a586-u24', 'Leviton', 'eXtreme Cat6A 6A586-U24 (24-port, 1RU)', 'rj45', 1, 24, 'punchdown', 'cat6a'),
  panel('leviton.6a586-u48', 'Leviton', 'eXtreme Cat6A 6A586-U48 (48-port, 2RU)', 'rj45', 2, 24, 'punchdown', 'cat6a'),
  panel('leviton.5g596-u24', 'Leviton', 'GigaMax Cat5e 5G596-U24 (24-port, 1RU)', 'rj45', 1, 24, 'punchdown', 'cat5e'),
  panel('leviton.5g596-u48', 'Leviton', 'GigaMax Cat5e 5G596-U48 (48-port, 2RU)', 'rj45', 2, 24, 'punchdown', 'cat5e'),
  panel('leviton.49255-q24', 'Leviton', 'QuickPort Keystone 49255-Q24 (24-port, 1RU)', 'rj45', 1, 24, 'keystonePunchdown', 'cat6'),
  panel('leviton.49255-q48', 'Leviton', 'QuickPort Keystone 49255-Q48 (48-port, 2RU)', 'rj45', 2, 24, 'keystonePunchdown', 'cat6'),
  panel('panduit.cppl24wbly', 'Panduit', 'Mini-Com Keystone CPPL24WBLY (24-port, 1RU)', 'rj45', 1, 24, 'keystonePunchdown', 'cat6a'),
  panel('panduit.cppl48wbly', 'Panduit', 'Mini-Com Keystone CPPL48WBLY (48-port, 2RU)', 'rj45', 2, 24, 'keystonePunchdown', 'cat6a'),

  dual('bittree.tt.2x48', 'Bittree', 'TT 2×48 (1RU)', 'ttBantam', 1, 48, 9.5, 24, 2, NOTE),
  dual('bittree.trs.2x24', 'Bittree', '1/4" TRS 2×24 (1RU)', 'quarterInchTRS', 1, 24, 10, 12, 2, NOTE),
  dual('bittree.12g.2x16', 'Bittree', '12G-SDI Video 2×16 (1RU)', 'bnc12G', 1, 16, 10, null, 3, NOTE),
  dual('neutrik.trs.2x24', 'Neutrik', '1/4" TRS 2×24 (1RU)', 'quarterInchTRS', 1, 24, 10, 12, 2, NOTE),
  dual('neutrik.tt.2x48', 'Neutrik', 'TT 2×48 (1RU)', 'ttBantam', 1, 48, 9.5, 24, 2, NOTE),
  panel('neutrik.ethercon.24', 'Neutrik', 'etherCON Feed-Through 24-port (1RU)', 'rj45', 1, 24, 'feedThrough', 'cat6a', { notes: NOTE }),
  dual('adc.tt.2x48', 'ADC', 'TT 2×48 (1RU)', 'ttBantam', 1, 48, 9.5, 24, 2, NOTE),
  dual('adc.lf.2x26', 'ADC', 'Long-Frame 2×26', 'longFrame', 2, 26, 14, null, 3, NOTE),
  dual('canare.bnc.2x16', 'Canare', 'BNC Video 2×16 (1RU)', 'bncVideo', 1, 16, 10, null, 3, NOTE),
  dual('canare.midsize.2x32', 'Canare', 'Midsize Video 2×32 (1RU)', 'midsizeVideo', 1, 32, 9.5, 16, 2, NOTE),
  dual('redco.tt.2x48', 'Redco', 'TT 2×48 (1RU)', 'ttBantam', 1, 48, 9.5, 24, 2, NOTE),
  single('redco.xlr.16', 'Redco', 'XLR 16-port panel (1RU)', 'xlr', 1, 16, 12, null, NOTE + ' Redco panels are often custom – use the template builder.'),
]

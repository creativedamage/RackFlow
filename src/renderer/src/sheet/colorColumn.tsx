import { CABLE_COLORS, cableColorHex, normalizeColor, type Cable } from '@core/index'
import type { SheetColumn } from './Sheet'

/** Jacket colour swatch + name. */
export function ColorChip({ name }: { name?: string }) {
  if (!name) return <span className="muted">—</span>
  const hex = cableColorHex(name)
  return <span className="cable-color"><i style={{ background: hex ?? 'transparent', borderStyle: hex ? 'solid' : 'dashed' }} />{name}</span>
}

/** A "Color" column for any sheet whose rows carry a cable (dropdown, or type / paste any colour). */
export function colorColumn<R>(cableOf: (r: R) => Cable | null | undefined): SheetColumn<R> {
  return {
    key: 'color', title: 'Color', width: 100,
    get: (r) => cableOf(r)?.color ?? '',
    value: (r) => cableOf(r)?.color ?? '',
    options: (r) => {
      if (!cableOf(r)) return []
      const cur = cableOf(r)?.color
      return [{ value: '', label: '—' }, ...(cur && !cableColorHex(cur) ? [{ value: cur, label: cur }] : []), ...CABLE_COLORS.map((c) => ({ value: c.name, label: c.name }))]
    },
    render: (r) => (cableOf(r) ? <ColorChip name={cableOf(r)?.color} /> : null),
    set: (r, v) => { const c = cableOf(r); if (c) c.color = normalizeColor(v) },
  }
}

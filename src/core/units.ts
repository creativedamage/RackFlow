// Display units. Everything is stored in metric (mm, m, kg) so files stay
// compatible; what you see and type is imperial by default (inches, feet,
// pounds) or metric if you switch (View → Units). LED pixel pitch stays in mm –
// that's how every manufacturer specifies it.

export type Units = 'imperial' | 'metric'
let units: Units = 'imperial'
export const getUnits = () => units
export const setUnits = (u: Units) => { units = u }
export const imperial = () => units === 'imperial'

const MM_PER_IN = 25.4
const KG_PER_LB = 0.45359237
const M_PER_FT = 0.3048

const trim = (v: number, d: number) => String(Number(v.toFixed(d)))

/** Short lengths (device sizes, panel faces, label strips): inches or mm. */
export const lenUnit = () => (imperial() ? 'in' : 'mm')
export const toLen = (mm: number) => (imperial() ? mm / MM_PER_IN : mm)
export const fromLen = (v: number) => (imperial() ? v * MM_PER_IN : v)
export const fmtLen = (mm: number, d = 2) => (imperial() ? `${trim(mm / MM_PER_IN, d)}"` : `${trim(mm, Math.max(0, d - 1))} mm`)
export const fmtLenPair = (wmm: number, hmm: number, d = 2) => (imperial() ? `${trim(wmm / MM_PER_IN, d)}" × ${trim(hmm / MM_PER_IN, d)}"` : `${trim(wmm, 1)} × ${trim(hmm, 1)} mm`)

/** Long lengths (cables, LED walls, rooms): feet or metres. */
export const longUnit = () => (imperial() ? 'ft' : 'm')
export const toLong = (m: number) => (imperial() ? m / M_PER_FT : m)
export const fromLong = (v: number) => (imperial() ? v * M_PER_FT : v)
export const fmtLong = (m: number, d = 1) => (imperial() ? `${trim(m / M_PER_FT, d)} ft` : `${trim(m, d + 1)} m`)
/** Feet and inches, e.g. 16' 4½" (imperial) or 4.98 m. */
export function fmtFtIn(m: number): string {
  if (!imperial()) return `${trim(m, 2)} m`
  const inches = Math.round((m / M_PER_FT) * 12 * 2) / 2
  const ft = Math.floor(inches / 12), rest = inches - ft * 12
  const r = rest % 1 ? `${Math.floor(rest)}½` : String(rest)
  return ft ? `${ft}' ${r}"` : `${r}"`
}

/** Weight: pounds or kilograms. */
export const wtUnit = () => (imperial() ? 'lb' : 'kg')
export const toWt = (kg: number) => (imperial() ? kg / KG_PER_LB : kg)
export const fromWt = (v: number) => (imperial() ? v * KG_PER_LB : v)
export const fmtWt = (kg: number, d = 1) => (imperial() ? `${trim(kg / KG_PER_LB, d)} lb` : `${trim(kg, d)} kg`)

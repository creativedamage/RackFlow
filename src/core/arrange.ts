// Align and distribute selected devices on the wiring diagram. Works on plain
// boxes so it serves the main diagram and signal views alike. Aligning never
// leaves devices on top of each other: ones that would overlap are spread out
// along the other axis, keeping their order.

export type ArrangeMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distH' | 'distV'
export interface ArrangeBox { id: string; x: number; y: number; w: number; h: number }

const GAP = 40

export function arrange(boxes: ArrangeBox[], mode: ArrangeMode, gap = GAP): Map<string, { x: number; y: number }> {
  const out = new Map(boxes.map((b) => [b.id, { x: b.x, y: b.y }]))
  if (boxes.length < 2) return out
  const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y0 = Math.min(...boxes.map((b) => b.y)), y1 = Math.max(...boxes.map((b) => b.y + b.h))
  const set = (id: string, p: Partial<{ x: number; y: number }>) => out.set(id, { ...out.get(id)!, ...p })
  const horiz = mode === 'left' || mode === 'center' || mode === 'right'
  if (horiz || mode === 'top' || mode === 'middle' || mode === 'bottom') {
    for (const b of boxes) {
      if (mode === 'left') set(b.id, { x: x0 })
      if (mode === 'right') set(b.id, { x: x1 - b.w })
      if (mode === 'center') set(b.id, { x: (x0 + x1) / 2 - b.w / 2 })
      if (mode === 'top') set(b.id, { y: y0 })
      if (mode === 'bottom') set(b.id, { y: y1 - b.h })
      if (mode === 'middle') set(b.id, { y: (y0 + y1) / 2 - b.h / 2 })
    }
    // Now in one column (or row): push apart any that overlap, in their current order.
    const sorted = [...boxes].sort((a, b) => (horiz ? a.y - b.y : a.x - b.x))
    let edge = -Infinity
    for (const b of sorted) {
      const p = out.get(b.id)!
      if (horiz) { const y = Math.max(p.y, edge); set(b.id, { y }); edge = y + b.h + gap }
      else { const x = Math.max(p.x, edge); set(b.id, { x }); edge = x + b.w + gap }
    }
  } else {
    // Equal gaps between neighbours, first and last stay put (if they'd overlap, use the minimum gap).
    const h = mode === 'distH'
    const sorted = [...boxes].sort((a, b) => (h ? a.x - b.x : a.y - b.y))
    const span = h ? x1 - x0 : y1 - y0
    const total = sorted.reduce((s, b) => s + (h ? b.w : b.h), 0)
    const g = Math.max(gap, (span - total) / (sorted.length - 1))
    let at = h ? x0 : y0
    for (const b of sorted) { set(b.id, h ? { x: at } : { y: at }); at += (h ? b.w : b.h) + g }
  }
  for (const [id, p] of out) out.set(id, { x: Math.round(p.x), y: Math.round(p.y) })
  return out
}

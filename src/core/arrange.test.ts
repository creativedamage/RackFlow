import { expect, it } from 'vitest'
import { arrange } from './arrange'

const B = [{ id: 'a', x: 0, y: 0, w: 100, h: 50 }, { id: 'b', x: 300, y: 20, w: 100, h: 80 }, { id: 'c', x: 140, y: 400, w: 200, h: 50 }]
const overlap = (m: Map<string, { x: number; y: number }>) => {
  const r = B.map((b) => ({ ...b, ...m.get(b.id)! }))
  return r.some((a, i) => r.some((c, j) => i < j && a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h))
}

it('aligns without stacking devices', () => {
  for (const mode of ['left', 'center', 'right', 'top', 'middle', 'bottom', 'distH', 'distV'] as const) expect(overlap(arrange(B, mode)), mode).toBe(false)
  const l = arrange(B, 'left'); expect(new Set(B.map((b) => l.get(b.id)!.x)).size).toBe(1)
  const t = arrange(B, 'top'); expect(new Set(B.map((b) => t.get(b.id)!.y)).size).toBe(1)
})

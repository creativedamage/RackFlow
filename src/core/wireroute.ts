// Orthogonal wire routing shared by the on-screen diagram and printed drawings.

export interface Rect { id: string; x0: number; y0: number; x1: number; y1: number }
export type Pt = { x: number; y: number }

export const WIRE_GAP = 18    // how far a wire leaves a port before turning
export const WIRE_CLEAR = 10  // keep-out margin around devices
const GAP = WIRE_GAP
const STEP = 8                // search step for a free lane
const CLEAR = WIRE_CLEAR

const hitsH = (y: number, xa: number, xb: number, r: Rect) => y > r.y0 && y < r.y1 && Math.max(xa, xb) > r.x0 && Math.min(xa, xb) < r.x1
const hitsV = (x: number, ya: number, yb: number, r: Rect) => x > r.x0 && x < r.x1 && Math.max(ya, yb) > r.y0 && Math.min(ya, yb) < r.y1

/** Number of device crossings for a polyline. The source/target devices are skipped for the stubs. */
export function crossings(pts: Pt[], rects: Rect[], ends: Rect[]): number {
  let n = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const stub = i === 0 || i === pts.length - 2
    for (const r of rects) {
      if (stub && ends.includes(r)) continue
      if (a.y === b.y ? hitsH(a.y, a.x, b.x, r) : hitsV(a.x, a.y, b.y, r)) n++
    }
  }
  return n
}

/** Orthogonal route that avoids devices where it can (fewest crossings, then shortest). */
export function route(s: Pt, sDir: number, t: Pt, tDir: number, rects: Rect[], lane: number, channel?: number): Pt[] {
  const ends = rects.filter((r) => (s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1) || (t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1))
  const sx = s.x + sDir * GAP, tx = t.x + tDir * GAP
  const spread = ((lane % 9) - 4) * 3 // keeps parallel wires from stacking exactly
  const options: Pt[][] = []
  // The planned track for this wire comes first; it's kept unless it runs through a device.
  if (channel != null && sDir === -tDir) {
    const lo = Math.min(sx, tx), hi = Math.max(sx, tx)
    if (channel > lo - 0.5 && channel < hi + 0.5) {
      const planned = [s, { x: channel, y: s.y }, { x: channel, y: t.y }, t]
      if (crossings(planned, rects, ends) === 0) return planned
      options.push(planned)
    }
  }
  // Simple "Z": out, across at x = c, in. Works when the target is ahead of the source.
  if (sDir === -tDir && ((sDir > 0 && tx >= sx) || (sDir < 0 && tx <= sx))) {
    const lo = Math.min(sx, tx), hi = Math.max(sx, tx), mid = (lo + hi) / 2 + spread
    for (let d = 0; d <= (hi - lo) / 2 + STEP; d += STEP) for (const c of d ? [mid - d, mid + d] : [mid]) {
      if (c < lo - 0.5 || c > hi + 0.5) continue
      options.push([s, { x: c, y: s.y }, { x: c, y: t.y }, t])
    }
  }
  // Both ports face the same way: run out past both, then along.
  if (sDir === tDir) {
    const c = (sDir > 0 ? Math.max(sx, tx) : Math.min(sx, tx)) + sDir * Math.abs(spread)
    options.push([s, { x: c, y: s.y }, { x: c, y: t.y }, t])
  }
  // "U" / detour: out, over or under everything in the way, back in.
  const between = rects.filter((r) => r.x1 > Math.min(sx, tx) && r.x0 < Math.max(sx, tx))
  const top = Math.min(s.y, t.y, ...between.map((r) => r.y0)) - STEP + spread
  const bottom = Math.max(s.y, t.y, ...between.map((r) => r.y1)) + STEP + spread
  for (const y of [(s.y + t.y) / 2 + spread, top, bottom]) {
    options.push([s, { x: sx, y: s.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: t.y }, t])
  }
  let best = options[0], score = Infinity
  for (const o of options) {
    const pts = o.filter((p, i) => i === 0 || p.x !== o[i - 1].x || p.y !== o[i - 1].y)
    const len = pts.slice(1).reduce((a, p, i) => a + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0)
    const sc = crossings(pts, rects, ends) * 800 + len // a crossing costs ~800 px of detour
    if (sc < score) { score = sc; best = pts }
    if (score < 800 && o.length === 4) break // a clean Z near the middle is ideal
  }
  return best
}

/** SVG path through orthogonal points with rounded corners. */
export function roundedPath(pts: Pt[], r = 6): string {
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1]
    const r1 = Math.min(r, Math.abs(b.x - a.x + b.y - a.y) / 2, Math.abs(c.x - b.x + c.y - b.y) / 2)
    const p1 = { x: b.x - Math.sign(b.x - a.x) * r1, y: b.y - Math.sign(b.y - a.y) * r1 }
    const p2 = { x: b.x + Math.sign(c.x - b.x) * r1, y: b.y + Math.sign(c.y - b.y) * r1 }
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  const z = pts[pts.length - 1]
  return `${d} L ${z.x} ${z.y}`
}

/** Label spot: middle of the longest segment that doesn't sit on top of a device. */
export function labelPoint(pts: Pt[], rects: Rect[]): Pt {
  const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, len: Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y) })).sort((x, y) => y.len - x.len)
  for (const s of segs) {
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const q = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f }
      if (!rects.some((r) => q.x > r.x0 + CLEAR && q.x < r.x1 - CLEAR && q.y > r.y0 + CLEAR && q.y < r.y1 - CLEAR)) return q
    }
  }
  const s = segs[0]
  return { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
}


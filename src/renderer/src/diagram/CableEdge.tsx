import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Position, useStore as useFlowStore, type Edge, type EdgeProps, type ReactFlowState } from '@xyflow/react'

export type CableEdgeData = { label: string; color: string; dashed: boolean; lane: number; onSelect?: () => void }
export type CableEdgeType = Edge<CableEdgeData, 'cable'>

interface Rect { x0: number; y0: number; x1: number; y1: number }
type Pt = { x: number; y: number }

const GAP = 18     // how far a wire leaves a port before turning
const CLEAR = 10   // keep-out margin around devices
const STEP = 8     // search step for a free lane

/** Device rectangles (not group frames) from React Flow's live, mid-drag positions. */
const obstaclesOf = (s: ReactFlowState): Rect[] => {
  const out: Rect[] = []
  for (const n of s.nodeLookup.values()) {
    if (n.type !== 'device') continue
    const p = n.internals.positionAbsolute
    const w = n.measured?.width ?? 0, h = n.measured?.height ?? 0
    out.push({ x0: p.x - CLEAR, y0: p.y - CLEAR, x1: p.x + w + CLEAR, y1: p.y + h + CLEAR })
  }
  return out
}
// Shallow-equal so edges only re-route when a device actually moves or resizes.
const sameRects = (a: Rect[], b: Rect[]) => a.length === b.length && a.every((r, i) => r.x0 === b[i].x0 && r.y0 === b[i].y0 && r.x1 === b[i].x1 && r.y1 === b[i].y1)

const hitsH = (y: number, xa: number, xb: number, r: Rect) => y > r.y0 && y < r.y1 && Math.max(xa, xb) > r.x0 && Math.min(xa, xb) < r.x1
const hitsV = (x: number, ya: number, yb: number, r: Rect) => x > r.x0 && x < r.x1 && Math.max(ya, yb) > r.y0 && Math.min(ya, yb) < r.y1

/** Number of device crossings for a polyline. The source/target devices are skipped for the stubs. */
function crossings(pts: Pt[], rects: Rect[], ends: Rect[]): number {
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
function route(s: Pt, sDir: number, t: Pt, tDir: number, rects: Rect[], lane: number): Pt[] {
  const ends = rects.filter((r) => (s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1) || (t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1))
  const sx = s.x + sDir * GAP, tx = t.x + tDir * GAP
  const spread = ((lane % 9) - 4) * 3 // keeps parallel wires from stacking exactly
  const options: Pt[][] = []
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
function roundedPath(pts: Pt[], r = 6): string {
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
function labelPoint(pts: Pt[], rects: Rect[]): Pt {
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

const dirOf = (p: Position) => (p === Position.Left ? -1 : 1)

/**
 * A cable on the wiring diagram: re-routes live around devices as you drag them,
 * and its label is drawn in a layer above every device so it's never hidden.
 */
export const CableEdge = memo(function CableEdge(props: EdgeProps<CableEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props
  const rects = useFlowStore(obstaclesOf, sameRects)
  const pts = route({ x: sourceX, y: sourceY }, dirOf(sourcePosition), { x: targetX, y: targetY }, dirOf(targetPosition), rects, data?.lane ?? 0)
  const path = roundedPath(pts)
  const lp = labelPoint(pts, rects)
  const color = data?.color ?? '#888'
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={14}
        style={{ stroke: color, strokeWidth: selected ? 3 : 1.6, strokeDasharray: data?.dashed ? '6 3' : undefined }} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div className={`cable-label nodrag nopan ${selected ? 'selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${lp.x}px, ${lp.y}px)`, borderColor: color, color: selected ? '#fff' : undefined, background: selected ? color : undefined }}
            onClick={(e) => { e.stopPropagation(); data.onSelect?.() }} title="Select cable">
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

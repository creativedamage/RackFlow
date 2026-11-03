// Orthogonal wire routing shared by the on-screen diagram and printed drawings.

export interface Rect { id: string; x0: number; y0: number; x1: number; y1: number }
export type Pt = { x: number; y: number }

export const WIRE_GAP = 26    // how far a wire leaves a port before turning
export const WIRE_CLEAR = 14  // keep-out margin around devices
const GAP = WIRE_GAP
const STEP = 12                // search step for a free lane
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
  const spread = 0 * lane // parallel wires are pulled apart afterwards by nudgeWires
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
  // Nothing simple gets through cleanly: search a path around the devices.
  if (score >= 800) {
    const around = routeAround(s, sDir, t, tDir, rects)
    if (around) {
      const len = around.slice(1).reduce((t2, p, i) => t2 + Math.abs(p.x - around[i].x) + Math.abs(p.y - around[i].y), 0)
      if (crossings(around, rects, ends) * 800 + len < score) return around
    }
  }
  return best
}

/**
 * Shortest orthogonal path between two ports that never enters a device
 * (fewest bends among equals). Runs on a sparse grid of lines through the
 * device edges and the gaps between them, so it hugs the open channels.
 */
export function routeAround(s: Pt, sDir: number, t: Pt, tDir: number, rects: Rect[], tight = false): Pt[] | null {
  const a = { x: s.x + sDir * GAP, y: s.y }, z = { x: t.x + tDir * GAP, y: t.y }
  const inR = (p: Pt, r: Rect) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1
  const inside = (p: Pt) => rects.some((r) => inR(p, r))
  if (inside(a) || inside(z)) {
    // Devices packed tighter than the keep-out margin: route against their bodies instead.
    // Still boxed in (devices overlap each other): ignore the ones the wire has to start or end inside.
    if (tight) return routeAround(s, sDir, t, tDir, rects.filter((r) => !inR(a, r) && !inR(z, r)), true)
    const m = CLEAR - 3
    return routeAround(s, sDir, t, tDir, rects.map((r) => ({ ...r, x0: r.x0 + m, y0: r.y0 + m, x1: r.x1 - m, y1: r.y1 - m })), true)
  }
  const lines = (keys: number[], extra: number[]) => {
    const e = [...new Set(keys.map((v) => Math.round(v)))].sort((p, q) => p - q)
    const mids = e.slice(1).map((v, i) => (v + e[i]) / 2)
    return [...new Set([...e, ...mids, ...extra].map((v) => Math.round(v * 2) / 2))].sort((p, q) => p - q)
  }
  const ex = rects.flatMap((r) => [r.x0 - 2, r.x1 + 2]), ey = rects.flatMap((r) => [r.y0 - 2, r.y1 + 2])
  const xs = lines(ex, [a.x, z.x, Math.min(a.x, z.x, ...ex) - 30, Math.max(a.x, z.x, ...ex) + 30])
  const ys = lines(ey, [a.y, z.y, Math.min(a.y, z.y, ...ey) - 30, Math.max(a.y, z.y, ...ey) + 30])
  const W = xs.length, H = ys.length
  if (W * H > 40000) return null
  const ok = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = inside({ x: xs[i], y: ys[j] }) ? 0 : 1
  const si = xs.indexOf(Math.round(a.x * 2) / 2), sj = ys.indexOf(Math.round(a.y * 2) / 2)
  const ti = xs.indexOf(Math.round(z.x * 2) / 2), tj = ys.indexOf(Math.round(z.y * 2) / 2)
  if (si < 0 || sj < 0 || ti < 0 || tj < 0) return null
  const BEND = 40
  // state = node * 2 + (0 horizontal, 1 vertical)
  const N = W * H * 2, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1)
  const heap: [number, number][] = []
  const push = (d: number, st: number) => {
    heap.push([d, st]); let k = heap.length - 1
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p }
  }
  const pop = () => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m } }
    return top
  }
  const start = (sj * W + si) * 2
  dist[start] = 0; push(0, start)
  const goal = (tj * W + ti) * 2
  while (heap.length) {
    const [d, st] = pop()
    if (d > dist[st]) continue
    if (st === goal) break
    const node = st >> 1, vert = st & 1, i = node % W, j = (node - i) / W
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || !ok[nj * W + ni]) continue
      const nv = dj !== 0 ? 1 : 0
      const blocked = nv ? rects.some((r) => hitsV(xs[i], ys[j], ys[nj], r)) : rects.some((r) => hitsH(ys[j], xs[i], xs[ni], r))
      if (blocked) continue
      const nd = d + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nv !== vert ? BEND : 0)
      const ns = (nj * W + ni) * 2 + nv
      if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = st; push(nd, ns) }
    }
  }
  // Arriving vertically costs one more bend (the last leg into the port is horizontal).
  const end = dist[goal] <= dist[goal + 1] + BEND ? goal : goal + 1
  if (!isFinite(dist[end])) return null
  const path: Pt[] = []
  for (let st = end; st >= 0; st = prev[st]) { const node = st >> 1, i = node % W; path.push({ x: xs[i], y: ys[(node - i) / W] }) }
  path.reverse()
  return simplifyPath([s, ...path, t])
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


/** Drops repeated points and points in the middle of a straight run. */
export function simplifyPath(pts: Pt[]): Pt[] {
  const a = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
  return a.filter((q, i) => i === 0 || i === a.length - 1 || !((a[i - 1].x === q.x && q.x === a[i + 1].x) || (a[i - 1].y === q.y && q.y === a[i + 1].y)))
}

export const WIRE_NUDGE = 10  // distance between parallel wires sharing a run

interface Seg { id: string; i: number; c: number; lo: number; hi: number; vin: number; vout: number; sin: number; sout: number; min: number; max: number }

/**
 * Separates wires that run on top of each other. Every inner segment (one that
 * doesn't start at a port) that shares its line with another wire's segment is
 * moved onto its own parallel track, WIRE_NUDGE apart, ordered so the bundle
 * crosses itself as little as possible. Port stubs never move, and a track is
 * never pushed back into the device its wire comes out of.
 */
export function nudgeWires(paths: Map<string, Pt[]>, spacing = WIRE_NUDGE, margin = 12, rects: Rect[] = []): Map<string, Pt[]> {
  const P = new Map<string, Pt[]>()
  for (const [id, pts] of paths) P.set(id, simplifyPath(pts).map((p) => ({ ...p })))
  for (const vertical of [true, false]) {
    const C = (p: Pt) => (vertical ? p.x : p.y), V = (p: Pt) => (vertical ? p.y : p.x)
    for (let pass = 0; pass < 3; pass++) {
      const segs: Seg[] = []
      for (const [id, pts] of P) {
        for (let i = 1; i < pts.length - 2; i++) {
          const a = pts[i], b = pts[i + 1]
          if (C(a) !== C(b) || V(a) === V(b)) continue
          const c = C(a)
          let min = -Infinity, max = Infinity
          // Keep clear of the port this wire leaves from / arrives at.
          for (const [port, k] of [[pts[0], i - 1], [pts[pts.length - 1], i + 2]] as const) {
            if (k !== 0 && k !== pts.length - 1) continue
            if (c > C(port)) min = Math.max(min, C(port) + margin); else max = Math.min(max, C(port) - margin)
          }
          // ...and out of every device beside the run.
          const lo0 = Math.min(V(a), V(b)), hi0 = Math.max(V(a), V(b))
          for (const r of rects) {
            // Tracks may use most of the keep-out margin, but never touch the device itself.
            const k = CLEAR - 5
            const [r0, r1, s0, s1] = vertical ? [r.x0 + k, r.x1 - k, r.y0 + k, r.y1 - k] : [r.y0 + k, r.y1 - k, r.x0 + k, r.x1 - k]
            if (s1 <= lo0 || s0 >= hi0) continue
            if (r1 <= c + 0.5) min = Math.max(min, r1)
            else if (r0 >= c - 0.5) max = Math.min(max, r0)
          }
          segs.push({ id, i, c, lo: Math.min(V(a), V(b)), hi: Math.max(V(a), V(b)), vin: V(a), vout: V(b), sin: Math.sign(C(pts[i - 1]) - c), sout: Math.sign(C(pts[i + 2]) - c), min, max })
        }
      }
      segs.sort((a, b) => a.c - b.c)
      // Clusters: segments closer than one track apart whose runs overlap.
      const parent = segs.map((_, k) => k)
      const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])))
      for (let a = 0; a < segs.length; a++) for (let b = a + 1; b < segs.length && segs[b].c - segs[a].c < spacing - 0.5; b++) {
        const s = segs[a], t = segs[b]
        if (s.id !== t.id && s.lo < t.hi + 2 && t.lo < s.hi + 2) parent[find(a)] = find(b)
      }
      const clusters = new Map<number, Seg[]>()
      segs.forEach((s, k) => { const r = find(k); clusters.set(r, [...(clusters.get(r) ?? []), s]) })
      let moved = false
      for (const cl of clusters.values()) {
        if (cl.length < 2) continue
        // Crossings when a sits before (left of / above) b.
        const within = (v: number, s: Seg) => v > s.lo + 0.5 && v < s.hi - 0.5
        const cross = (a: Seg, b: Seg) => (a.sin > 0 && within(a.vin, b) ? 1 : 0) + (a.sout > 0 && within(a.vout, b) ? 1 : 0) + (b.sin < 0 && within(b.vin, a) ? 1 : 0) + (b.sout < 0 && within(b.vout, a) ? 1 : 0)
        const order: Seg[] = []
        for (const s of [...cl].sort((a, b) => a.c - b.c || a.vin - b.vin)) {
          let at = order.length
          // Slide left while that removes crossings.
          while (at > 0 && cross(s, order[at - 1]) < cross(order[at - 1], s)) at--
          order.splice(at, 0, s)
        }
        const mean = cl.reduce((t, s) => t + s.c, 0) / cl.length
        let cs = order.map((_, k) => mean + (k - (order.length - 1) / 2) * spacing)
        const shift = Math.max(0, ...order.map((s, k) => s.min - cs[k]))
        const back = Math.min(0, ...order.map((s, k) => s.max - (cs[k] + shift)))
        cs = cs.map((c, k) => Math.min(order[k].max, Math.max(order[k].min, c + shift + back)))
        order.forEach((s, k) => {
          const pts = P.get(s.id)!, c = Math.round(cs[k] * 2) / 2
          if (c === s.c) return
          moved = true
          if (vertical) { pts[s.i].x = c; pts[s.i + 1].x = c } else { pts[s.i].y = c; pts[s.i + 1].y = c }
        })
      }
      if (!moved) break
    }
  }
  return P
}

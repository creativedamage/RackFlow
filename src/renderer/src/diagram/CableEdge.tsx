import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Position, useStore as useFlowStore, type Edge, type EdgeProps, type ReactFlowState } from '@xyflow/react'
import { crossings, detourBudget, labelPoint, nudgeWires, planChannels, roundedPath, route, WIRE_CLEAR, type ChannelWire, type EquipmentInstance, type Pt, type Rect, type WireMode } from '@core/index'
import { nodeGeom } from './tidy'

export type CableEdgeData = {
  label: string; color: string; casing?: boolean; dashed: boolean; lane: number; onSelect?: () => void
  mode?: WireMode
  /** Stub labels: where the far end goes ("VSW-001 · Input 3"). */
  toText?: string; fromText?: string
  /** Far-end parts for grouped stubs: port label, and "TAG · Maker Model" for the group tag. */
  toPort?: string; fromPort?: string; toName?: string; fromName?: string
}
export type CableEdgeType = Edge<CableEdgeData, 'cable'>

const CLEAR = WIRE_CLEAR
const STUB = 34
const SMART_LEN = 1400

/** Device rectangles (not group frames) from React Flow's live, mid-drag positions. */
// Every wire asks for the device rectangles on every store change: work them out once per change.
let obs: { nodes: unknown; lookup: unknown; rects: Rect[] } | null = null
const obstaclesOf = (s: ReactFlowState): Rect[] => {
  if (obs && obs.nodes === s.nodes && obs.lookup === s.nodeLookup) return obs.rects
  const rects = computeObstacles(s)
  obs = { nodes: s.nodes, lookup: s.nodeLookup, rects }
  return rects
}
function computeObstacles(s: ReactFlowState): Rect[] {
  const out: Rect[] = []
  for (const n of s.nodeLookup.values()) {
    if (n.type !== 'device' || n.hidden) continue
    const p = n.internals.positionAbsolute
    const w = n.measured?.width ?? 0, h = n.measured?.height ?? 0
    out.push({ id: n.id, x0: p.x - CLEAR, y0: p.y - CLEAR, x1: p.x + w + CLEAR, y1: p.y + h + CLEAR })
  }
  return out
}
// Shallow-equal so edges only re-route when a device actually moves or resizes.
const sameRects = (a: Rect[], b: Rect[]) => a.length === b.length && a.every((r, i) => r.id === b[i].id && r.x0 === b[i].x0 && r.y0 === b[i].y0 && r.x1 === b[i].x1 && r.y1 === b[i].y1)

interface EndInfo { x: number; y: number; dir: number; device: string; far: string }
/** A bundle of stubs from one device side to the same far device. */
export interface StubGroup { key: string; ids: string[]; ys: number[]; x: number; dir: number; leader: string; /** Bracket x. */ bx: number; /** Where the device-name tag sits (its leader runs out from the bracket at `ty`). */ tx: number; ty: number }
interface Plan { channel: Map<string, number>; stub: Map<string, boolean>; groups: Map<string, StubGroup>; labels: Map<string, Pt>; paths: Map<string, Pt[]> }

/**
 * One plan for every wire, rebuilt when a device moves or the wiring changes:
 * channel tracks, which wires become stubs, and stub bundles. Uses the cards
 * as drawn (so signal views with filtered ports line up).
 */
let cache: { rects: Rect[]; edges: unknown; sel: string; nodes: unknown[]; plan: Plan; raw: Map<string, { key: string; pts: Pt[] }> } | null = null
function planFor(s: ReactFlowState, rects: Rect[]): Plan {
  const edges = s.edges as CableEdgeType[]
  const sel = edges.filter((e) => e.selected).map((e) => e.id).join()
  // The devices as drawn right now. The plan also has to be rebuilt when they change – a page
  // switch or a late measurement can show devices without touching the wires, and a plan made
  // before they were there left their wires without stubs until the diagram was reopened.
  const geo = new Map<string, { eq: EquipmentInstance; x: number; y: number }>()
  const nodes: unknown[] = []
  for (const n of s.nodeLookup.values()) {
    if (n.type !== 'device' || n.hidden) continue
    const eq = (n.data as { eq: EquipmentInstance }).eq
    const x = n.internals.positionAbsolute.x, y = n.internals.positionAbsolute.y
    geo.set(n.id, { eq, x, y })
    nodes.push(n.id, x, y, eq)
  }
  const sameNodes = !!cache && cache.nodes.length === nodes.length && cache.nodes.every((v, i) => v === nodes[i])
  if (cache && sameNodes && cache.edges === edges && cache.sel === sel && (cache.rects === rects || sameRects(cache.rects, rects))) return cache.plan
  const endOf = (dev: string, port: string | null | undefined, far: string): EndInfo | null => {
    const g = geo.get(dev)
    const p = g && port ? nodeGeom(g.eq).port(port) : null
    return g && p ? { x: g.x + p.x, y: g.y + p.y, dir: p.side === 'left' ? -1 : 1, device: dev, far } : null
  }
  const ends = new Map<string, [EndInfo, EndInfo]>()
  const wires: ChannelWire[] = []
  for (const e of edges) {
    const A = endOf(e.source, e.sourceHandle, e.target), B = endOf(e.target, e.targetHandle, e.source)
    if (!A || !B) continue
    ends.set(e.id, [A, B])
    const ra = geo.get(e.source)!, rb = geo.get(e.target)!
    const right = (g: typeof ra) => g.x + nodeGeom(g.eq).width
    if (A.dir > 0 && B.dir < 0 && B.x > A.x) wires.push({ id: e.id, sx: A.x, sy: A.y, tx: B.x, ty: B.y, sourceRight: right(ra) })
    else if (B.dir > 0 && A.dir < 0 && A.x > B.x) wires.push({ id: e.id, sx: B.x, sy: B.y, tx: A.x, ty: A.y, sourceRight: right(rb) })
  }
  const channel = planChannels(wires)
  // While a device is being dragged only its own wires re-route (everything else keeps its path),
  // and detours around devices wait until it's dropped – dragging stays smooth on big drawings.
  const moving = new Set<string>()
  for (const n of s.nodeLookup.values()) if (n.dragging) moving.add(n.id)
  detourBudget(moving.size ? 0 : 400)
  const prevRaw = cache?.raw
  const rawRoutes = new Map<string, { key: string; pts: Pt[] }>()
  const routeOf = (e: CableEdgeType, A: EndInfo, B: EndInfo) => {
    const done = rawRoutes.get(e.id)
    if (done) return done.pts
    const key = `${A.x},${A.y},${A.dir},${B.x},${B.y},${B.dir},${channel.get(e.id) ?? ''}`
    const old = prevRaw?.get(e.id)
    const pts = old && moving.size && !moving.has(A.device) && !moving.has(B.device) && old.key === key ? old.pts : route(A, A.dir, B, B.dir, rects, e.data?.lane ?? 0, channel.get(e.id))
    rawRoutes.set(e.id, { key, pts })
    return pts
  }
  // Which wires are stubs.
  const stub = new Map<string, boolean>()
  for (const e of edges) {
    const en = ends.get(e.id)
    const mode = e.data?.mode ?? 'all'
    if (!en || e.selected || mode === 'all') { stub.set(e.id, false); continue }
    if (mode === 'stubs') { stub.set(e.id, true); continue }
    const [A, B] = en
    const pts = routeOf(e, A, B)
    const len = pts.slice(1).reduce((t, p, i) => t + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0)
    const endRects = rects.filter((r) => r.id === A.device || r.id === B.device)
    stub.set(e.id, len > SMART_LEN || crossings(pts, rects, endRects) > 0)
  }
  // Bundles: wires leaving one side of a device for the same far device.
  const byKey = new Map<string, { id: string; end: EndInfo; text: string }[]>()
  for (const e of edges) {
    const en = ends.get(e.id)
    if (!en || e.selected) continue
    en.forEach((end, i) => {
      const key = `${end.device}|${end.dir}|${end.far}`
      const text = `${e.data?.label ?? ''} ${(i === 0 ? e.data?.toPort : e.data?.fromPort) ?? ''}`
      byKey.set(key, [...(byKey.get(key) ?? []), { id: e.id, end, text }])
    })
  }
  // Smart mode: if part of a bundle became stubs, the rest of it does too, so they read as one group.
  for (const ms of byKey.values()) if (ms.length > 1 && ms.some((m) => stub.get(m.id))) for (const m of ms) stub.set(m.id, true)
  const groups = new Map<string, StubGroup>()
  for (const [key, all] of byKey) {
    const ms = all.filter((m) => stub.get(m.id))
    if (ms.length < 2) continue
    ms.sort((a, b) => a.end.y - b.end.y)
    const width = Math.max(70, ...ms.map((m) => tagW(m.text)))
    const bx = ms[0].end.x + ms[0].end.dir * (STUB + width + 14)
    const g: StubGroup = { key, ids: ms.map((m) => m.id), ys: ms.map((m) => m.end.y), x: ms[0].end.x, dir: ms[0].end.dir, leader: ms[0].id, bx, tx: bx + ms[0].end.dir * 22, ty: (ms[0].end.y + ms[ms.length - 1].end.y) / 2 }
    for (const m of ms) groups.set(`${m.id}|${m.end.device}|${m.end.dir}`, g)
  }
  // Bundles on the same side of a device never sit on top of each other: brackets whose
  // spans overlap get their own column, and the device-name tags stack without touching.
  const sides = new Map<string, StubGroup[]>()
  for (const g of new Set(groups.values())) { const k = `${g.key.split('|')[0]}|${g.dir}`; sides.set(k, [...(sides.get(k) ?? []), g]) }
  for (const gs of sides.values()) {
    if (gs.length < 2) continue
    const dir = gs[0].dir, x = gs[0].x
    const reach = Math.max(...gs.map((g) => (g.bx - g.x) * dir))
    gs.sort((a, b) => Math.min(...a.ys) - Math.min(...b.ys))
    const colEnd: number[] = []
    for (const g of gs) {
      const y0 = Math.min(...g.ys), y1 = Math.max(...g.ys)
      let col = colEnd.findIndex((e) => e + 10 < y0)
      if (col < 0) { col = colEnd.length; colEnd.push(y1) } else colEnd[col] = y1
      g.bx = x + dir * (reach + col * 14)
    }
    const tx = x + dir * (reach + (colEnd.length - 1) * 14 + 22)
    const TAG = 34
    let last = -Infinity
    for (const g of [...gs].sort((a, b) => (Math.min(...a.ys) + Math.max(...a.ys)) - (Math.min(...b.ys) + Math.max(...b.ys)))) {
      const ty = Math.max((Math.min(...g.ys) + Math.max(...g.ys)) / 2, last + TAG)
      g.ty = ty; g.tx = tx; last = ty
    }
  }
  // Full wires: route each, then pull apart any that share a run so none sit on top of each other.
  const raw = new Map<string, Pt[]>()
  for (const e of edges) {
    const en = ends.get(e.id)
    if (!en || stub.get(e.id)) continue
    const [A, B] = en
    raw.set(e.id, routeOf(e, A, B))
  }
  const paths = nudgeWires(raw, undefined, undefined, rects)
  // Cable-number labels: spread along each wire so labels on parallel runs never sit on top of each other.
  const labels = new Map<string, Pt>()
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
  const free = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    !placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) &&
    !rects.some((r) => b.x0 < r.x1 - CLEAR && b.x1 > r.x0 + CLEAR && b.y0 < r.y1 - CLEAR && b.y1 > r.y0 + CLEAR)
  const order = [...edges].filter((e) => ends.has(e.id) && !stub.get(e.id) && e.data?.label).sort((a, b) => (a.data!.label).localeCompare(b.data!.label, undefined, { numeric: true }))
  for (const e of order) {
    const [A, B] = ends.get(e.id)!
    const pts = paths.get(e.id) ?? routeOf(e, A, B)
    const w = e.data!.label.length * 6 + 14, h = 15
    const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, len: Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y) })).filter((s) => s.len > 4).sort((x, y) => y.len - x.len)
    let best: Pt | null = null
    search: for (const s of segs) for (const f of [0.5, 0.35, 0.65, 0.22, 0.78, 0.12, 0.88, 0.42, 0.58, 0.3, 0.7]) {
      const q = { x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f }
      const box = { x0: q.x - w / 2 - 3, y0: q.y - h / 2 - 2, x1: q.x + w / 2 + 3, y1: q.y + h / 2 + 2 }
      if (free(box)) { best = q; placed.push(box); break search }
    }
    if (!best) { best = labelPoint(pts, rects); placed.push({ x0: best.x - w / 2, y0: best.y - h / 2, x1: best.x + w / 2, y1: best.y + h / 2 }) }
    labels.set(e.id, best)
  }
  const plan = { channel, stub, groups, labels, paths }
  cache = { rects, edges, sel, nodes, plan, raw: rawRoutes }
  return plan
}

/** The planned path, pinned exactly onto React Flow's handle points (they can differ by a pixel). */
function fitEnds(planned: Pt[] | undefined, s: Pt, t: Pt): Pt[] | null {
  if (!planned || planned.length < 2) return null
  const a = planned[0], z = planned[planned.length - 1]
  if (Math.abs(a.x - s.x) > 4 || Math.abs(a.y - s.y) > 4 || Math.abs(z.x - t.x) > 4 || Math.abs(z.y - t.y) > 4) return null
  const pts = planned.map((p) => ({ ...p }))
  const n = pts.length
  if (n > 2 && pts[1].y === a.y) pts[1].y = s.y
  if (n > 2 && pts[n - 2].y === z.y) pts[n - 2].y = t.y
  pts[0] = s; pts[n - 1] = t
  return pts
}

const dirOf = (p: Position) => (p === Position.Left ? -1 : 1)
/** Rough width of a stub tag (monospace 9.5px + padding). */
const tagW = (s: string) => s.length * 6 + 16

/**
 * A cable on the wiring diagram: re-routes live around devices as you drag them,
 * and its label is drawn in a layer above every device so it's never hidden.
 * As a stub, several wires to the same device are bundled under one tag naming it.
 */
export const CableEdge = memo(function CableEdge(props: EdgeProps<CableEdgeType>) {
  const { id, source, target, sourcePosition, targetPosition, selected, data } = props
  // React Flow hands back measured positions like 4811.0001 – snap them so wires stay square.
  const snap = (v: number) => Math.round(v * 2) / 2
  const sourceX = snap(props.sourceX), sourceY = snap(props.sourceY), targetX = snap(props.targetX), targetY = snap(props.targetY)
  const rects = useFlowStore(obstaclesOf, sameRects)
  const plan = useFlowStore((s) => planFor(s, rects))
  const channel = plan.channel.get(id)
  const sDir = dirOf(sourcePosition), tDir = dirOf(targetPosition)
  const color = data?.color ?? '#888'
  // White / black jackets get a hairline outline so they stay visible on the page.
  const stroke = { stroke: color, strokeWidth: selected ? 3 : 1.6, strokeDasharray: data?.dashed ? '6 3' : undefined, filter: data?.casing ? 'drop-shadow(0 0 0.7px rgba(120,120,128,0.95))' : undefined }
  if (plan.stub.get(id) && !selected) {
    const end = (x: number, y: number, dir: number, device: string, text: string | undefined, port: string | undefined, name: string | undefined, key: string) => {
      const g = plan.groups.get(`${id}|${device}|${dir}`)
      const select = (e: React.MouseEvent) => { e.stopPropagation(); data?.onSelect?.() }
      if (!g) {
        const p = { x: x + dir * STUB, y }
        return (
          <g key={key}>
            <BaseEdge id={`${id}:${key}`} path={`M ${x} ${y} L ${p.x} ${p.y}`} interactionWidth={10} style={stroke} />
            <EdgeLabelRenderer>
              <div className={`cable-stub nodrag nopan ${dir < 0 ? 'left' : 'right'}`}
                style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${p.x}px, ${p.y}px)`, borderColor: color }}
                onClick={select} title={`${data?.label ?? ''} → ${text ?? ''}\nClick to select · the full wire shows while selected`}>
                <b style={{ color }}>{data?.label}</b>{text && <span>{dir < 0 ? '◂ ' : ''}{text}{dir < 0 ? '' : ' ▸'}</span>}
              </div>
            </EdgeLabelRenderer>
          </g>
        )
      }
      // Bundled: short stub + "label · port" tag, all reaching one bracket, then one tag naming the device.
      const bx = g.bx
      const p = { x: x + dir * STUB, y }
      const ty = g.ty, y0 = Math.min(...g.ys, ty), y1 = Math.max(...g.ys, ty)
      return (
        <g key={key}>
          <BaseEdge id={`${id}:${key}`} path={`M ${x} ${y} L ${bx} ${y}`} interactionWidth={10} style={stroke} />
          {g.leader === id && <path d={`M ${bx} ${y0} L ${bx} ${y1} M ${bx} ${ty} L ${g.tx} ${ty}`} fill="none" stroke="var(--text-2)" strokeWidth={1.6} />}
          <EdgeLabelRenderer>
            <div className={`cable-stub nodrag nopan grouped ${dir < 0 ? 'left' : 'right'}`}
              style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${p.x}px, ${p.y}px)`, borderColor: color }}
              onClick={select} title={`${data?.label ?? ''} → ${text ?? ''}\nClick to select · the full wire shows while selected`}>
              <b style={{ color }}>{data?.label}</b>{port && <span>{port}</span>}
            </div>
            {g.leader === id && (
              <div className={`cable-stub-group nodrag nopan ${dir < 0 ? 'left' : 'right'}`}
                style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${g.tx}px, ${ty}px)` }}
                title={`${g.ids.length} wires to ${name ?? ''}`}>
                {dir < 0 ? '◂ ' : ''}{name}{dir < 0 ? '' : ' ▸'} <span>×{g.ids.length}</span>
              </div>
            )}
          </EdgeLabelRenderer>
        </g>
      )
    }
    return (
      <>
        {end(sourceX, sourceY, sDir, source, data?.toText, data?.toPort, data?.toName, 'a')}
        {end(targetX, targetY, tDir, target, data?.fromText, data?.fromPort, data?.fromName, 'b')}
      </>
    )
  }
  const pts = fitEnds(plan.paths.get(id), { x: sourceX, y: sourceY }, { x: targetX, y: targetY })
    ?? (detourBudget(0), route({ x: sourceX, y: sourceY }, sDir, { x: targetX, y: targetY }, tDir, rects, data?.lane ?? 0, channel))
  const path = roundedPath(pts)
  const lp = plan.labels.get(id) ?? labelPoint(pts, rects)
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={14} style={stroke} />
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

export type { Pt }

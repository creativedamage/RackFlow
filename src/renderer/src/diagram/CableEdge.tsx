import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Position, useStore as useFlowStore, type Edge, type EdgeProps, type ReactFlowState } from '@xyflow/react'
import { crossings, labelPoint, planChannels, roundedPath, route, WIRE_CLEAR, type ChannelWire, type EquipmentInstance, type Pt, type Rect, type WireMode } from '@core/index'
import { nodeGeom } from './tidy'

export type CableEdgeData = {
  label: string; color: string; dashed: boolean; lane: number; onSelect?: () => void
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
const obstaclesOf = (s: ReactFlowState): Rect[] => {
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
export interface StubGroup { key: string; ids: string[]; ys: number[]; x: number; dir: number; leader: string; /** Bracket x. */ bx: number }
interface Plan { channel: Map<string, number>; stub: Map<string, boolean>; groups: Map<string, StubGroup>; labels: Map<string, Pt> }

/**
 * One plan for every wire, rebuilt when a device moves or the wiring changes:
 * channel tracks, which wires become stubs, and stub bundles. Uses the cards
 * as drawn (so signal views with filtered ports line up).
 */
let cache: { rects: Rect[]; edges: unknown; sel: string; plan: Plan } | null = null
function planFor(s: ReactFlowState, rects: Rect[]): Plan {
  const edges = s.edges as CableEdgeType[]
  const sel = edges.filter((e) => e.selected).map((e) => e.id).join()
  if (cache && cache.edges === edges && cache.sel === sel && (cache.rects === rects || sameRects(cache.rects, rects))) return cache.plan
  const geo = new Map<string, { eq: EquipmentInstance; x: number; y: number }>()
  for (const n of s.nodeLookup.values()) {
    if (n.type !== 'device' || n.hidden) continue
    const eq = (n.data as { eq: EquipmentInstance }).eq
    geo.set(n.id, { eq, x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y })
  }
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
  // Which wires are stubs.
  const stub = new Map<string, boolean>()
  for (const e of edges) {
    const en = ends.get(e.id)
    const mode = e.data?.mode ?? 'all'
    if (!en || e.selected || mode === 'all') { stub.set(e.id, false); continue }
    if (mode === 'stubs') { stub.set(e.id, true); continue }
    const [A, B] = en
    const pts = route(A, A.dir, B, B.dir, rects, e.data?.lane ?? 0, channel.get(e.id))
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
    const g: StubGroup = { key, ids: ms.map((m) => m.id), ys: ms.map((m) => m.end.y), x: ms[0].end.x, dir: ms[0].end.dir, leader: ms[0].id, bx: ms[0].end.x + ms[0].end.dir * (STUB + width + 14) }
    for (const m of ms) groups.set(`${m.id}|${m.end.device}|${m.end.dir}`, g)
  }
  // Cable-number labels: spread along each wire so labels on parallel runs never sit on top of each other.
  const labels = new Map<string, Pt>()
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
  const free = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    !placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0) &&
    !rects.some((r) => b.x0 < r.x1 - CLEAR && b.x1 > r.x0 + CLEAR && b.y0 < r.y1 - CLEAR && b.y1 > r.y0 + CLEAR)
  const order = [...edges].filter((e) => ends.has(e.id) && !stub.get(e.id) && e.data?.label).sort((a, b) => (a.data!.label).localeCompare(b.data!.label, undefined, { numeric: true }))
  for (const e of order) {
    const [A, B] = ends.get(e.id)!
    const raw = route(A, A.dir, B, B.dir, rects, e.data?.lane ?? 0, channel.get(e.id))
    // Merge straight-through points so a straight wire is one segment (labels line up neatly).
    const pts = raw.filter((q, i) => i === 0 || i === raw.length - 1 || !((raw[i - 1].x === q.x && q.x === raw[i + 1].x) || (raw[i - 1].y === q.y && q.y === raw[i + 1].y)))
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
  const plan = { channel, stub, groups, labels }
  cache = { rects, edges, sel, plan }
  return plan
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
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props
  const rects = useFlowStore(obstaclesOf, sameRects)
  const plan = useFlowStore((s) => planFor(s, rects))
  const channel = plan.channel.get(id)
  const sDir = dirOf(sourcePosition), tDir = dirOf(targetPosition)
  const color = data?.color ?? '#888'
  const stroke = { stroke: color, strokeWidth: selected ? 3 : 1.6, strokeDasharray: data?.dashed ? '6 3' : undefined }
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
      const y0 = Math.min(...g.ys), y1 = Math.max(...g.ys), ym = (y0 + y1) / 2
      return (
        <g key={key}>
          <BaseEdge id={`${id}:${key}`} path={`M ${x} ${y} L ${bx} ${y}`} interactionWidth={10} style={stroke} />
          {g.leader === id && <path d={`M ${bx} ${y0} L ${bx} ${y1} M ${bx} ${ym} L ${bx + dir * 22} ${ym}`} fill="none" stroke="var(--text-2)" strokeWidth={1.6} />}
          <EdgeLabelRenderer>
            <div className={`cable-stub nodrag nopan grouped ${dir < 0 ? 'left' : 'right'}`}
              style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${p.x}px, ${p.y}px)`, borderColor: color }}
              onClick={select} title={`${data?.label ?? ''} → ${text ?? ''}\nClick to select · the full wire shows while selected`}>
              <b style={{ color }}>{data?.label}</b>{port && <span>{port}</span>}
            </div>
            {g.leader === id && (
              <div className={`cable-stub-group nodrag nopan ${dir < 0 ? 'left' : 'right'}`}
                style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${bx + dir * 22}px, ${ym}px)` }}
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
  const pts = route({ x: sourceX, y: sourceY }, sDir, { x: targetX, y: targetY }, tDir, rects, data?.lane ?? 0, channel)
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

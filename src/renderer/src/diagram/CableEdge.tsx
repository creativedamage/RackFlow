import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, Position, useStore as useFlowStore, type Edge, type EdgeProps, type ReactFlowState } from '@xyflow/react'
import { crossings, labelPoint, planChannels, roundedPath, route, WIRE_CLEAR, WIRE_GAP, type ChannelWire, type Pt, type Rect, type WireMode } from '@core/index'
import { useStore } from '../store'
import { nodeGeom } from './tidy'

export type CableEdgeData = {
  label: string; color: string; dashed: boolean; lane: number; onSelect?: () => void
  mode?: WireMode
  /** Stub labels: where the far end goes ("VSW-001 · Input 3"). */
  toText?: string; fromText?: string
}
export type CableEdgeType = Edge<CableEdgeData, 'cable'>

const GAP = WIRE_GAP
const CLEAR = WIRE_CLEAR

/** Device rectangles (not group frames) from React Flow's live, mid-drag positions. */
const obstaclesOf = (s: ReactFlowState): Rect[] => {
  const out: Rect[] = []
  for (const n of s.nodeLookup.values()) {
    if (n.type !== 'device') continue
    const p = n.internals.positionAbsolute
    const w = n.measured?.width ?? 0, h = n.measured?.height ?? 0
    out.push({ id: n.id, x0: p.x - CLEAR, y0: p.y - CLEAR, x1: p.x + w + CLEAR, y1: p.y + h + CLEAR })
  }
  return out
}
// Shallow-equal so edges only re-route when a device actually moves or resizes.
const sameRects = (a: Rect[], b: Rect[]) => a.length === b.length && a.every((r, i) => r.id === b[i].id && r.x0 === b[i].x0 && r.y0 === b[i].y0 && r.x1 === b[i].x1 && r.y1 === b[i].y1)

// One channel plan shared by every edge, rebuilt when a device moves or the wiring changes.
let planCache: { rects: Rect[]; cables: unknown; plan: Map<string, number> } | null = null
function channelPlan(rects: Rect[]): Map<string, number> {
  const project = useStore.getState().project
  if (planCache && planCache.cables === project.cables && (planCache.rects === rects || sameRects(planCache.rects, rects))) return planCache.plan
  const at = new Map(rects.map((r) => [r.id, r]))
  const eqs = new Map(project.equipment.map((e) => [e.id as string, e]))
  const wires: ChannelWire[] = []
  for (const c of project.cables) {
    const ra = at.get(c.from.equipment), rb = at.get(c.to.equipment)
    const ea = eqs.get(c.from.equipment), eb = eqs.get(c.to.equipment)
    if (!ra || !rb || !ea || !eb) continue
    const pa = nodeGeom(ea).port(c.from.port), pb = nodeGeom(eb).port(c.to.port)
    if (!pa || !pb) continue
    const A = { x: ra.x0 + CLEAR + pa.x, y: ra.y0 + CLEAR + pa.y, side: pa.side, right: ra.x1 - CLEAR }
    const B = { x: rb.x0 + CLEAR + pb.x, y: rb.y0 + CLEAR + pb.y, side: pb.side, right: rb.x1 - CLEAR }
    // Normalise to "leaves a right side, enters a left side, going right".
    if (A.side === 'right' && B.side === 'left' && B.x > A.x) wires.push({ id: c.id, sx: A.x, sy: A.y, tx: B.x, ty: B.y, sourceRight: A.right })
    else if (B.side === 'right' && A.side === 'left' && A.x > B.x) wires.push({ id: c.id, sx: B.x, sy: B.y, tx: A.x, ty: A.y, sourceRight: B.right })
  }
  const plan = planChannels(wires, GAP, 7)
  planCache = { rects, cables: project.cables, plan }
  return plan
}

const dirOf = (p: Position) => (p === Position.Left ? -1 : 1)

/**
 * A cable on the wiring diagram: re-routes live around devices as you drag them,
 * and its label is drawn in a layer above every device so it's never hidden.
 */
export const CableEdge = memo(function CableEdge(props: EdgeProps<CableEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } = props
  const rects = useFlowStore(obstaclesOf, sameRects)
  const channel = channelPlan(rects).get(id)
  const sDir = dirOf(sourcePosition), tDir = dirOf(targetPosition)
  const pts = route({ x: sourceX, y: sourceY }, sDir, { x: targetX, y: targetY }, tDir, rects, data?.lane ?? 0, channel)
  const color = data?.color ?? '#888'
  const mode = data?.mode ?? 'all'
  const len = pts.slice(1).reduce((a, p, i) => a + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0)
  const ends = rects.filter((r) => (sourceX >= r.x0 && sourceX <= r.x1 && sourceY >= r.y0 && sourceY <= r.y1) || (targetX >= r.x0 && targetX <= r.x1 && targetY >= r.y0 && targetY <= r.y1))
  // Smart: long runs, or wires that can't avoid devices, become labelled stubs (selected wires always show in full).
  const stub = !selected && (mode === 'stubs' || (mode === 'smart' && (len > 1400 || crossings(pts, rects, ends) > 0)))
  const stroke = { stroke: color, strokeWidth: selected ? 3 : 1.6, strokeDasharray: data?.dashed ? '6 3' : undefined }
  if (stub) {
    const STUB = 34
    const a = { x: sourceX + sDir * STUB, y: sourceY }, b = { x: targetX + tDir * STUB, y: targetY }
    const tag = (p: Pt, dir: number, text: string | undefined, key: string) => (
      <div key={key} className={`cable-stub nodrag nopan ${dir < 0 ? 'left' : 'right'}`}
        style={{ transform: `translate(${dir < 0 ? '-100%' : '0'}, -50%) translate(${p.x}px, ${p.y}px)`, borderColor: color }}
        onClick={(e) => { e.stopPropagation(); data?.onSelect?.() }} title={`${data?.label ?? ''} → ${text ?? ''}\nClick to select · the full wire shows while selected`}>
        <b style={{ color }}>{data?.label}</b>{text && <span>{dir < 0 ? '◂ ' : ''}{text}{dir < 0 ? '' : ' ▸'}</span>}
      </div>
    )
    return (
      <>
        <BaseEdge id={`${id}:a`} path={`M ${sourceX} ${sourceY} L ${a.x} ${a.y}`} interactionWidth={10} style={stroke} />
        <BaseEdge id={`${id}:b`} path={`M ${targetX} ${targetY} L ${b.x} ${b.y}`} interactionWidth={10} style={stroke} />
        <EdgeLabelRenderer>
          {tag(a, sDir, data?.toText, 'a')}
          {tag(b, tDir, data?.fromText, 'b')}
        </EdgeLabelRenderer>
      </>
    )
  }
  const path = roundedPath(pts)
  const lp = labelPoint(pts, rects)
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

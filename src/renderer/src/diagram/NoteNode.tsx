import { memo, useEffect, useRef, useState } from 'react'
import { NodeResizer, useReactFlow, useViewport, type Node, type NodeProps } from '@xyflow/react'
import type { Annotation } from '@core/index'
import { useStore } from '../store'

export type NoteNodeData = { a: Annotation }
export type NoteNodeType = Node<NoteNodeData, 'note'>

const updateNote = (id: string, label: string, fn: (a: Annotation) => void) =>
  useStore.getState().apply(label, (d) => { const a = d.annotations?.find((x) => x.id === id); if (a) fn(a) })

/** Revision "cloud" border: scallops around the box. */
function cloudPath(w: number, h: number, r = 9) {
  const seg = (len: number) => Math.max(1, Math.round(len / (r * 2)))
  let d = `M 0 0`
  const nx = seg(w), ny = seg(h), sx = w / nx, sy = h / ny
  for (let i = 0; i < nx; i++) d += ` a ${sx / 2} ${r} 0 0 1 ${sx} 0`
  for (let i = 0; i < ny; i++) d += ` a ${r} ${sy / 2} 0 0 1 0 ${sy}`
  for (let i = 0; i < nx; i++) d += ` a ${sx / 2} ${r} 0 0 1 ${-sx} 0`
  for (let i = 0; i < ny; i++) d += ` a ${r} ${sy / 2} 0 0 1 0 ${-sy}`
  return d
}

/**
 * A note on the wiring diagram: callout (box + leader arrow you can aim),
 * plain note, or revision note (cloud + Δ revision tag). Double-click to edit
 * the text, drag the corners to resize, drag the arrow's dot to aim it.
 */
export const NoteNode = memo(function NoteNode({ data, selected, width, height, positionAbsoluteX, positionAbsoluteY }: NodeProps<NoteNodeType>) {
  const { a } = data
  // Live size / position while resizing or dragging.
  const W = width ?? a.w, H = height ?? a.h, X = positionAbsoluteX ?? a.x, Y = positionAbsoluteY ?? a.y
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(a.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { screenToFlowPosition } = useReactFlow()
  const { zoom } = useViewport()
  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select() } }, [editing])
  useEffect(() => { if (!editing) setDraft(a.text) }, [a.text, editing])
  const commit = () => { setEditing(false); if (draft !== a.text) updateNote(a.id, 'Edit Note', (x) => { x.text = draft }) }

  // Leader (callouts): from the nearest box edge to the target point.
  const lx = (a.leader?.x ?? X - 80) - X, ly = (a.leader?.y ?? Y + H + 60) - Y
  const sx = Math.min(Math.max(lx, 0), W), sy = Math.min(Math.max(ly, 0), H)
  const start = lx > 0 && lx < W && ly > 0 && ly < H ? { x: W / 2, y: H } : { x: sx, y: sy }
  const ang = Math.atan2(ly - start.y, lx - start.x)
  const head = `${lx},${ly} ${lx - 10 * Math.cos(ang - 0.4)},${ly - 10 * Math.sin(ang - 0.4)} ${lx - 10 * Math.cos(ang + 0.4)},${ly - 10 * Math.sin(ang + 0.4)}`

  const dragLeader = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault()
    const el = e.currentTarget as unknown as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      useStore.getState().set({ project: { ...useStore.getState().project, annotations: useStore.getState().project.annotations?.map((x) => (x.id === a.id ? { ...x, leader: { x: Math.round(p.x), y: Math.round(p.y) } } : x)) } })
    }
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up)
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      // Restore, then commit once (one undo step).
      useStore.getState().set({ project: { ...useStore.getState().project, annotations: useStore.getState().project.annotations?.map((x) => (x.id === a.id ? { ...x, leader: a.leader } : x)) } })
      updateNote(a.id, 'Aim Callout', (x) => { x.leader = { x: Math.round(p.x), y: Math.round(p.y) } })
    }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }

  return (
    <div className={`note-node kind-${a.kind} ${selected ? 'selected' : ''}`} style={{ width: W, height: H }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}>
      <NodeResizer isVisible={selected} minWidth={80} minHeight={40} lineClassName="note-resize-line" handleClassName="note-resize-handle"
        onResizeEnd={(_, r) => updateNote(a.id, 'Resize Note', (x) => { x.w = Math.round(r.width); x.h = Math.round(r.height); x.x = Math.round(r.x); x.y = Math.round(r.y) })} />
      {a.kind === 'revision' && (
        <svg className="note-cloud" width={W + 20} height={H + 20} style={{ left: -10, top: -10 }}>
          <path d={cloudPath(W, H)} transform="translate(10 10)" />
        </svg>
      )}
      {a.kind === 'callout' && (
        <svg className="note-leader" style={{ overflow: 'visible' }} width={1} height={1}>
          <line x1={start.x} y1={start.y} x2={lx} y2={ly} />
          <polygon points={head} />
          {selected && <circle className="note-leader-handle nodrag" cx={lx} cy={ly} r={7 / Math.max(zoom, 0.3)} onPointerDown={dragLeader}><title>Drag to aim the arrow</title></circle>}
        </svg>
      )}
      {a.kind === 'revision' && (
        <div className="note-rev" title="Revision"><span>{a.rev || '?'}</span></div>
      )}
      {editing
        ? <textarea ref={ref} className="note-edit nodrag nowheel" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setDraft(a.text); setEditing(false) } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit() }} />
        : <div className="note-text">{a.text || <span className="muted">Double-click to type…</span>}</div>}
    </div>
  )
})

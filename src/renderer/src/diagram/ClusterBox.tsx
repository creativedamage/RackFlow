import { memo, useState } from 'react'
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react'

export type ClusterBoxData = {
  id: string; name: string; color: string; count: number
  onRename: (name: string) => void
  onResized: (r: { x: number; y: number; w: number; h: number }) => void
}
export type ClusterBoxType = Node<ClusterBoxData, 'clusterBox'>

/**
 * A device group: a box you draw on the diagram. Devices dropped inside are in
 * the group. Drag the label (or the border) to move it with everything in it;
 * drag a corner to resize; double-click the label to rename.
 */
export const ClusterBox = memo(function ClusterBox({ data, selected }: NodeProps<ClusterBoxType>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.name)
  const commit = () => { setEditing(false); if (draft.trim() && draft.trim() !== data.name) data.onRename(draft.trim()) }
  return (
    <div className={`cluster-box ${selected ? 'selected' : ''}`} style={{ ['--gc' as string]: data.color }}>
      <NodeResizer minWidth={160} minHeight={100} isVisible color={data.color} handleClassName="cb-handle" lineClassName="cb-line"
        onResizeEnd={(_, p) => data.onResized({ x: p.x, y: p.y, w: p.width, h: p.height })} />
      <div className="cb-label" title="Drag to move the group and everything in it · double-click to rename · right-click for more"
        onDoubleClick={(e) => { e.stopPropagation(); setDraft(data.name); setEditing(true) }}>
        <span className="gf-dot" />
        {editing
          ? <input className="gf-input nodrag" autoFocus onFocus={(e) => e.target.select()} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} />
          : data.name}
        <span className="gf-count">{data.count}</span>
      </div>
    </div>
  )
})

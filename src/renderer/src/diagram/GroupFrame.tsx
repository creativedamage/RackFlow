import { memo, useState } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

export type GroupFrameData = {
  id: string; name: string; color: string; count: number; system: string; active: boolean
  /** 'page' = a page's frame on All pages; 'cluster' = a device group (on every page and view). */
  kind?: 'page' | 'cluster'
  onRename?: (name: string) => void
}
export type GroupFrameType = Node<GroupFrameData, 'groupFrame'>

/** A labelled, colour-coded frame drawn behind a group's devices. Drag the label to move the whole group. */
export const GroupFrame = memo(function GroupFrame({ data }: NodeProps<GroupFrameType>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.name)
  const cluster = data.kind === 'cluster'
  const commit = () => { setEditing(false); if (draft.trim() && draft.trim() !== data.name) data.onRename?.(draft.trim()) }
  return (
    <div className={`group-frame ${cluster ? 'cluster' : ''} ${data.active ? 'active' : ''}`} style={{ ['--gc' as string]: data.color }}>
      <div className="gf-label" title={cluster ? 'Drag to move the group · double-click to rename · right-click for more' : 'Drag to move the whole group · double-click to select its devices'}
        onDoubleClick={cluster ? (e) => { e.stopPropagation(); setDraft(data.name); setEditing(true) } : undefined}>
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

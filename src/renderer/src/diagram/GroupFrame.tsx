import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'

export type GroupFrameData = { id: string; name: string; color: string; count: number; system: string; active: boolean }
export type GroupFrameType = Node<GroupFrameData, 'groupFrame'>

/** A labelled, colour-coded frame drawn behind a group's devices. Drag the label to move the whole group. */
export const GroupFrame = memo(function GroupFrame({ data }: NodeProps<GroupFrameType>) {
  return (
    <div className={`group-frame ${data.active ? 'active' : ''}`} style={{ ['--gc' as string]: data.color }}>
      <div className="gf-label" title="Drag to move the whole group · double-click to select its devices">
        <span className="gf-dot" />{data.name}<span className="gf-count">{data.count}</span>
      </div>
    </div>
  )
})

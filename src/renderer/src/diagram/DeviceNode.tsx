import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { CATEGORIES, connectorName, DOMAINS, portDomain, SIGNALS, type EquipmentInstance, type PortTemplate } from '@core/index'
import { pickIndex, useWiring } from './wiring'

export const NODE_WIDTH = 240
export const HEADER_H = 40
export const ROW_H = 18

export type DeviceNodeData = { eq: EquipmentInstance; connected: Set<string>; group?: { name: string; color: string }; dim?: boolean }

/** Header height: taller when the device shows its room / location. */
export const headerHeight = (eq: EquipmentInstance) => (eq.room?.trim() ? HEADER_H + 14 : HEADER_H)
export type DeviceNodeType = Node<DeviceNodeData, 'device'>

export function splitPorts(eq: EquipmentInstance) {
  // Wall plates / floor boxes: room-side jacks on the left, tie lines and outlets on the right.
  if (eq.product.category === 'wallPlate' || eq.product.category === 'floorBox') {
    const left = eq.product.ports.filter((p) => p.face === 'front' && p.group !== 'Power')
    return { left, right: eq.product.ports.filter((p) => !left.includes(p)) }
  }
  const left = eq.product.ports.filter((p) => p.direction === 'input')
  const right = eq.product.ports.filter((p) => p.direction !== 'input')
  return { left, right }
}

/**
 * A device card: header (tag + model) and two port columns – inputs on the
 * left, outputs and bidirectional ports on the right. Circle = directional,
 * square = bidirectional; colour = signal domain. While a wire is being
 * dragged, valid targets ring green (clean) or amber (caution) and every
 * other port dims, so invalid connections can't be made.
 */
export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const { eq, connected, group, dim } = data
  const headerH = headerHeight(eq)
  const { left, right } = splitPorts(eq)
  const rows = Math.max(left.length, right.length, 1)
  const wiring = useWiring((s) => s.origin)
  const candidates = useWiring((s) => s.candidates)
  const picked = useWiring((s) => s.picked)
  const togglePick = useWiring((s) => s.togglePick)

  const state = (p: PortTemplate) => {
    if (!wiring) return ''
    if (wiring.equipment === eq.id && wiring.port === p.id) return 'origin'
    const q = candidates.get(`${eq.id}/${p.id}`)
    return q === 'clean' ? 'valid' : q === 'caution' ? 'caution' : 'invalid'
  }

  const renderPort = (p: PortTemplate, i: number, side: 'left' | 'right') => {
    const d = portDomain(p)
    const color = d ? DOMAINS[d].color : '#888'
    const top = headerH + i * ROW_H + ROW_H / 2
    const pick = pickIndex(picked, { equipment: eq.id, port: p.id })
    const title = `${p.label}\n${connectorName(p.connector)} ${p.gender} · ${p.direction}\n${p.signals.map((s) => SIGNALS[s].name).join(', ')}`
    return (
      <div key={p.id} className={`port-row ${side} ${state(p)} ${pick >= 0 ? 'picked' : ''}`} style={{ top: top - ROW_H / 2 }} title={`${title}\nShift-click to pick for patching multiples`}
        onPointerDownCapture={(e) => { if (e.shiftKey && e.button === 0) { e.stopPropagation(); e.preventDefault(); togglePick({ equipment: eq.id, port: p.id }) } }}
        onMouseDownCapture={(e) => { if (e.shiftKey) e.stopPropagation() }}
        onClickCapture={(e) => { if (e.shiftKey) e.stopPropagation() }}>
        <span className="port-label">{p.label}</span>
        {pick >= 0 && <span className="pick-badge">{pick + 1}</span>}
        <Handle
          id={p.id}
          type="source"
          position={side === 'left' ? Position.Left : Position.Right}
          className={`port-handle ${p.direction === 'bidirectional' ? 'bidi' : ''} ${connected.has(p.id) ? 'linked' : ''}`}
          style={{ top: ROW_H / 2, background: color, borderColor: color }}
        />
      </div>
    )
  }

  return (
    <div className={`device-node ${eq.product.category === 'powerSource' ? 'power-source' : ''} ${selected ? 'selected' : ''} ${wiring ? 'wiring' : ''} ${dim ? 'dim' : ''} ${group ? 'grouped' : ''}`}
      style={{ width: NODE_WIDTH, height: headerH + rows * ROW_H + 8, ...(group ? { ['--group-color' as string]: group.color } : {}) }}>
      <div className="device-header" style={{ height: headerH }}>
        <div className="device-tag">{eq.tag}</div>
        {eq.room?.trim() && <div className="device-room" title="Location / room">⌖ {eq.room}</div>}
        <div className="device-model">{eq.product.category === 'powerSource' ? `⚡ ${[eq.circuit?.panel, eq.circuit?.circuit].filter(Boolean).join(' / ') || 'Building power'} · ${eq.circuit?.breakerAmps ?? eq.product.supply?.amps ?? ''} A` : `${eq.product.manufacturer} ${eq.product.model}`}</div>
        <div className="device-cat">{CATEGORIES[eq.product.category].name}</div>
      </div>
      {left.map((p, i) => renderPort(p, i, 'left'))}
      {right.map((p, i) => renderPort(p, i, 'right'))}
    </div>
  )
})

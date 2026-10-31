import { memo, useMemo } from 'react'
import { Handle, NodeToolbar, Position, type NodeProps, type Node } from '@xyflow/react'
import { CATEGORIES, connectorName, DOMAINS, nodeGeom, faceSVG, portDomain, previewHeight, SIGNALS, SMALL_HEAD, SMALL_W, viewsOf, type EquipmentInstance, type PortTemplate } from '@core/index'
import { pickIndex, useWiring } from './wiring'
import { setPortsInView } from '@core/index'
import { useStore } from '../store'
import { showContextMenu } from '../components/ContextMenu'

export { NODE_WIDTH, HEADER_H, ROW_H, headerHeight, splitPorts } from '@core/index'
import { headerHeight, NODE_WIDTH, ROW_H, splitPorts } from '@core/index'

export type DeviceNodeData = { eq: EquipmentInstance; connected: Set<string>; group?: { name: string; color: string }; dim?: boolean; offPage?: Record<string, string> }
export type DeviceNodeType = Node<DeviceNodeData, 'device'>

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

  const size = eq.nodeSize ?? 'medium'
  const viewId = useStore((st) => st.diagramView)
  const ph = previewHeight(eq)
  const preview = useMemo(() => faceSVG(eq.product, { labels: size !== 'small' || ph > 60 }), [eq.product, size, ph])
  const geom = size === 'small' ? nodeGeom(eq) : null

  const state = (p: PortTemplate) => {
    if (!wiring) return ''
    if (wiring.equipment === eq.id && wiring.port === p.id) return 'origin'
    const q = candidates.get(`${eq.id}/${p.id}`)
    return q === 'clean' ? 'valid' : q === 'caution' ? 'caution' : 'invalid'
  }

  const renderPort = (p: PortTemplate, i: number, side: 'left' | 'right') => {
    const d = portDomain(p)
    const color = d ? DOMAINS[d].color : '#888'
    const top = geom ? geom.port(p.id)?.y ?? 0 : headerH + i * ROW_H + ROW_H / 2
    const pick = pickIndex(picked, { equipment: eq.id, port: p.id })
    const title = `${p.label}\n${connectorName(p.connector)} ${p.gender} · ${p.direction}\n${p.signals.map((s) => SIGNALS[s].name).join(', ')}`
    return (
      <div key={p.id} className={`port-row ${side} ${state(p)} ${pick >= 0 ? 'picked' : ''} ${geom ? 'compact' : ''}`} style={{ top: top - ROW_H / 2 }} title={`${title}\nShift-click to pick for patching multiples`}
        onPointerDownCapture={(e) => { if (e.shiftKey && e.button === 0) { e.stopPropagation(); e.preventDefault(); togglePick({ equipment: eq.id, port: p.id }) } }}
        onMouseDownCapture={(e) => { if (e.shiftKey) e.stopPropagation() }}
        onClickCapture={(e) => { if (e.shiftKey) e.stopPropagation() }}
        onContextMenu={(e) => {
          const s = useStore.getState(), vid = s.diagramView
          if (!vid) return
          e.preventDefault(); e.stopPropagation()
          showContextMenu(e, [
            { label: `Hide “${p.label}” in This View`, onClick: () => s.apply('Hide Port in View', (d) => setPortsInView(d, vid, eq.id, [p.id], false)) },
            { label: `Hide Unwired Ports of ${eq.tag}`, onClick: () => s.apply('Hide Ports in View', (d) => setPortsInView(d, vid, eq.id, eq.product.ports.filter((x) => !connected.has(x.id)).map((x) => x.id), false)) },
            { label: 'Choose Ports…', onClick: () => s.set({ editingView: vid }) },
          ])
        }}>
        {!geom && <span className="port-label">{p.label}</span>}
        {data.offPage?.[p.id] && <span className={`offpage ${side}`} title="Connected to a device on another page">{data.offPage[p.id]}</span>}
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

  const sizeBar = viewId && selected && (
    <NodeToolbar position={Position.Top} className="size-bar nodrag">
      {(['small', 'medium', 'full'] as const).map((k) => (
        <button key={k} className={size === k ? 'on' : ''} title={k === 'small' ? 'Small – just the drawing' : k === 'medium' ? 'Medium – drawing + ports' : 'Full size – large drawing + ports'}
          onClick={() => useStore.getState().apply('Card Size', (d) => {
            const v = viewsOf(d).find((x) => x.id === viewId)
            if (v) v.sizes = { ...(v.sizes ?? {}), [eq.id]: k }
          })}>{k === 'small' ? 'S' : k === 'medium' ? 'M' : 'L'}</button>
      ))}
    </NodeToolbar>
  )

  if (geom) {
    return (
      <div className={`device-node small ${selected ? 'selected' : ''} ${wiring ? 'wiring' : ''} ${dim ? 'dim' : ''}`} style={{ width: SMALL_W, height: geom.height }}
        title={`${eq.tag} · ${eq.product.manufacturer} ${eq.product.model}`}>
        {sizeBar}
        <div className="device-header small" style={{ height: SMALL_HEAD }}><span className="device-tag">{eq.tag}</span><span className="device-model">{eq.product.model}</span></div>
        {preview
          ? <div className="plate-thumb" style={{ top: SMALL_HEAD, height: geom.height - SMALL_HEAD - 6 }} dangerouslySetInnerHTML={{ __html: preview }} />
          : <div className="small-cat">{CATEGORIES[eq.product.category].name}</div>}
        {left.map((p, i) => renderPort(p, i, 'left'))}
        {right.map((p, i) => renderPort(p, i, 'right'))}
      </div>
    )
  }

  return (
    <div className={`device-node ${eq.product.category === 'powerSource' ? 'power-source' : ''} ${selected ? 'selected' : ''} ${wiring ? 'wiring' : ''} ${dim ? 'dim' : ''} ${group ? 'grouped' : ''}`}
      style={{ width: NODE_WIDTH, height: headerH + rows * ROW_H + 8, ...(group ? { ['--group-color' as string]: group.color } : {}) }}>
      {sizeBar}
      <div className="device-header" style={{ height: headerH }}>
        <div className="device-tag">{eq.tag}</div>
        {eq.room?.trim() && <div className="device-room" title="Location / room">⌖ {eq.room}</div>}
        <div className="device-model">{eq.product.category === 'powerSource' ? `⚡ ${[eq.circuit?.panel, eq.circuit?.circuit].filter(Boolean).join(' / ') || 'Building power'} · ${eq.circuit?.breakerAmps ?? eq.product.supply?.amps ?? ''} A` : `${eq.product.manufacturer} ${eq.product.model}`}</div>
        <div className="device-cat">{CATEGORIES[eq.product.category].name}</div>
        {preview && ph > 0 && <div className="plate-thumb" style={{ top: eq.room?.trim() ? 54 : 40, height: ph - 8 }} dangerouslySetInnerHTML={{ __html: preview }} />}
      </div>
      {left.map((p, i) => renderPort(p, i, 'left'))}
      {right.map((p, i) => renderPort(p, i, 'right'))}
    </div>
  )
})

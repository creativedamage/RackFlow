import { memo, useMemo } from 'react'
import { Handle, NodeToolbar, Position, type NodeProps, type Node } from '@xyflow/react'
import {
  cardLayout, CATEGORIES, connectorName, DOMAINS, nodeGeom, faceSVG, IO_H, portDomain, previewHeight, SEC_HEAD, SIGNALS, SMALL_HEAD, SMALL_W, viewsOf,
  setPortsInView, type CardSection, type EquipmentInstance, type PortTemplate, type SignalDomain,
} from '@core/index'
import { clickPort, pickIndex, useWiring } from './wiring'
import { useStore } from '../store'
import { showContextMenu } from '../components/ContextMenu'

export { NODE_WIDTH, HEADER_H, ROW_H, headerHeight, splitPorts } from '@core/index'
import { NODE_WIDTH, ROW_H, splitPorts } from '@core/index'

export type DeviceNodeData = { eq: EquipmentInstance; connected: Set<string>; group?: { name: string; color: string }; dim?: boolean; offPage?: Record<string, string> }
export type DeviceNodeType = Node<DeviceNodeData, 'device'>

/** Fold / unfold a port section (or the whole I/O) on the real device. */
function fold(eqId: string, section: string | null) {
  useStore.getState().apply(section ? 'Fold Section' : 'Hide I/O', (d) => {
    const e = d.equipment.find((x) => x.id === eqId)
    if (!e) return
    if (!section) { e.ioHidden = !e.ioHidden || undefined; return }
    const s = new Set(e.collapsed ?? [])
    if (s.has(section)) s.delete(section); else s.add(section)
    e.collapsed = s.size ? [...s] : undefined
  })
}

/**
 * A device card: type chips, tag, maker · model, then an I/O panel with one
 * section per port group – inputs on the left (←), outputs on the right (→),
 * numbered. Click ports to pick them, then click a port on another device to
 * cascade them down that side; or drag from a port's dot.
 */
export const DeviceNode = memo(function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const { eq, connected, group, dim } = data
  const wiring = useWiring((s) => s.origin)
  const candidates = useWiring((s) => s.candidates)
  const picked = useWiring((s) => s.picked)
  const picking = picked.length > 0 && picked.every((x) => x.equipment !== eq.id)

  const size = eq.nodeSize ?? 'medium'
  const viewId = useStore((st) => st.diagramView)
  const ph = previewHeight(eq)
  const preview = useMemo(() => faceSVG(eq.product, { labels: size !== 'small' || ph > 60 }), [eq.product, size, ph])
  const small = size === 'small'
  const geom = small ? nodeGeom(eq) : null
  const L = small ? null : cardLayout(eq)
  const domains = useMemo(() => [...new Set(eq.product.ports.map(portDomain).filter(Boolean) as SignalDomain[])].filter((d) => d !== 'power' || eq.product.ports.every((p) => portDomain(p) === 'power')).slice(0, 3), [eq.product.ports])

  const state = (p: PortTemplate) => {
    if (!wiring) return ''
    if (wiring.equipment === eq.id && wiring.port === p.id) return 'origin'
    const q = candidates.get(`${eq.id}/${p.id}`)
    return q === 'clean' ? 'valid' : q === 'caution' ? 'caution' : 'invalid'
  }

  const renderPort = (p: PortTemplate, side: 'left' | 'right', y: number, num: number | null, folded: boolean) => {
    const d = portDomain(p)
    const color = d ? DOMAINS[d].color : '#888'
    const pick = pickIndex(picked, { equipment: eq.id, port: p.id })
    const arrow = p.direction === 'input' ? '←' : p.direction === 'output' ? '→' : '↔'
    const title = `${p.label}\n${connectorName(p.connector)} ${p.gender} · ${p.direction}\n${p.signals.map((s) => SIGNALS[s].name).join(', ')}\n\nClick to pick, shift-click to pick a run, then click a port on another device to connect them in order.`
    return (
      <div key={p.id} className={`port-row ${side} ${state(p)} ${pick >= 0 ? 'picked' : ''} ${geom ? 'compact' : ''} ${folded ? 'folded' : ''}`} style={{ top: y - ROW_H / 2 }} title={folded ? p.label : title}
        onClick={(e) => { if (folded) return; e.stopPropagation(); clickPort(eq, p.id, e) }}
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
        {!geom && !folded && (
          <div className={`dn-pill ${picking ? 'target' : ''}`}>
            {num != null && <span className="dn-num">{num}.</span>}
            {side === 'left' && <span className="dn-arrow">{arrow}</span>}
            <span className="port-label">{p.label}</span>
            {side === 'right' && <span className="dn-arrow">{arrow}</span>}
            {pick >= 0 && <span className="pick-badge">{pick + 1}</span>}
          </div>
        )}
        {geom && pick >= 0 && <span className="pick-badge">{pick + 1}</span>}
        {data.offPage?.[p.id] && <span className={`offpage ${side}`} title="Connected to a device on another page">{data.offPage[p.id]}</span>}
        <Handle
          id={p.id}
          type="source"
          position={side === 'left' ? Position.Left : Position.Right}
          className={`port-handle ${p.direction} ${connected.has(p.id) ? 'linked' : ''}`}
          style={{ top: ROW_H / 2, ['--pc' as string]: color }}
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
    const { left, right } = splitPorts(eq)
    return (
      <div className={`device-node small ${selected ? 'selected' : ''} ${wiring ? 'wiring' : ''} ${dim ? 'dim' : ''}`} style={{ width: SMALL_W, height: geom.height }}
        title={`${eq.tag} · ${eq.product.manufacturer} ${eq.product.model}`}>
        {sizeBar}
        <div className="device-header small" style={{ height: SMALL_HEAD }}><span className="device-tag">{eq.tag}</span><span className="device-model">{eq.product.model}</span></div>
        {preview
          ? <div className="plate-thumb" style={{ top: SMALL_HEAD, height: geom.height - SMALL_HEAD - 6 }} dangerouslySetInnerHTML={{ __html: preview }} />
          : <div className="small-cat">{CATEGORIES[eq.product.category].name}</div>}
        {left.map((p) => renderPort(p, 'left', geom.port(p.id)?.y ?? 0, null, false))}
        {right.map((p) => renderPort(p, 'right', geom.port(p.id)?.y ?? 0, null, false))}
      </div>
    )
  }

  const lay = L!
  const room = eq.room?.trim()
  const sub = eq.product.category === 'powerSource'
    ? `⚡ ${[eq.circuit?.panel, eq.circuit?.circuit].filter(Boolean).join(' / ') || 'Building power'} · ${eq.circuit?.breakerAmps ?? eq.product.supply?.amps ?? ''} A`
    : [eq.product.manufacturer, eq.product.model].filter(Boolean).join(' · ')

  const section = (s: CardSection) => {
    const color = s.domain ? DOMAINS[s.domain].color : '#888'
    return (
      <div key={s.key} className={`dn-sec ${s.collapsed ? 'collapsed' : ''}`} style={{ top: s.y, height: s.h }}>
        <div className="dn-sec-head nodrag" style={{ height: SEC_HEAD }} onClick={(e) => { e.stopPropagation(); fold(eq.id, s.key) }} title={s.collapsed ? 'Show these ports' : 'Fold these ports away'}>
          <span className="dn-caret">{s.collapsed ? '▸' : '▾'}</span>
          <span className="dot" style={{ background: color }} />
          <span className="dn-sec-name" style={{ color }}>{s.name}</span>
          {s.collapsed && <span className="dn-sec-count">{s.ports.length} port{s.ports.length === 1 ? '' : 's'}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className={`device-node card ${eq.product.category === 'powerSource' ? 'power-source' : ''} ${selected ? 'selected' : ''} ${wiring ? 'wiring' : ''} ${dim ? 'dim' : ''}`}
      style={{ width: NODE_WIDTH, height: lay.height }}>
      {sizeBar}
      <div className="dn-head">
        <div className="dn-chips">
          {domains.map((d) => <span key={d} className="dn-chip" style={{ ['--cc' as string]: DOMAINS[d].color }}>{DOMAINS[d].name}</span>)}
          {group && <span className="dn-chip group" style={{ ['--cc' as string]: group.color }} title="System / group">{group.name}</span>}
          <span className="dn-cat">{CATEGORIES[eq.product.category]?.name}</span>
        </div>
        <div className="dn-title">{eq.tag}</div>
        <div className="dn-sub" title={sub}>{sub}</div>
        {room && <div className="dn-room" title="Location / room">⌖ {room}</div>}
        {preview && ph > 0 && <div className="plate-thumb" style={{ top: room ? 80 : 66, height: ph - 8 }} dangerouslySetInnerHTML={{ __html: preview }} />}
      </div>
      {eq.product.ports.length > 0 && (
        <div className="dn-io" style={{ top: lay.ioY, height: IO_H }}>
          <span>I/O</span>
          <button className="dn-hide nodrag" onClick={(e) => { e.stopPropagation(); fold(eq.id, null) }}>{eq.ioHidden ? 'Show' : 'Hide'}</button>
        </div>
      )}
      {!eq.ioHidden && lay.sections.map(section)}
      {lay.sections.flatMap((s) => {
        const folded = s.collapsed
        return s.rows.flatMap((r) => [
          r.left ? renderPort(r.left, 'left', lay.ports.get(r.left.id)!.y, r.li + 1, folded) : null,
          r.right ? renderPort(r.right, 'right', lay.ports.get(r.right.id)!.y, r.ri + 1, folded) : null,
        ])
      })}
    </div>
  )
})

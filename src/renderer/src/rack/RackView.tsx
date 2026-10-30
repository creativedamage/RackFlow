import { deviceMenu } from '../product/productActions'
import { showContextMenu } from '../components/ContextMenu'
import { useMemo, useState } from 'react'
import { addRack, RackLayout, type EquipmentId, type Rack, type RackFace } from '@core/index'
import { useStore } from '../store'
import { DRAG_MIME, type DragPayload } from '../components/Sidebar'
import { Empty, NumberInput, Segmented, TextInput, Toggle } from '../components/ui'

/**
 * Rack elevations. Bounded size (≤ 60U), so plain DOM is simplest and fastest.
 * Dragging shows a live "ghost" at the nearest legal slot (overlap- and
 * front/rear-depth-aware) – what you see is exactly where it will land.
 */
export function RackView() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [face, setFace] = useState<RackFace>('front')
  const [unitPx, setUnitPx] = useState(22)
  const [heat, setHeat] = useState(false)

  const unracked = project.equipment.filter((e) => e.product.physical.rackUnits != null && !e.rackPlacement)

  return (
    <div className="rack-view">
      <div className="rack-toolbar">
        <Segmented value={face} onChange={setFace} options={[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }]} />
        <Toggle checked={heat} onChange={setHeat} label="Heat map" />
        <label className="zoom">Zoom <input type="range" min={12} max={40} value={unitPx} onChange={(e) => setUnitPx(+e.target.value)} /></label>
        <span className="spacer" />
        <button onClick={() => apply('Add Rack', (d) => { addRack(d) })}>+ Add Rack</button>
      </div>
      <div className="rack-body">
        <div className="unracked">
          <h4>Not yet racked</h4>
          {unracked.length === 0 && <p className="muted">All rack-mountable devices are placed.</p>}
          {unracked.map((e) => (
            <div key={e.id} className="unracked-item" draggable onDragStart={(ev) => ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'rack-eq', id: e.id } satisfies DragPayload))}>
              <b>{e.tag}</b><span className="muted ellipsis">{e.product.model}</span><span className="mono">{e.product.physical.rackUnits}U</span>
            </div>
          ))}
        </div>
        <div className="racks-scroll">
          {project.racks.length === 0
            ? <Empty title="No racks yet"><button className="primary" onClick={() => apply('Add Rack', (d) => { addRack(d) })}>+ Add a 42U Rack</button></Empty>
            : project.racks.map((r) => <RackColumn key={r.id} rack={r} face={face} unitPx={unitPx} heat={heat} />)}
        </div>
      </div>
    </div>
  )
}

function RackColumn({ rack, face, unitPx, heat }: { rack: Rack; face: RackFace; unitPx: number; heat: boolean }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const setState = useStore((s) => s.set)
  const layout = useMemo(() => RackLayout.of(project, rack.id), [project, rack.id])
  const [ghost, setGhost] = useState<{ start: number; height: number; ok: boolean } | null>(null)
  if (!layout) return null

  const total = rack.spec.rackUnits
  const bodyW = 300, rail = 26
  const yOf = (high: number) => (total - high) * unitPx

  const dragTarget = (e: React.DragEvent): { id: EquipmentId; h: number; depth: number; start: number | null } | null => {
    const raw = e.dataTransfer.getData(DRAG_MIME) || dragCache
    if (!raw) return null
    const p = JSON.parse(raw) as DragPayload
    if (p.kind !== 'rack-eq') return null
    const eq = project.equipment.find((x) => x.id === p.id)
    const h = eq?.product.physical.rackUnits
    if (!eq || !h) return null
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const unitAtCursor = total - Math.floor((e.clientY - rect.top) / unitPx)
    const proposed = Math.max(1, unitAtCursor - h + 1)
    const start = layout.nearestFreeStart(h, eq.product.physical.depthMM, proposed, face, { kind: 'equipment', id: eq.id })
    return { id: eq.id, h, depth: eq.product.physical.depthMM, start }
  }

  const occupants = layout.occupants.filter((o) => o.face === face || o.depthMM > rack.spec.mountingDepthMM * 0.8)
  const heatMap = layout.heatPerUnit
  const maxHeat = Math.max(1, ...heatMap)
  const cog = layout.centerOfGravityU

  return (
    <div className="rack-col">
      <div className="rack-head" style={{ width: bodyW + 2 * rail }}>
        <TextInput className="rack-name" value={rack.name} onCommit={(v) => apply('Rename Rack', (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.name = v })} />
        <span className="muted mono">{layout.usedUnits}/{total}U</span>
        <button className="mini" onClick={() => setState({ selectedRack: rack.id, selection: [], selectedCable: null, showInspector: true })}>Settings</button>
      </div>
      <div
        className="rack"
        style={{ width: bodyW + 2 * rail, height: total * unitPx }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return
          e.preventDefault()
          const t = dragTarget(e)
          setGhost(t ? { start: t.start ?? 1, height: t.h, ok: t.start != null } : null)
        }}
        onDragLeave={() => setGhost(null)}
        onDrop={(e) => {
          const t = dragTarget(e)
          setGhost(null)
          dragCache = ''
          if (!t || t.start == null) return
          e.preventDefault()
          apply('Place in Rack', (d) => {
            const eq = d.equipment.find((x) => x.id === t.id)
            if (eq) eq.rackPlacement = { rack: rack.id, startUnit: t.start!, face }
          })
        }}
      >
        {Array.from({ length: total }, (_, i) => total - i).map((u) => (
          <div key={u} className="rack-unit" style={{ top: yOf(u), height: unitPx }}>
            <span className="rail l" style={{ width: rail }}>{u}</span>
            <span className="rail r" style={{ width: rail }}>{u}</span>
          </div>
        ))}
        {heat && heatMap.map((h, i) => h > 0 && (
          <div key={i} className="heat" title={`${h.toFixed(0)} BTU/hr`} style={{ top: yOf(i + 1), height: unitPx, right: rail, background: `hsl(${50 * (1 - h / maxHeat)}, 90%, 55%)` }} />
        ))}
        {occupants.map((o) => {
          const other = o.face !== face
          const id = o.ref.kind === 'equipment' ? o.ref.id : null
          const selected = id != null && selection.includes(id)
          const height = (o.high - o.low + 1) * unitPx - 1
          return (
            <div key={`${o.ref.kind}:${o.ref.id}`}
              className={`rack-item ${other ? 'other-face' : ''} ${selected ? 'selected' : ''} ${o.ref.kind}`}
              style={{ top: yOf(o.high), height, left: rail + (o.halfSlot === 'right' ? bodyW / 2 : 0), width: o.halfSlot ? bodyW / 2 : bodyW }}
              draggable={id != null}
              onDragStart={(e) => { if (id) { const s = JSON.stringify({ kind: 'rack-eq', id } satisfies DragPayload); dragCache = s; e.dataTransfer.setData(DRAG_MIME, s) } }}
              onClick={() => id && select([id])}
              onContextMenu={(e) => { if (!id) return; select([id]); showContextMenu(e, [...deviceMenu(id), 'sep', { label: 'Flip Front/Rear', onClick: () => apply('Flip Mount Face', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.face = eq.rackPlacement.face === 'front' ? 'rear' : 'front' }) }]) }}
              onDoubleClick={() => id && apply('Flip Mount Face', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.face = eq.rackPlacement.face === 'front' ? 'rear' : 'front' })}
              title={id ? 'Drag to move · double-click to flip front/rear · right-click to edit · Delete removes from rack' : undefined}
              tabIndex={id ? 0 : -1}
              onKeyDown={(e) => {
                if (id && (e.key === 'Backspace' || e.key === 'Delete')) {
                  e.stopPropagation()
                  apply('Remove from Rack', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq) eq.rackPlacement = null })
                }
              }}
            >
              <b>{o.name}</b>
              {height > 16 && <span className="muted">{o.typicalWatts.toFixed(0)} W · {o.weightKG.toFixed(1)} kg</span>}
              {other && <span className="face-tag">{o.face}</span>}
            </div>
          )
        })}
        {ghost && <div className={`rack-ghost ${ghost.ok ? '' : 'bad'}`} style={{ top: yOf(ghost.start + ghost.height - 1), height: ghost.height * unitPx, left: rail, width: bodyW }} />}
        {cog != null && <div className="cog" style={{ top: (total - cog) * unitPx }} title={`Centre of gravity U${cog.toFixed(1)}`}>◆</div>}
      </div>
      <dl className="rack-stats">
        <dt>Weight</dt><dd>{layout.totalWeightKG.toFixed(1)} / {rack.spec.maxLoadKG} kg</dd>
        <dt>Power</dt><dd>{layout.totalTypicalWatts.toFixed(0)} W typ · {layout.totalMaxWatts.toFixed(0)} W max · {layout.amps(120).toFixed(1)} A @120V</dd>
        <dt>Heat</dt><dd>{layout.totalHeatBTU.toFixed(0)} BTU/hr</dd>
        {cog != null && <><dt>CoG</dt><dd>U{cog.toFixed(1)}</dd></>}
      </dl>
    </div>
  )
}

/** dataTransfer.getData is empty during dragover in Chromium; cache our own payload. */
let dragCache = ''
document.addEventListener('dragstart', (e) => {
  const v = e.dataTransfer?.getData(DRAG_MIME)
  if (v) dragCache = v
})

export function RackSettings({ rack }: { rack: Rack }) {
  const apply = useStore((s) => s.apply)
  const upd = (label: string, fn: (r: Rack) => void) => apply(label, (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) fn(r) })
  return (
    <div className="form">
      <h3>Rack</h3>
      <label className="field"><span className="field-label">Name</span><TextInput value={rack.name} onCommit={(v) => upd('Rename Rack', (r) => { r.name = v })} /></label>
      <label className="field"><span className="field-label">Height</span><NumberInput value={rack.spec.rackUnits} min={4} max={60} unit="U" onCommit={(v) => upd('Rack Height', (r) => { r.spec.rackUnits = v ?? 42 })} /></label>
      <label className="field"><span className="field-label">Mounting depth</span><NumberInput value={rack.spec.mountingDepthMM} min={100} unit="mm" onCommit={(v) => upd('Rack Depth', (r) => { r.spec.mountingDepthMM = v ?? 600 })} /></label>
      <label className="field"><span className="field-label">Load rating</span><NumberInput value={rack.spec.maxLoadKG} min={1} unit="kg" onCommit={(v) => upd('Rack Load', (r) => { r.spec.maxLoadKG = v ?? 900 })} /></label>
      <label className="field"><span className="field-label">Cooling capacity</span><NumberInput value={rack.spec.coolingCapacityBTU} allowEmpty unit="BTU/hr" onCommit={(v) => upd('Rack Cooling', (r) => { r.spec.coolingCapacityBTU = v })} /></label>
      <button className="danger" onClick={() => { if (confirm(`Delete ${rack.name}? Devices in it become unracked.`)) apply('Delete Rack', (d) => {
        d.racks = d.racks.filter((r) => r.id !== rack.id)
        for (const e of d.equipment) if (e.rackPlacement?.rack === rack.id) e.rackPlacement = null
      }) }}>Delete Rack</button>
    </div>
  )
}

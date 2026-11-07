import { deviceMenu } from '../product/productActions'
import { showContextMenu } from '../components/ContextMenu'
import { useEffect, useMemo, useState } from 'react'
import { faceSVG, faceProduct, productFace, fmtWt, type EquipmentInstance } from '@core/index'
import { ACCESSORY_KINDS, accessoryLabel, canHaveLogo, addAccessory, addRack, fillWithBlanks, RackLayout, type AccessoryKind, type EquipmentId, type Rack, type RackAccessory, type RackFace } from '@core/index'
import { RackPrintDialog } from './RackPrint'
import { uploadLogo } from './AccessoryInspector'
import { useStore } from '../store'
import { DRAG_MIME, type DragPayload } from '../components/Sidebar'
import { Empty, NumberInput, Segmented, TextInput, Toggle, LenInput, WtInput } from '../components/ui'

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
  const [printing, setPrinting] = useState(false)

  const unracked = project.equipment.filter((e) => e.product.physical.rackUnits != null && !e.rackPlacement)
  // Delete / Backspace takes everything picked out of the racks (devices stay in the project).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const st = useStore.getState()
      const eqs = new Set(st.selection.filter((id) => st.project.equipment.find((x) => x.id === id)?.rackPlacement))
      const accs = new Set([...st.rackAccSel, ...(st.selectedAccessory ? [st.selectedAccessory.id] : [])])
      if (!eqs.size && !accs.size) return
      e.preventDefault(); e.stopPropagation()
      const n = eqs.size + accs.size
      st.apply(n > 1 ? `Remove ${n} from Rack` : eqs.size ? 'Remove from Rack' : 'Remove Panel', (d) => {
        for (const eq of d.equipment) if (eqs.has(eq.id)) eq.rackPlacement = null
        for (const r of d.racks) r.accessories = r.accessories.filter((a) => !accs.has(a.id))
      })
      st.set({ rackAccSel: [], selectedAccessory: null })
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])

  return (
    <div className="rack-view">
      <div className="rack-toolbar">
        <Segmented value={face} onChange={setFace} options={[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }]} />
        <Toggle checked={heat} onChange={setHeat} label="Heat map" />
        <span className="muted small">Drag a box or shift-click to pick several · drag one to move them all · Delete takes them out</span>
        <label className="zoom">Zoom <input type="range" min={12} max={40} value={unitPx} onChange={(e) => setUnitPx(+e.target.value)} /></label>
        <span className="spacer" />
        <button onClick={() => setPrinting(true)} disabled={!project.racks.length}>Print / Export…</button>
        <button onClick={() => apply('Add Rack', (d) => { addRack(d) })}>+ Add Rack</button>
      </div>
      <div className="panel-palette" title="Drag a panel into a rack">
        <span className="muted small">Panels:</span>
        {PALETTE.map(([kind, h, half]) => (
          <div key={`${kind}${h}${half ? 'h' : ''}`} className={`palette-chip acc-${kind}`} draggable title={half ? 'Half-width 1U blank – label it with anything you don’t want on the drawing (chargers, small boxes…)' : undefined}
            onDragStart={(ev) => { const s = JSON.stringify({ kind: 'rack-acc', acc: kind, height: h, ...(half ? { half: true } : {}) } satisfies DragPayload); dragCache = s; ev.dataTransfer.setData(DRAG_MIME, s) }}>
            {half ? '½ ' : ''}{ACCESSORY_KINDS[kind].name} {h}U
          </div>
        ))}
      </div>
      {printing && <RackPrintDialog onClose={() => setPrinting(false)} />}
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
  const [ghost, setGhost] = useState<{ start: number; height: number; ok: boolean; slot?: 'left' | 'right' | null } | null>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [ghosts, setGhosts] = useState<{ start: number; height: number; ok: boolean; slot?: 'left' | 'right' | null }[] | null>(null)
  if (!layout) return null

  const total = rack.spec.rackUnits
  const bodyW = 300, rail = 26
  const yOf = (high: number) => (total - high) * unitPx
  const selAcc = useStore((s) => s.selectedAccessory)
  const accSel = useStore((s) => s.rackAccSel)
  const logos = project.logos ?? []
  const fill = (between: boolean) => {
    let n = 0
    apply(between ? 'Fill Gaps with Blanks' : 'Fill Rack with Blanks', (d) => { n = fillWithBlanks(d, rack.id, face, { onlyBetween: between }) })
    useStore.getState().notify(n ? `Added ${n} blank panel${n === 1 ? '' : 's'}` : 'No empty spaces to fill', { undo: !!n })
  }

  type Move = { id: string; kind: 'equipment' | 'accessory'; start: number; h: number; slot: 'left' | 'right' | null }
  type Target = { what: 'multi'; moves: Move[]; ok: boolean } | { what: 'eq'; id: EquipmentId; h: number; start: number | null; slot?: 'left' | 'right' | null } | { what: 'acc'; acc: AccessoryKind; h: number; start: number | null; slot?: 'left' | 'right' | null } | { what: 'move'; id: string; from: string; h: number; start: number | null; slot?: 'left' | 'right' | null }
  const dragTarget = (e: React.DragEvent): Target | null => {
    const raw = e.dataTransfer.getData(DRAG_MIME) || dragCache
    if (!raw) return null
    const p = JSON.parse(raw) as DragPayload
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const unitAtCursor = total - Math.floor((e.clientY - rect.top) / unitPx)
    const at = (h: number, depth: number, ignoring?: { kind: 'equipment'; id: EquipmentId } | { kind: 'accessory'; id: string }) =>
      layout.nearestFreeStart(h, depth, Math.max(1, unitAtCursor - h + 1), face, ignoring)
    if (p.kind === 'rack-eq-multi') {
      // Move a group: keep their spacing, anchored on the one being dragged; slide to the nearest spot where all fit.
      // Devices and panels picked together move as one block.
      type It = { id: string; kind: 'equipment' | 'accessory'; height: number; depthMM: number; low: number | null; halfSlot: 'left' | 'right' | null }
      const eqs: It[] = p.ids.map((id) => project.equipment.find((x) => x.id === id)).filter((x): x is EquipmentInstance => !!x?.product.physical.rackUnits)
        .map((x) => ({ id: x.id, kind: 'equipment', height: x.product.physical.rackUnits!, depthMM: x.product.physical.depthMM, low: x.rackPlacement?.startUnit ?? null, halfSlot: x.product.physical.halfWidth ? x.rackPlacement?.halfSlot ?? 'left' : null }))
      const accs: It[] = (p.accs ?? []).flatMap((id) => project.racks.flatMap((r) => r.accessories.filter((a) => a.id === id)))
        .map((a) => ({ id: a.id, kind: 'accessory', height: a.height, depthMM: ACCESSORY_KINDS[a.kind]?.depthMM ?? 25, low: a.startUnit, halfSlot: a.half && a.height === 1 ? a.half : null }))
      const items = [...eqs, ...accs]
      if (!items.length) return null
      const anchor = items.find((x) => x.id === p.anchor) ?? items[0]
      const low: Record<string, number> = Object.fromEntries(items.map((x) => [x.id, x.low ?? 0]))
      let stack = 0
      for (const x of items) if (x.low == null) { stack -= x.height; low[x.id] = low[anchor.id] + stack }
      const want = Math.max(1, unitAtCursor - anchor.height + 1)
      const plan = (start: number) => items.map((x) => ({ id: x.id, kind: x.kind, height: x.height, depthMM: x.depthMM, start: start + (low[x.id] - low[anchor.id]), halfSlot: x.halfSlot }))
      const moves = (pl: ReturnType<typeof plan>): Move[] => pl.map((m) => ({ id: m.id, kind: m.kind, start: m.start, h: m.height, slot: m.halfSlot }))
      for (let k = 0; k <= total; k++) for (const st of k ? [want - k, want + k] : [want]) {
        const pl = plan(st)
        if (layout.canPlaceGroup(pl, face)) return { what: 'multi', ok: true, moves: moves(pl) }
      }
      return { what: 'multi', ok: false, moves: moves(plan(want)) }
    }
    if (p.kind === 'rack-eq') {
      const eq = project.equipment.find((x) => x.id === p.id)
      const h = eq?.product.physical.rackUnits
      if (!eq || !h) return null
      if (eq.product.physical.halfWidth) {
        // ½-width gear: the half under the cursor, else the other half of that unit, else the nearest free half.
        const prefer = e.clientX - rect.left - rail < bodyW / 2 ? 'left' : 'right'
        const spot = layout.nearestSpot(h, eq.product.physical.depthMM, Math.max(1, unitAtCursor - h + 1), face, { kind: 'equipment', id: eq.id }, true, prefer)
        return { what: 'eq', id: eq.id, h, start: spot?.start ?? null, slot: spot?.slot ?? null }
      }
      return { what: 'eq', id: eq.id, h, start: at(h, eq.product.physical.depthMM, { kind: 'equipment', id: eq.id }) }
    }
    const prefer = e.clientX - rect.left - rail < bodyW / 2 ? 'left' : 'right'
    if (p.kind === 'rack-acc' && p.half) {
      const spot = layout.nearestSpot(1, ACCESSORY_KINDS[p.acc].depthMM, Math.max(1, unitAtCursor), face, undefined, true, prefer)
      return { what: 'acc', acc: p.acc, h: 1, start: spot?.start ?? null, slot: spot?.slot ?? null }
    }
    if (p.kind === 'rack-acc') return { what: 'acc', acc: p.acc, h: p.height, start: at(p.height, ACCESSORY_KINDS[p.acc].depthMM) }
    if (p.kind === 'rack-acc-move') {
      const src = project.racks.find((r) => r.id === p.rack)?.accessories.find((a) => a.id === p.id)
      if (!src) return null
      if (src.half && src.height === 1) {
        const spot = layout.nearestSpot(1, ACCESSORY_KINDS[src.kind]?.depthMM ?? 25, Math.max(1, unitAtCursor), face, p.rack === rack.id ? { kind: 'accessory', id: p.id } : undefined, true, prefer)
        return { what: 'move', id: p.id, from: p.rack, h: 1, start: spot?.start ?? null, slot: spot?.slot ?? null }
      }
      return { what: 'move', id: p.id, from: p.rack, h: src.height, start: at(src.height, ACCESSORY_KINDS[src.kind]?.depthMM ?? 25, p.rack === rack.id ? { kind: 'accessory', id: p.id } : undefined) }
    }
    return null
  }

  const occupants = layout.occupants.filter((o) => o.face === face || o.depthMM > rack.spec.mountingDepthMM * 0.8)
  // Drag a box over the rack (from an empty spot) to pick every device and panel it touches; shift adds.
  const startBox = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.rack-item')) return
    const el = e.currentTarget, r0 = el.getBoundingClientRect(), add = e.shiftKey || e.metaKey
    const x0 = e.clientX - r0.left, y0 = e.clientY - r0.top
    let moved = false
    const move = (ev: MouseEvent) => {
      const r = el.getBoundingClientRect(), x1 = ev.clientX - r.left, y1 = ev.clientY - r.top
      if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return
      moved = true
      setBox({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) })
    }
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      setBox(null)
      const st = useStore.getState()
      if (!moved) { if (!add) setState({ selection: [], rackAccSel: [], selectedAccessory: null, selectedCable: null }); return }
      const r = el.getBoundingClientRect(), x1 = ev.clientX - r.left, y1 = ev.clientY - r.top
      const bx0 = Math.min(x0, x1), bx1 = Math.max(x0, x1), by0 = Math.min(y0, y1), by1 = Math.max(y0, y1)
      const hit = occupants.filter((o) => o.face === face).filter((o) => {
        const top = yOf(o.high), bottom = top + (o.high - o.low + 1) * unitPx, left = rail + (o.halfSlot === 'right' ? bodyW / 2 : 0), right = left + (o.halfSlot ? bodyW / 2 : bodyW)
        return left < bx1 && right > bx0 && top < by1 && bottom > by0
      })
      const eqs = hit.filter((o) => o.ref.kind === 'equipment').map((o) => o.ref.id as EquipmentId)
      const accs = hit.filter((o) => o.ref.kind === 'accessory').map((o) => o.ref.id)
      const prevAcc = add ? [...st.rackAccSel, ...(st.selectedAccessory ? [st.selectedAccessory.id] : [])] : []
      const selection = [...new Set([...(add ? st.selection : []), ...eqs])]
      const rackAccSel = [...new Set([...prevAcc, ...accs])]
      setState({ selection, rackAccSel, selectedCable: null,
        selectedAccessory: !selection.length && rackAccSel.length === 1 ? { rack: rack.id, id: rackAccSel[0] } : null })
      if (selection.length + rackAccSel.length > 1) useStore.getState().notify(`${selection.length + rackAccSel.length} items picked – drag one to move them together, Delete takes them out`, { kind: 'info', ms: 2500 })
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const heatMap = layout.heatPerUnit
  const maxHeat = Math.max(1, ...heatMap)
  const cog = layout.centerOfGravityU

  return (
    <div className="rack-col">
      <div className="rack-head" style={{ width: bodyW + 2 * rail }}>
        <TextInput className="rack-name" value={rack.name} onCommit={(v) => apply('Rename Rack', (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.name = v })} />
        <span className="muted mono">{layout.usedUnits}/{total}U</span>
        <button className="mini" title="Fill empty spaces with blank panels" onClick={(e) => showContextMenu(e, [
          { label: 'Fill gaps between devices', onClick: () => fill(true) },
          { label: 'Fill all empty space', onClick: () => fill(false) },
          'sep',
          { label: `Remove all panels (${face})`, danger: true, disabled: !rack.accessories.some((a) => a.face === face), onClick: () => apply('Remove Panels', (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.accessories = r.accessories.filter((a) => a.face !== face) }) },
        ])}>Blanks ▾</button>
        <button className="mini" onClick={() => setState({ selectedRack: rack.id, selection: [], selectedCable: null, selectedAccessory: null, showInspector: true })}>Settings</button>
      </div>
      <div
        className="rack"
        style={{ width: bodyW + 2 * rail, height: total * unitPx }}
        onMouseDown={startBox}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return
          e.preventDefault()
          const t = dragTarget(e)
          if (t?.what === 'multi') { setGhost(null); setGhosts(t.moves.map((m) => ({ start: m.start, height: m.h, ok: t.ok, slot: m.slot }))); return }
          setGhosts(null)
          setGhost(t ? { start: t.start ?? 1, height: t.h, ok: t.start != null, slot: t.slot ?? null } : null)
        }}
        onDragLeave={() => { setGhost(null); setGhosts(null) }}
        onDrop={(e) => {
          const t = dragTarget(e)
          setGhost(null)
          dragCache = ''
          setGhosts(null)
          if (t?.what === 'multi') {
            if (!t.ok) return
            e.preventDefault()
            apply(`Move ${t.moves.length} Items`, (d) => {
              const to = d.racks.find((r) => r.id === rack.id)
              for (const m of t.moves) {
                if (m.kind === 'equipment') { const eq = d.equipment.find((x) => x.id === m.id); if (eq) eq.rackPlacement = { rack: rack.id, startUnit: m.start, face, ...(m.slot ? { halfSlot: m.slot } : {}) }; continue }
                const from = d.racks.find((r) => r.accessories.some((a) => a.id === m.id)), a = from?.accessories.find((x) => x.id === m.id)
                if (!from || !a || !to) continue
                from.accessories = from.accessories.filter((x) => x.id !== m.id)
                to.accessories.push({ ...a, startUnit: m.start, face })
              }
            })
            return
          }
          if (!t || t.start == null) return
          e.preventDefault()
          if (t.what === 'eq') apply('Place in Rack', (d) => {
            const eq = d.equipment.find((x) => x.id === t.id)
            if (eq) eq.rackPlacement = { rack: rack.id, startUnit: t.start!, face, ...(t.slot ? { halfSlot: t.slot } : {}) }
          })
          else if (t.what === 'acc') {
            let added: RackAccessory | null = null
            apply(`Add ${ACCESSORY_KINDS[t.acc].name}`, (d) => { added = addAccessory(d, rack.id, t.acc, t.h, t.start!, face, { ...(t.acc === 'logo' && logos[0] ? { logoId: logos[0].id } : {}), ...(t.slot ? { half: t.slot } : {}) }) })
            if (added) setState({ selectedAccessory: { rack: rack.id, id: (added as RackAccessory).id }, selection: [], selectedCable: null, showInspector: true })
          } else apply('Move Panel', (d) => {
            const from = d.racks.find((r) => r.id === t.from), to = d.racks.find((r) => r.id === rack.id)
            const a = from?.accessories.find((x) => x.id === t.id)
            if (!from || !to || !a) return
            from.accessories = from.accessories.filter((x) => x.id !== t.id)
            to.accessories.push({ ...a, startUnit: t.start!, face, ...(t.slot ? { half: t.slot } : {}) })
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
          const acc = o.ref.kind === 'accessory' ? rack.accessories.find((a) => a.id === o.ref.id) : undefined
          if (acc) return <AccessoryItem key={`acc:${acc.id}`} rack={rack} acc={acc} other={other} selected={selAcc?.id === acc.id || accSel.includes(acc.id)}
            canSwap={!!o.halfSlot && layout.canPlace(1, o.depthMM, o.low, o.face, o.ref, o.halfSlot === 'left' ? 'right' : 'left')}
            style={{ top: yOf(o.high), height: (o.high - o.low + 1) * unitPx - 1, left: rail + (o.halfSlot === 'right' ? bodyW / 2 : 0), width: o.halfSlot ? bodyW / 2 : bodyW }} logo={logos.find((l) => l.id === acc.logoId)?.dataUrl} />
          const selected = id != null && selection.includes(id)
          const height = (o.high - o.low + 1) * unitPx - 1
          return (
            <div key={`${o.ref.kind}:${o.ref.id}`}
              className={`rack-item ${other ? 'other-face' : ''} ${selected ? 'selected' : ''} ${o.ref.kind}`}
              style={{ top: yOf(o.high), height, left: rail + (o.halfSlot === 'right' ? bodyW / 2 : 0), width: o.halfSlot ? bodyW / 2 : bodyW }}
              draggable={id != null}
              onDragStart={(e) => {
                if (!id) return
                const st = useStore.getState(), sel = st.selection
                const group = sel.includes(id) ? sel.filter((x) => project.equipment.find((q) => q.id === x)?.product.physical.rackUnits) : []
                const accs = sel.includes(id) ? st.rackAccSel : []
                const s = JSON.stringify(group.length + accs.length > 1 ? { kind: 'rack-eq-multi', ids: group, accs, anchor: id } satisfies DragPayload : { kind: 'rack-eq', id } satisfies DragPayload)
                dragCache = s; e.dataTransfer.setData(DRAG_MIME, s)
              }}
              onClick={(e) => {
                if (!id) return
                // Shift / ⌘-click adds or removes it from the selection.
                if (e.shiftKey || e.metaKey) { const st = useStore.getState(), cur = st.selection; setState({ selection: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id], selectedCable: null, selectedAccessory: null, rackAccSel: st.selectedAccessory && !st.rackAccSel.includes(st.selectedAccessory.id) ? [...st.rackAccSel, st.selectedAccessory.id] : st.rackAccSel }) }
                else select([id])
              }}
              onContextMenu={(e) => { if (!id) return; if (!useStore.getState().selection.includes(id)) select([id]); showContextMenu(e, [...deviceMenu(id), 'sep', ...(o.halfSlot ? [{ label: `Move to ${o.halfSlot === 'left' ? 'Right' : 'Left'} Half`, disabled: !layout.canPlace(o.high - o.low + 1, o.depthMM, o.low, o.face, o.ref, o.halfSlot === 'left' ? 'right' : 'left'), onClick: () => apply('Move Half-Rack Unit', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.halfSlot = o.halfSlot === 'left' ? 'right' : 'left' }) }] : []), { label: 'Flip Front/Rear', onClick: () => apply('Flip Mount Face', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.face = eq.rackPlacement.face === 'front' ? 'rear' : 'front' }) }]) }}
              onDoubleClick={() => id && apply('Flip Mount Face', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.face = eq.rackPlacement.face === 'front' ? 'rear' : 'front' })}
              title={id ? 'Drag to move · shift-click or drag a box to pick several · double-click to flip front/rear · right-click to edit · Delete removes from rack' : undefined}
              tabIndex={id ? 0 : -1}
            >
              {(() => { const eq = id ? project.equipment.find((e) => e.id === id) : undefined; const f = eq && !o.halfSlot ? productFace(eq.product) : null
                return f?.rack ? <div className="rack-face" dangerouslySetInnerHTML={{ __html: faceSVG(faceProduct(eq!), { pad: 0, stretch: true, bare: true }) }} /> : null })()}
              <b>{o.name}</b>{id && <span className="rack-model ellipsis">{project.equipment.find((e) => e.id === id)?.product.model}</span>}
              {height > 16 && <span className="muted">{o.typicalWatts.toFixed(0)} W · {fmtWt(o.weightKG)}</span>}
              {other && <span className="face-tag">{o.face}</span>}
            </div>
          )
        })}
        {ghosts && ghosts.map((g, i) => <div key={i} className={`rack-ghost ${g.ok ? '' : 'bad'}`} style={{ top: yOf(g.start + g.height - 1), height: g.height * unitPx, left: rail + (g.slot === 'right' ? bodyW / 2 : 0), width: g.slot ? bodyW / 2 : bodyW }} />)}
        {ghost && <div className={`rack-ghost ${ghost.ok ? '' : 'bad'}`} style={{ top: yOf(ghost.start + ghost.height - 1), height: ghost.height * unitPx, left: rail + (ghost.slot === 'right' ? bodyW / 2 : 0), width: ghost.slot ? bodyW / 2 : bodyW }} />}
        {box && <div className="rack-marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        {cog != null && <div className="cog" style={{ top: (total - cog) * unitPx }} title={`Centre of gravity U${cog.toFixed(1)}`}>◆</div>}
      </div>
      <dl className="rack-stats">
        <dt>Weight</dt><dd>{fmtWt(layout.totalWeightKG)} / {fmtWt(rack.spec.maxLoadKG, 0)}</dd>
        <dt>Power</dt><dd>{layout.totalTypicalWatts.toFixed(0)} W typ · {layout.totalMaxWatts.toFixed(0)} W max · {layout.amps(120).toFixed(1)} A @120V</dd>
        <dt>Heat</dt><dd>{layout.totalHeatBTU.toFixed(0)} BTU/hr</dd>
        {cog != null && <><dt>CoG</dt><dd>U{cog.toFixed(1)}</dd></>}
      </dl>
    </div>
  )
}

const PALETTE: [AccessoryKind, number, boolean?][] = [['blank', 1], ['blank', 1, true], ['blank', 2], ['logo', 1], ['logo', 2], ['brush', 1], ['vent', 1], ['lacing', 1], ['shelf', 2], ['drawer', 2]]

function AccessoryItem({ rack, acc, other, selected, style, logo, canSwap }: { rack: Rack; acc: RackAccessory; other: boolean; selected: boolean; style: React.CSSProperties; logo?: string; canSwap?: boolean }) {
  const apply = useStore((s) => s.apply)
  const setState = useStore((s) => s.set)
  const remove = () => { apply(`Remove ${ACCESSORY_KINDS[acc.kind].name}`, (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.accessories = r.accessories.filter((a) => a.id !== acc.id) }); setState({ selectedAccessory: null }) }
  const selectMe = () => setState({ selectedAccessory: { rack: rack.id, id: acc.id }, rackAccSel: [acc.id], selection: [], selectedCable: null, showInspector: true })
  const toggleMe = () => {
    const st = useStore.getState(), cur = st.selectedAccessory && !st.rackAccSel.includes(st.selectedAccessory.id) ? [...st.rackAccSel, st.selectedAccessory.id] : st.rackAccSel
    setState({ rackAccSel: cur.includes(acc.id) ? cur.filter((x) => x !== acc.id) : [...cur, acc.id], selectedAccessory: null, selectedCable: null })
  }
  const label = accessoryLabel(acc)
  return (
    <div className={`rack-item accessory acc-${acc.kind} finish-${acc.finish ?? 'black'} ${other ? 'other-face' : ''} ${selected ? 'selected' : ''}`} style={style} tabIndex={0}
      draggable={!other} onDragStart={(e) => {
        const st = useStore.getState(), mine = st.rackAccSel.includes(acc.id)
        const eqs = mine ? st.selection.filter((x) => st.project.equipment.find((q) => q.id === x)?.product.physical.rackUnits) : []
        const multi = mine && eqs.length + st.rackAccSel.length > 1
        const s = JSON.stringify(multi ? { kind: 'rack-eq-multi', ids: eqs, accs: st.rackAccSel, anchor: acc.id } satisfies DragPayload : { kind: 'rack-acc-move', rack: rack.id, id: acc.id } satisfies DragPayload)
        dragCache = s; e.dataTransfer.setData(DRAG_MIME, s)
      }}
      onClick={(e) => (e.shiftKey || e.metaKey ? toggleMe() : selectMe())}
      onContextMenu={(e) => { selectMe(); showContextMenu(e, [
        ...(canHaveLogo(acc.kind) ? [
          { label: acc.logoId ? 'Change Logo…' : 'Add Logo…', onClick: () => void uploadLogo().then((id) => { if (id) apply('Panel Logo', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) a.logoId = id }) }) },
          ...(acc.logoId ? [{ label: 'Remove Logo', onClick: () => apply('Remove Logo', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) delete a.logoId }) }] : []),
          'sep' as const] : []),
        ...(acc.half ? [{ label: `Move to ${acc.half === 'left' ? 'Right' : 'Left'} Half`, disabled: !canSwap, onClick: () => apply('Move Half Panel', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) a.half = a.half === 'left' ? 'right' : 'left' }) }, 'sep' as const] : []),
        ...(acc.half ? [] : ACCESSORY_KINDS[acc.kind].heights.map((h) => ({ label: `${h}U${h === acc.height ? ' ✓' : ''}`, onClick: () => apply('Panel Height', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) a.height = h }) }))),
        'sep', { label: 'Remove Panel', danger: true, onClick: remove },
      ]) }}
      title={`${acc.half ? '½ ' : ''}${ACCESSORY_KINDS[acc.kind].name} ${acc.height}U · drag to move · right-click for options · Delete removes`}>
      {logo && <img className="acc-logo" src={logo} alt="" />}
      {(!logo || acc.label?.trim()) && <span className="acc-label">{(logo ? acc.label : label) || (acc.kind === 'logo' ? 'LOGO PANEL – choose an image' : '')}</span>}
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
      <label className="field"><span className="field-label">Mounting depth</span><LenInput value={rack.spec.mountingDepthMM} min={100} onCommit={(v) => upd('Rack Depth', (r) => { r.spec.mountingDepthMM = v ?? 600 })} /></label>
      <label className="field"><span className="field-label">Load rating</span><WtInput value={rack.spec.maxLoadKG} min={1} onCommit={(v) => upd('Rack Load', (r) => { r.spec.maxLoadKG = v ?? 900 })} /></label>
      <label className="field"><span className="field-label">Cooling capacity</span><NumberInput value={rack.spec.coolingCapacityBTU} allowEmpty unit="BTU/hr" onCommit={(v) => upd('Rack Cooling', (r) => { r.spec.coolingCapacityBTU = v })} /></label>
      <button className="danger" onClick={() => { if (confirm(`Delete ${rack.name}? Devices in it become unracked.`)) apply('Delete Rack', (d) => {
        d.racks = d.racks.filter((r) => r.id !== rack.id)
        for (const e of d.equipment) if (e.rackPlacement?.rack === rack.id) e.rackPlacement = null
      }) }}>Delete Rack</button>
    </div>
  )
}

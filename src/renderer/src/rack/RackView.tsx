import { deviceMenu } from '../product/productActions'
import { showContextMenu } from '../components/ContextMenu'
import { memo, useMemo, useState } from 'react'
import { faceSVG, faceProduct, productFace, fmtWt, rackArtSVG, panelSeen, RACK_W_MM, U_MM, nodeGeom, placeInFreeSpace, addEquipment, type EquipmentInstance, type ProductDefinition } from '@core/index'
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
  const [unitPx, setUnitPx] = useState(40)
  const [heat, setHeat] = useState(false)
  const [printing, setPrinting] = useState(false)

  const unracked = project.equipment.filter((e) => e.product.physical.rackUnits != null && !e.rackPlacement)

  return (
    <div className="rack-view">
      <div className="rack-toolbar">
        <Segmented value={face} onChange={setFace} options={[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }]} />
        <Toggle checked={heat} onChange={setHeat} label="Heat map" />
        <label className="zoom">Zoom <input type="range" min={18} max={90} value={unitPx} onChange={(e) => setUnitPx(+e.target.value)} /></label>
        <span className="muted small">Shift-click to select several · drag one to move them all</span>
        <span className="spacer" />
        <button onClick={() => setPrinting(true)} disabled={!project.racks.length}>Print / Export…</button>
        <button onClick={() => apply('Add Rack', (d) => { addRack(d) })}>+ Add Rack</button>
      </div>
      <div className="panel-palette" title="Drag a panel into a rack">
        <span className="muted small">Panels:</span>
        {PALETTE.map(([kind, h]) => (
          <div key={`${kind}${h}`} className={`palette-chip acc-${kind}`} draggable
            onDragStart={(ev) => { const s = JSON.stringify({ kind: 'rack-acc', acc: kind, height: h } satisfies DragPayload); dragCache = s; ev.dataTransfer.setData(DRAG_MIME, s) }}>
            {ACCESSORY_KINDS[kind].name} {h}U
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
  const [ghosts, setGhosts] = useState<{ start: number; height: number; ok: boolean }[] | null>(null)
  const [picker, setPicker] = useState<number | null>(null)
  if (!layout) return null

  const total = rack.spec.rackUnits
  const bodyW = Math.round(unitPx * RACK_W_MM / U_MM), rail = 26
  const yOf = (high: number) => (total - high) * unitPx
  const selAcc = useStore((s) => s.selectedAccessory)
  const logos = project.logos ?? []
  const fill = (between: boolean) => {
    let n = 0
    apply(between ? 'Fill Gaps with Blanks' : 'Fill Rack with Blanks', (d) => { n = fillWithBlanks(d, rack.id, face, { onlyBetween: between }) })
    useStore.getState().notify(n ? `Added ${n} blank panel${n === 1 ? '' : 's'}` : 'No empty spaces to fill', { undo: !!n })
  }

  type Target = { what: 'multi'; moves: { id: string; start: number; h: number }[]; ok: boolean }
    | { what: 'eq'; id: EquipmentId; h: number; start: number | null; slot?: 'left' | 'right' | null } | { what: 'acc'; acc: AccessoryKind; h: number; start: number | null } | { what: 'move'; id: string; from: string; h: number; start: number | null }
  const dragTarget = (e: React.DragEvent): Target | null => {
    const raw = e.dataTransfer.getData(DRAG_MIME) || dragCache
    if (!raw) return null
    const p = JSON.parse(raw) as DragPayload
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const unitAtCursor = total - Math.floor((e.clientY - rect.top) / unitPx)
    const at = (h: number, depth: number, ignoring?: { kind: 'equipment'; id: EquipmentId } | { kind: 'accessory'; id: string }) =>
      layout.nearestFreeStart(h, depth, Math.max(1, unitAtCursor - h + 1), face, ignoring)
    if (p.kind === 'rack-eq-multi') {
      // Move a group: keep their spacing, anchored on the one being dragged; slide the group to the nearest spot where all fit.
      const items = p.ids.map((id) => project.equipment.find((x) => x.id === id)).filter((x): x is EquipmentInstance => !!x?.product.physical.rackUnits)
      if (!items.length) return null
      const anchor = items.find((x) => x.id === p.anchor) ?? items[0]
      const lowOf = (x: EquipmentInstance) => (x.rackPlacement?.rack === rack.id || x.rackPlacement ? x.rackPlacement!.startUnit : 0)
      const placedLow = Object.fromEntries(items.map((x) => [x.id, lowOf(x)]))
      // Unracked members stack under the anchor in selection order.
      let stack = 0
      for (const x of items) if (!x.rackPlacement) { stack -= x.product.physical.rackUnits!; placedLow[x.id] = lowOf(anchor) + stack }
      const want = Math.max(1, unitAtCursor - anchor.product.physical.rackUnits! + 1)
      const plan = (start: number) => items.map((x) => ({ id: x.id, height: x.product.physical.rackUnits!, depthMM: x.product.physical.depthMM, start: start + (placedLow[x.id] - placedLow[anchor.id]), halfSlot: x.rackPlacement?.halfSlot ?? null }))
      for (let k = 0; k <= total; k++) for (const s of k ? [want - k, want + k] : [want]) {
        const pl = plan(s)
        if (layout.canPlaceGroup(pl, face)) return { what: 'multi', ok: true, moves: pl.map((m) => ({ id: m.id, start: m.start, h: m.height })) }
      }
      return { what: 'multi', ok: false, moves: plan(want).map((m) => ({ id: m.id, start: m.start, h: m.height })) }
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
    if (p.kind === 'rack-acc') return { what: 'acc', acc: p.acc, h: p.height, start: at(p.height, ACCESSORY_KINDS[p.acc].depthMM) }
    if (p.kind === 'rack-acc-move') {
      const src = project.racks.find((r) => r.id === p.rack)?.accessories.find((a) => a.id === p.id)
      if (!src) return null
      return { what: 'move', id: p.id, from: p.rack, h: src.height, start: at(src.height, ACCESSORY_KINDS[src.kind]?.depthMM ?? 25, p.rack === rack.id ? { kind: 'accessory', id: p.id } : undefined) }
    }
    return null
  }

  // From either side you see every device (its front or its back); panels only on their own side (or deep ones).
  const occupants = (() => {
    const mine = layout.occupants.filter((o) => o.face === face || o.depthMM > rack.spec.mountingDepthMM * 0.8)
    const behind = layout.occupants.filter((o) => o.ref.kind === 'equipment' && !mine.includes(o) && !mine.some((m) => m.low <= o.high && o.low <= m.high && (!m.halfSlot || !o.halfSlot || m.halfSlot === o.halfSlot)))
    return [...mine, ...behind]
  })()
  // Units free on this face (for the ＋ add buttons).
  const covered = new Set<number>()
  for (const o of occupants) for (let u = o.low; u <= o.high; u++) covered.add(u)
  const freeUnits = Array.from({ length: total }, (_, i) => i + 1).filter((u) => !covered.has(u))
  // Wired ports (dark), and the ports at either end of the selected devices' cables (highlighted).
  const selSet = new Set(selection as string[])
  const cabled = new Map<string, Map<string, string>>(), hot = new Map<string, Set<string>>()
  const mark = (eq: string, port: string, color: string, lit: boolean) => {
    if (!cabled.has(eq)) cabled.set(eq, new Map())
    cabled.get(eq)!.set(port, color)
    if (lit) { if (!hot.has(eq)) hot.set(eq, new Set()); hot.get(eq)!.add(port) }
  }
  for (const c of project.cables) {
    const lit = selSet.has(c.from.equipment) || selSet.has(c.to.equipment)
    mark(c.from.equipment, c.from.port, c.color ?? '', lit); mark(c.to.equipment, c.to.port, c.color ?? '', lit)
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
        style={{ width: bodyW + 2 * rail, height: total * unitPx, }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return
          e.preventDefault()
          const t = dragTarget(e)
          if (t?.what === 'multi') { setGhost(null); setGhosts(t.moves.map((m) => ({ start: m.start, height: m.h, ok: t.ok }))); return }
          setGhosts(null)
          setGhost(t ? { start: t.start ?? 1, height: t.h, ok: t.start != null, slot: t.what === 'eq' ? t.slot : null } : null)
        }}
        onDragLeave={() => { setGhost(null); setGhosts(null) }}
        onDrop={(e) => {
          const t = dragTarget(e)
          setGhost(null); setGhosts(null)
          dragCache = ''
          if (t?.what === 'multi') {
            if (!t.ok) return
            e.preventDefault()
            apply(`Move ${t.moves.length} Devices`, (d) => { for (const m of t.moves) { const eq = d.equipment.find((x) => x.id === m.id); if (eq) eq.rackPlacement = { rack: rack.id, startUnit: m.start, face, ...(eq.rackPlacement?.halfSlot ? { halfSlot: eq.rackPlacement.halfSlot } : {}) } } })
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
            apply(`Add ${ACCESSORY_KINDS[t.acc].name}`, (d) => { added = addAccessory(d, rack.id, t.acc, t.h, t.start!, face, t.acc === 'logo' && logos[0] ? { logoId: logos[0].id } : {}) })
            if (added) setState({ selectedAccessory: { rack: rack.id, id: (added as RackAccessory).id }, selection: [], selectedCable: null, showInspector: true })
          } else apply('Move Panel', (d) => {
            const from = d.racks.find((r) => r.id === t.from), to = d.racks.find((r) => r.id === rack.id)
            const a = from?.accessories.find((x) => x.id === t.id)
            if (!from || !to || !a) return
            from.accessories = from.accessories.filter((x) => x.id !== t.id)
            to.accessories.push({ ...a, startUnit: t.start!, face })
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
          if (acc) return <AccessoryItem key={`acc:${acc.id}`} rack={rack} acc={acc} other={other} selected={selAcc?.id === acc.id}
            style={{ top: yOf(o.high), height: (o.high - o.low + 1) * unitPx - 1, left: rail, width: bodyW }} logo={logos.find((l) => l.id === acc.logoId)?.dataUrl} />
          const selected = id != null && selection.includes(id)
          const height = (o.high - o.low + 1) * unitPx - 1
          return (
            <div key={`${o.ref.kind}:${o.ref.id}`}
              className={`rack-item ${other && o.ref.kind !== 'equipment' ? 'other-face' : ''} ${selected ? 'selected' : ''} ${o.ref.kind}`}
              style={{ top: yOf(o.high), height, left: rail + (o.halfSlot === 'right' ? bodyW / 2 : 0), width: o.halfSlot ? bodyW / 2 : bodyW }}
              draggable={id != null}
              onDragStart={(e) => {
                if (!id) return
                const sel = useStore.getState().selection
                const group = sel.includes(id) && sel.length > 1 ? sel.filter((x) => project.equipment.find((q) => q.id === x)?.product.physical.rackUnits) : []
                const s = JSON.stringify(group.length > 1 ? { kind: 'rack-eq-multi', ids: group, anchor: id } satisfies DragPayload : { kind: 'rack-eq', id } satisfies DragPayload)
                dragCache = s; e.dataTransfer.setData(DRAG_MIME, s)
              }}
              onClick={(e) => {
                if (!id) return
                // Shift / ⌘-click adds or removes it from the selection.
                if (e.shiftKey || e.metaKey) { const cur = useStore.getState().selection; select(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) }
                else select([id])
              }}
              onContextMenu={(e) => { if (!id) return; if (!useStore.getState().selection.includes(id)) select([id]); showContextMenu(e, [...deviceMenu(id), 'sep', ...(o.halfSlot ? [{ label: `Move to ${o.halfSlot === 'left' ? 'Right' : 'Left'} Half`, disabled: !layout.canPlace(o.high - o.low + 1, o.depthMM, o.low, o.face, o.ref, o.halfSlot === 'left' ? 'right' : 'left'), onClick: () => apply('Move Half-Rack Unit', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.halfSlot = o.halfSlot === 'left' ? 'right' : 'left' }) }] : []), { label: 'Flip Front/Rear', onClick: () => apply('Flip Mount Face', (d) => { const eq = d.equipment.find((x) => x.id === id); if (eq?.rackPlacement) eq.rackPlacement.face = eq.rackPlacement.face === 'front' ? 'rear' : 'front' }) }]) }}
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
              {(() => {
                const eq = id ? project.equipment.find((e) => e.id === id) : undefined
                if (!eq) return <><b>{o.name}</b></>
                const panel = panelSeen(eq, face)
                const f = !o.halfSlot && panel === 'front' ? productFace(eq.product) : null
                if (f?.rack) return <><div className="rack-face" dangerouslySetInnerHTML={{ __html: faceSVG(faceProduct(eq), { pad: 0, stretch: true, bare: true }) }} /><span className="rack-tag">{o.name}</span></>
                return <RackArt eq={eq} panel={panel} heightU={o.high - o.low + 1} half={!!o.halfSlot} cabled={cabled.get(eq.id)} hot={hot.get(eq.id)} />
              })()}
              {other && o.ref.kind !== 'equipment' && <span className="face-tag">{o.face}</span>}
            </div>
          )
        })}
        {ghosts && ghosts.map((g, i) => <div key={i} className={`rack-ghost ${g.ok ? '' : 'bad'}`} style={{ top: yOf(g.start + g.height - 1), height: g.height * unitPx, left: rail, width: bodyW }} />)}
        {freeUnits.map((u) => (
          <button key={`plus${u}`} className="rack-plus" style={{ top: yOf(u), height: unitPx, left: rail, width: bodyW }} title={`Add a device at U${u}`}
            onClick={(e) => { e.stopPropagation(); setPicker(u) }}>＋</button>
        ))}
        {picker != null && <AddPicker rack={rack} unit={picker} face={face} layout={layout} top={Math.max(0, Math.min(yOf(picker) + unitPx, total * unitPx - 300))} left={rail + 20} onClose={() => setPicker(null)} />}
        {ghost && <div className={`rack-ghost ${ghost.ok ? '' : 'bad'}`} style={{ top: yOf(ghost.start + ghost.height - 1), height: ghost.height * unitPx, left: rail + (ghost.slot === 'right' ? bodyW / 2 : 0), width: ghost.slot ? bodyW / 2 : bodyW }} />}
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

const PALETTE: [AccessoryKind, number][] = [['blank', 1], ['blank', 2], ['logo', 1], ['logo', 2], ['brush', 1], ['vent', 1], ['lacing', 1], ['shelf', 2], ['drawer', 2]]

function AccessoryItem({ rack, acc, other, selected, style, logo }: { rack: Rack; acc: RackAccessory; other: boolean; selected: boolean; style: React.CSSProperties; logo?: string }) {
  const apply = useStore((s) => s.apply)
  const setState = useStore((s) => s.set)
  const remove = () => { apply(`Remove ${ACCESSORY_KINDS[acc.kind].name}`, (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.accessories = r.accessories.filter((a) => a.id !== acc.id) }); setState({ selectedAccessory: null }) }
  const selectMe = () => setState({ selectedAccessory: { rack: rack.id, id: acc.id }, selection: [], selectedCable: null, showInspector: true })
  const label = accessoryLabel(acc)
  return (
    <div className={`rack-item accessory acc-${acc.kind} finish-${acc.finish ?? 'black'} ${other ? 'other-face' : ''} ${selected ? 'selected' : ''}`} style={style} tabIndex={0}
      draggable={!other} onDragStart={(e) => { const s = JSON.stringify({ kind: 'rack-acc-move', rack: rack.id, id: acc.id } satisfies DragPayload); dragCache = s; e.dataTransfer.setData(DRAG_MIME, s) }}
      onClick={selectMe}
      onKeyDown={(e) => { if (e.key === 'Backspace' || e.key === 'Delete') { e.stopPropagation(); remove() } }}
      onContextMenu={(e) => { selectMe(); showContextMenu(e, [
        ...(canHaveLogo(acc.kind) ? [
          { label: acc.logoId ? 'Change Logo…' : 'Add Logo…', onClick: () => void uploadLogo().then((id) => { if (id) apply('Panel Logo', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) a.logoId = id }) }) },
          ...(acc.logoId ? [{ label: 'Remove Logo', onClick: () => apply('Remove Logo', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) delete a.logoId }) }] : []),
          'sep' as const] : []),
        ...ACCESSORY_KINDS[acc.kind].heights.map((h) => ({ label: `${h}U${h === acc.height ? ' ✓' : ''}`, onClick: () => apply('Panel Height', (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) a.height = h }) })),
        'sep', { label: 'Remove Panel', danger: true, onClick: remove },
      ]) }}
      title={`${ACCESSORY_KINDS[acc.kind].name} ${acc.height}U · drag to move · right-click for options · Delete removes`}>
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

/** A racked device drawn as the real unit (see core/rackart). Memoised – redrawn only when its cabling or selection changes. */
const RackArt = memo(function RackArt({ eq, panel, heightU, half, cabled, hot }: { eq: EquipmentInstance; panel: RackFace; heightU: number; half: boolean; cabled?: Map<string, string>; hot?: Set<string> }) {
  const html = rackArtSVG(eq, panel, { cabled: cabled ?? new Map(), hot: hot ?? new Set(), heightU, half, uid: `${eq.id}${panel}` })
  return <div className="rack-art" dangerouslySetInnerHTML={{ __html: html }} />
}, (a, b) => a.eq === b.eq && a.panel === b.panel && a.heightU === b.heightU && a.half === b.half && sameMap(a.cabled, b.cabled) && sameSet(a.hot, b.hot))
const sameMap = (a?: Map<string, string>, b?: Map<string, string>) => (a?.size ?? 0) === (b?.size ?? 0) && [...(a ?? [])].every(([k, v]) => b?.get(k) === v)
const sameSet = (a?: Set<string>, b?: Set<string>) => (a?.size ?? 0) === (b?.size ?? 0) && [...(a ?? [])].every((k) => b?.has(k))

/** ＋ on an empty unit: rack a device that's already in the project, or add a new one from the library here. */
function AddPicker({ rack, unit, face, layout, top, left, onClose }: { rack: Rack; unit: number; face: RackFace; layout: RackLayout; top: number; left: number; onClose: () => void }) {
  const project = useStore((s) => s.project)
  const library = useStore((s) => s.library)
  const apply = useStore((s) => s.apply)
  const [q, setQ] = useState('')
  const fits = (h: number, depth: number) => layout.canPlace(h, depth, unit, face) ? unit : layout.canPlace(h, depth, unit - h + 1, face) ? unit - h + 1 : null
  const ql = q.toLowerCase()
  const unracked = project.equipment.filter((e) => e.product.physical.rackUnits && !e.rackPlacement && fits(e.product.physical.rackUnits, e.product.physical.depthMM) != null)
    .filter((e) => !ql || `${e.tag} ${e.product.manufacturer} ${e.product.model}`.toLowerCase().includes(ql))
  const lib = ql.length < 2 ? [] : library.products.filter((p) => p.physical.rackUnits && !p.plate && p.category !== 'patchBay' && `${p.manufacturer} ${p.model}`.toLowerCase().includes(ql)).slice(0, 30)
  const place = (id: string, h: number, depth: number) => apply('Place in Rack', (d) => { const eq = d.equipment.find((x) => x.id === id); const st = fits(h, depth); if (eq && st != null) eq.rackPlacement = { rack: rack.id, startUnit: st, face } })
  const addNew = (p: ProductDefinition) => {
    const st = fits(p.physical.rackUnits!, p.physical.depthMM)
    if (st == null) { useStore.getState().notify(`${p.model} (${p.physical.rackUnits}U) doesn’t fit at U${unit}`, { kind: 'warning' }); return }
    let tag = '', id = ''
    apply(`Add ${p.model}`, (d) => { const e = addEquipment(d, p, { x: 0, y: 0 }); placeInFreeSpace(d, e.id, nodeGeom); e.rackPlacement = { rack: rack.id, startUnit: st, face }; tag = e.tag; id = e.id })
    if (id) { useStore.getState().select([id as EquipmentId]); useStore.getState().notify(`Added ${tag} at U${st} (also on the Wiring Diagram)`, { undo: true, kind: 'success' }) }
    onClose()
  }
  return (
    <div className="rack-picker" style={{ top, left }} onClick={(e) => e.stopPropagation()}>
      <div className="rack-picker-head"><b>Add at U{unit}</b><button className="link" onClick={onClose}>✕</button></div>
      <input autoFocus placeholder="Search devices or library…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }} />
      <div className="rack-picker-list">
        {unracked.length > 0 && <h5>In this project, not racked</h5>}
        {unracked.map((e) => <button key={e.id} onClick={() => { place(e.id, e.product.physical.rackUnits!, e.product.physical.depthMM); onClose() }}><b>{e.tag}</b> <span className="muted">{e.product.model} · {e.product.physical.rackUnits}U</span></button>)}
        {lib.length > 0 && <h5>From the library</h5>}
        {lib.map((p) => <button key={p.key} onClick={() => addNew(p)}><b>{p.manufacturer}</b> <span>{p.model}</span> <span className="muted">· {p.physical.rackUnits}U</span></button>)}
        {!unracked.length && ql.length < 2 && <p className="muted small">Type to search the library.</p>}
        {ql.length >= 2 && !lib.length && !unracked.length && <p className="muted small">No rack gear matches.</p>}
      </div>
    </div>
  )
}


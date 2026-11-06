import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultFabrication, fabricationNotes, fabricationSheets, finishOf, makePlateProduct, newPlateSpec, withLayout, type EquipmentInstance, type PlateKind } from '@core/index'
import { Slide } from '../slide'
import { useStore } from '../store'
import { Empty, Field, TextInput } from '../components/ui'
import { showContextMenu } from '../components/ContextMenu'
import { editPlacedDevice } from '../product/openEditor'
import { openExport } from '../print/ExportAllDialog'

const KINDS: { kind: PlateKind; label: string; model: string }[] = [
  { kind: 'wallBox', label: 'Wall Boxes', model: 'Wall Box' },
  { kind: 'wallPlate', label: 'Gang Plates', model: 'Wall Plate' },
  { kind: 'floorBox', label: 'Floor Boxes & Pockets', model: 'Floor Box' },
  { kind: 'rackPanel', label: 'Rack Connector Panels', model: 'Connector Panel' },
]
const NONE: EquipmentInstance[] = []
const newBox = (kind: PlateKind, model: string) => useStore.getState().set({ editingPlate: { product: makePlateProduct(newPlateSpec(kind), { model }), instanceId: null } })

/**
 * Wall Boxes: every box, plate and connector panel in the project – its
 * fabrication sheet shown as the page that gets sent out, and that box's own
 * notes, fully editable, on the right.
 */
export function BoxesView() {
  const equipment = useStore((s) => s.project.equipment ?? NONE)
  const boxes = useMemo(() => equipment.filter((e) => e.product.plate && !e.product.fiber)
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })), [equipment])
  const selectedBox = useStore((s) => s.selectedBox)
  const selection = useStore((s) => s.selection)
  const set = useStore((s) => s.set)
  const showList = useStore((s) => s.showSidebar)
  const showNotes = useStore((s) => s.showInspector)
  const peek = useStore((s) => s.peek)
  const [q, setQ] = useState('')

  // A box just created (or picked elsewhere) becomes the one shown.
  useEffect(() => {
    const id = selection[0]
    if (id && id !== selectedBox && boxes.some((b) => b.id === id)) set({ selectedBox: String(id) })
  }, [selection])
  const box = boxes.find((b) => b.id === selectedBox) ?? boxes[0]

  const shown = boxes.filter((b) => !q || `${b.tag} ${b.room} ${b.product.model}`.toLowerCase().includes(q.toLowerCase()))
  const newMenu = (e: React.MouseEvent) => showContextMenu(e, KINDS.map((k) => ({ label: `${k.model}…`, onClick: () => newBox(k.kind, k.model) })))

  return (
    <div className={`boxes-view ${showList ? '' : 'no-list'} ${showNotes && box ? '' : 'no-settings'}`}>
      <Slide open={showList || peek === 'left'} side="left"><aside className={`led-list boxes-list ${showList ? '' : 'peek'}`}>
        <div className="led-list-head">
          <h3>Boxes &amp; Panels</h3>
          <button className="primary mini" onClick={newMenu}>＋ New ▾</button>
        </div>
        {boxes.length > 0 && <input className="boxes-search" type="search" placeholder="Find a box…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {boxes.length === 0 && <p className="muted small" style={{ padding: '0 12px' }}>No boxes yet.</p>}
        {KINDS.map((k) => {
          const list = shown.filter((b) => b.product.plate!.kind === k.kind)
          if (!list.length) return null
          return (
            <section key={k.kind}>
              <h5 className="boxes-group">{k.label}</h5>
              {list.map((b) => {
                const L = withLayout(b.product.plate!).layout!
                return (
                  <button key={b.id} className={`led-list-item ${b.id === box?.id ? 'on' : ''}`} onClick={() => set({ selectedBox: b.id, selection: [b.id] })}
                    onDoubleClick={() => editPlacedDevice(b.id)}>
                    <b>{b.tag}{b.fabNotes ? <span className="boxes-dot" title="Custom notes" /> : null}</b>
                    <span className="muted small">{b.room?.trim() || 'No location set'}</span>
                    <span className="muted small">{b.product.plate!.style} · {finishOf(L.finish).label}</span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </aside></Slide>

      {!box ? (
        <div className="led-canvas">
          <Empty title="Design a wall box">
            <p>Lay out connectors on a wall box, plate, floor box or rack panel. Each one gets a fabrication sheet you can send to your fabricator, with notes you control.</p>
            <button className="primary" onClick={newMenu}>＋ New Box ▾</button>
          </Empty>
        </div>
      ) : <Paper box={box} />}

      {box && <Slide open={showNotes || peek === 'right'} side="right"><NotesPanel key={box.id} box={box} floating={!showNotes} /></Slide>}
    </div>
  )
}

/** The fabrication sheet, as the PDF will look: paper on a grey desk, zoom and pan. */
function Paper({ box }: { box: EquipmentInstance }) {
  const project = useStore((s) => s.project)
  const svg = useMemo(() => {
    try { return fabricationSheets(project, { ...defaultFabrication(), only: [box.id] })[0] ?? '' } catch (e) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 20"><text x="4" y="12" font-size="6">Couldn’t draw this box: ${String(e).replace(/</g, '')}</text></svg>` }
  }, [project, box.id])
  const [zoom, setZoom] = useState(1)
  const desk = useRef<HTMLDivElement>(null)
  useEffect(() => setZoom(1), [box.id])
  // "Fit" shows the whole page: as wide as the desk allows without running past its height.
  const [fitW, setFitW] = useState(0)
  const aspect = useMemo(() => { const m = /viewBox="[\d.\s-]*?\s([\d.]+)\s([\d.]+)"/.exec(svg); return m ? Number(m[1]) / Number(m[2]) : 17 / 11 }, [svg])
  useEffect(() => {
    const el = desk.current
    if (!el) return
    const fit = () => setFitW(Math.max(200, Math.min(el.clientWidth - 48, (el.clientHeight - 48) * aspect)))
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])
  const set = useStore((s) => s.set)
  return (
    <div className="led-canvas boxes-canvas">
      <div className="led-bar">
        <b>{box.tag}</b>
        <span className="muted small">{box.room?.trim() ? `Install at ${box.room.trim()}` : 'No location set – add one in Notes'}</span>
        <span className="spacer" />
        <button onClick={() => editPlacedDevice(box.id)}>Edit Box…</button>
        <button onClick={() => set({ mode: 'diagram', selection: [box.id] })}>Show in Diagram</button>
        <button onClick={() => openExport()}>Export…</button>
        <span className="pd-group"><button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</button><button onClick={() => setZoom(1)}>Fit</button><button onClick={() => setZoom((z) => Math.min(5, z * 1.25))}>+</button></span>
      </div>
      <div className="boxes-desk" ref={desk}>
        <div className="boxes-paper" style={{ width: fitW ? fitW * zoom : '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  )
}

/** This box's notes: start from the automatic ones, then change, add, reorder or remove any line. */
function NotesPanel({ box, floating }: { box: EquipmentInstance; floating: boolean }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const auto = useMemo(() => fabricationNotes(project, box.id), [project, box.id])
  const custom = box.fabNotes
  const notes = custom ?? auto
  const edit = (label: string, fn: (list: string[]) => string[]) => apply(label, (d) => {
    const e = d.equipment.find((x) => x.id === box.id)
    if (e) e.fabNotes = fn([...(e.fabNotes ?? auto)])
  })
  const move = (i: number, by: number) => edit('Move Note', (l) => { const [x] = l.splice(i, 1); l.splice(i + by, 0, x); return l })
  return (
    <aside className={`led-settings boxes-notes ${floating ? 'peek' : ''}`}>
      <h4>Location</h4>
      <TextInput value={box.room ?? ''} placeholder="Room / wall, e.g. Studio A – north wall, 18&quot; AFF" onCommit={(v) => apply('Box Location', (d) => { const e = d.equipment.find((x) => x.id === box.id); if (e) e.room = v })} />
      <div className="boxes-notes-head">
        <h4>Notes</h4>
        <span className={`badge ${custom ? 'on' : ''}`}>{custom ? 'Custom' : 'Automatic'}</span>
      </div>
      <Field label="Heading">
        <TextInput value={box.fabNotesTitle ?? ''} placeholder="NOTES" onCommit={(v) => apply('Notes Heading', (d) => { const e = d.equipment.find((x) => x.id === box.id); if (e) e.fabNotesTitle = v.trim() || undefined })} />
      </Field>
      <p className="muted small">{custom ? 'These notes print on this box’s sheet only.' : 'Generated from the box. Edit any line to make the notes this box’s own – they then stay as you write them.'}</p>
      <ol className="boxes-note-list">
        {notes.map((t, i) => (
          <li key={`${i}:${notes.length}`}>
            <span className="boxes-note-n">{i + 1}</span>
            <TextInput multiline className="boxes-note" value={t} onCommit={(v) => edit('Edit Note', (l) => { l[i] = v; return l })} />
            <span className="boxes-note-tools">
              <button className="mini" disabled={i === 0} title="Move up" onClick={() => move(i, -1)}>↑</button>
              <button className="mini" disabled={i === notes.length - 1} title="Move down" onClick={() => move(i, 1)}>↓</button>
              <button className="mini danger" title="Remove" onClick={() => edit('Remove Note', (l) => { l.splice(i, 1); return l })}>✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row-gap">
        <button onClick={() => edit('Add Note', (l) => [...l, 'NEW NOTE'])}>＋ Add Note</button>
        {custom && <button onClick={() => apply('Automatic Notes', (d) => { const e = d.equipment.find((x) => x.id === box.id); if (e) { delete e.fabNotes; delete e.fabNotesTitle } })}>Reset to Automatic</button>}
      </div>
      {custom && <p className="muted small">Placement warnings (a connector past the edge) are still added automatically.</p>}
    </aside>
  )
}

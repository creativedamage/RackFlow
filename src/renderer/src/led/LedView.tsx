import { Slide } from '../slide'
import { useCallback, useMemo, useState } from 'react'
import { LED_PANELS, PROCESSOR_PRESETS, derivePanel, defaultLedPrint, ledMapSVG, ledSheets, wallSources, newLedPanel, newLedWall, nodeGeom, placeInFreeSpace, syncLedWallDevice, wallStats, chains, chainColor, type ChainSettings, type Corner, type LedPanel, type LedPrintOptions, type LedView as View, type LedWall, fmtFtIn, fmtWt, fmtLenPair } from '@core/index'
import { useStore } from '../store'
import { Empty, Field, Modal, NumberInput, Segmented, Select, TextInput, Toggle, LenInput, WtInput } from '../components/ui'
import { DrawingDialog } from '../print/DrawingDialog'
import { viewCenterNow } from '../diagram/placement'

const NO_WALLS: LedWall[] = []
const NO_PANELS: LedPanel[] = []

/** Adds a wall from a panel and selects it. Shared with the library's LED wall card. */
export function createLedWall(panel: LedPanel, cols = 8, rows = 4) {
  let id = ''
  useStore.getState().apply('New LED Wall', (d) => { id = newLedWall(d, panel, cols, rows).id })
  useStore.getState().set({ mode: 'led', selectedLedWall: id })
}

const CORNERS: { value: Corner; label: string }[] = [
  { value: 'bottomLeft', label: 'Bottom left' }, { value: 'bottomRight', label: 'Bottom right' },
  { value: 'topLeft', label: 'Top left' }, { value: 'topRight', label: 'Top right' },
]

/**
 * LED wall mapping: wall list on the left, the map in the middle (Data or
 * Power flow, click a panel to take it out / put it back), settings & stats on
 * the right.
 */
export function LedView() {
  const walls = useStore((s) => s.project.ledWalls ?? NO_WALLS)
  const sel = useStore((s) => s.selectedLedWall)
  const set = useStore((s) => s.set)
  const showList = useStore((s) => s.showSidebar)
  const showSettings = useStore((s) => s.showInspector)
  const peek = useStore((s) => s.peek)
  const apply = useStore((s) => s.apply)
  const [view, setView] = useState<View>('data')
  const picking = useStore((s) => s.ledPicking)
  const setPicking = (v: boolean) => set({ ledPicking: v })
  const [printing, setPrinting] = useState(false)
  const wall = walls.find((w) => w.id === sel) ?? walls[0]

  const update = (label: string, fn: (w: LedWall) => void) => apply(label, (d) => {
    const w = d.ledWalls?.find((x) => x.id === wall!.id)
    if (!w) return
    fn(w)
    // Keep the wiring-diagram device's ports in step with the chain counts.
    if (w.equipmentId && d.equipment.some((e) => e.id === w.equipmentId)) syncLedWallDevice(d, w.id)
  })

  return (
    <div className={`led-view ${showList ? '' : 'no-list'} ${showSettings && wall ? '' : 'no-settings'}`}>
      <Slide open={showList || peek === 'left'} side="left"><aside className={`led-list ${showList ? '' : 'peek'}`}>
        <div className="led-list-head">
          <h3>LED Walls</h3>
          <button className="primary mini" onClick={() => setPicking(true)}>＋ New Wall</button>
        </div>
        {walls.length === 0 && <p className="muted small" style={{ padding: '0 12px' }}>No LED walls yet.</p>}
        {walls.map((w) => {
          const st = wallStats(w)
          return (
            <button key={w.id} className={`led-list-item ${w.id === wall?.id ? 'on' : ''}`} onClick={() => set({ selectedLedWall: w.id })}>
              <b>{w.name}</b>
              <span className="muted small">{w.panel.manufacturer} {w.panel.model}</span>
              <span className="muted small">{w.cols}×{w.rows} · {st.pxW}×{st.pxH} px · {st.dataPorts} ports · {st.circuits} circuits</span>
            </button>
          )
        })}
      </aside></Slide>

      {!wall ? (
        <div className="led-canvas">
          <Empty title="Map an LED wall">
            <p>Pick a panel from popular makers (ROE, Absen, INFiLED, Unilumin…) or build your own, set the grid, and RackFlow lays out the data and power runs from the home-run corner.</p>
            <button className="primary" onClick={() => setPicking(true)}>＋ New LED Wall…</button>
          </Empty>
        </div>
      ) : (<>
        <Canvas wall={wall} view={view} setView={setView} onToggle={(k) => update('Toggle Panel', (w) => {
          w.removed = w.removed.includes(k) ? w.removed.filter((x) => x !== k) : [...w.removed, k]
        })} onPrint={() => setPrinting(true)} />
        <Slide open={showSettings || peek === 'right'} side="right"><Settings wall={wall} view={view} update={update} peek={!showSettings} /></Slide>
      </>)}

      {picking && <PanelPicker onClose={() => setPicking(false)} onPick={(p, c, r) => { setPicking(false); createLedWall(p, c, r) }} />}
      {printing && <LedPrintDialog onClose={() => setPrinting(false)} wallId={wall?.id} />}
    </div>
  )
}

function Canvas({ wall, view, setView, onToggle, onPrint }: { wall: LedWall; view: View; setView: (v: View) => void; onToggle: (k: string) => void; onPrint: () => void }) {
  const [editShape, setEditShape] = useState(false)
  // Processor output / distro outlet feeding each chain, from the wiring diagram.
  const project = useStore((s) => s.project)
  const sources = useMemo(() => wallSources(project, wall, view), [project, wall, view])
  const svg = useMemo(() => ledMapSVG(wall, view, { showRemoved: true, interactive: editShape, sources }), [wall, view, editShape, sources])
  const cs = useMemo(() => chains(wall, view), [wall, view])
  return (
    <section className="led-canvas">
      <div className="led-bar">
        <Segmented<View> value={view} onChange={setView} options={[
          { value: 'data', label: 'Data Flow', title: 'Processor outputs → panels' },
          { value: 'power', label: 'Power Flow', title: 'Circuits → panels' },
        ]} />
        <Toggle label="Edit shape (click panels)" checked={editShape} onChange={setEditShape} />
        <span className="spacer" />
        <button onClick={onPrint}>Print / Export…</button>
      </div>
      <div className={`led-svg ${editShape ? 'editing' : ''}`}
        onClick={(e) => {
          if (!editShape) return
          const k = (e.target as Element).closest('[data-cell]')?.getAttribute('data-cell')
          if (k) onToggle(k)
        }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="led-legend">
        {cs.map((c) => (
          <span key={c.index} className="led-chip" style={{ ['--c' as string]: chainColor(view, c.index) }}>
            {view === 'data' ? 'Port' : 'Circuit'} {c.index}: {c.cells.length} panel{c.cells.length === 1 ? '' : 's'}{sources.get(c.index) ? ` ◂ ${sources.get(c.index)}` : ''}
          </span>
        ))}
        <span className="muted small">Dashed line + tag = home run (where the cable from the {view === 'data' ? 'processor' : 'distro'} lands).{sources.size < cs.length ? ` Wire the wall’s ${view === 'data' ? 'Data' : 'Power'} inputs on the Wiring Diagram to show what feeds each one.` : ''}</span>
      </div>
    </section>
  )
}

function ChainFields({ s, onChange, limit, kind }: { s: ChainSettings; onChange: (p: Partial<ChainSettings>) => void; limit: number; kind: string }) {
  return (<>
    <Field label="Home run"><Select<Corner> value={s.start} options={CORNERS} onChange={(start) => onChange({ start })} /></Field>
    <Field label="Runs"><Segmented value={s.direction} onChange={(direction) => onChange({ direction })} options={[{ value: 'vertical', label: 'Columns' }, { value: 'horizontal', label: 'Rows' }]} /></Field>
    <Field label="Pattern"><Segmented value={s.pattern} onChange={(pattern) => onChange({ pattern })} options={[{ value: 'snake', label: 'Snake', title: 'Back and forth (serpentine)' }, { value: 'raster', label: 'Raster', title: 'Every line starts at the same side' }]} /></Field>
    <Field label={`Max / ${kind}`} hint="Leave empty to calculate">
      <NumberInput value={s.maxPanels || null} allowEmpty min={1} onCommit={(v) => onChange({ maxPanels: v ?? undefined })} unit={s.maxPanels ? 'panels' : `auto (${limit})`} width={60} />
    </Field>
  </>)
}

function Settings({ wall, view, update, peek }: { wall: LedWall; view: View; update: (label: string, fn: (w: LedWall) => void) => void; peek?: boolean }) {
  const st = wallStats(wall)
  const apply = useStore((s) => s.apply)
  const set = useStore((s) => s.set)
  const onDiagram = useStore((s) => !!wall.equipmentId && s.project.equipment.some((e) => e.id === wall.equipmentId))
  const [panelEdit, setPanelEdit] = useState(false)
  const preset = PROCESSOR_PRESETS.find((p) => p.px === wall.data.portCapacityPx)?.key ?? 'custom'
  return (
    <aside className={`led-settings form ${peek ? 'peek' : ''}`}>
      <h4>Wall</h4>
      <Field label="Name"><TextInput value={wall.name} onCommit={(v) => update('Rename LED Wall', (w) => { w.name = v || w.name })} /></Field>
      <Field label="Panel">
        <span className="led-panel-name">{wall.panel.manufacturer} {wall.panel.model} <button className="mini" onClick={() => setPanelEdit(true)}>Change…</button></span>
      </Field>
      <Field label="Columns"><NumberInput value={wall.cols} min={1} max={200} onCommit={(v) => update('Wall Size', (w) => { w.cols = v ?? w.cols; w.removed = w.removed.filter((k) => +k.split(',')[0] < w.cols) })} /></Field>
      <Field label="Rows"><NumberInput value={wall.rows} min={1} max={200} onCommit={(v) => update('Wall Size', (w) => { w.rows = v ?? w.rows; w.removed = w.removed.filter((k) => +k.split(',')[1] < w.rows) })} /></Field>
      {wall.removed.length > 0 && <p className="muted small">{wall.removed.length} panel{wall.removed.length === 1 ? '' : 's'} removed · <a href="#" onClick={(e) => { e.preventDefault(); update('Restore Panels', (w) => { w.removed = [] }) }}>restore all</a></p>}

      <h4>Totals</h4>
      <dl className="kv led-stats">
        <dt>Panels</dt><dd>{st.panels}</dd>
        <dt>Resolution</dt><dd>{st.pxW} × {st.pxH} px</dd>
        <dt>Aspect</dt><dd>{st.aspect}</dd>
        <dt>Size</dt><dd>{fmtFtIn(st.widthM)} × {fmtFtIn(st.heightM)}</dd>
        <dt>Weight</dt><dd>{fmtWt(st.weightKG, 0)}</dd>
        <dt>Power</dt><dd>{(st.maxWatts / 1000).toFixed(1)} kW max · {st.maxAmps.toFixed(1)} A</dd>
        <dt>Data ports</dt><dd>{st.dataPorts}</dd>
        <dt>Circuits</dt><dd>{st.circuits}</dd>
      </dl>
      {!wall.panel.verified && <p className="muted small">⚠︎ Panel specs are nominal – check them against the manufacturer’s sheet (Change… → edit).</p>}

      {view === 'data' ? (<>
        <h4>Data</h4>
        <Field label="Processor">
          <Select value={preset} onChange={(k) => { const p = PROCESSOR_PRESETS.find((x) => x.key === k); if (p) update('Processor', (w) => { w.data.portCapacityPx = p.px }) }}
            options={[...PROCESSOR_PRESETS.map((p) => ({ value: p.key, label: p.name })), ...(preset === 'custom' ? [{ value: 'custom', label: 'Custom capacity' }] : [])]} />
        </Field>
        <Field label="Port capacity"><NumberInput value={wall.data.portCapacityPx} step={1000} min={10000} unit="px" width={100} onCommit={(v) => update('Port Capacity', (w) => { w.data.portCapacityPx = v ?? w.data.portCapacityPx })} /></Field>
        <Field label="Frame rate"><Select value={wall.data.frameRate} onChange={(v) => update('Frame Rate', (w) => { w.data.frameRate = v })} options={[24, 25, 30, 50, 60, 120].map((v) => ({ value: v, label: `${v} Hz` }))} /></Field>
        <Field label="Bit depth"><Select value={wall.data.bitDepth} onChange={(v) => update('Bit Depth', (w) => { w.data.bitDepth = v })} options={[8, 10, 12].map((v) => ({ value: v, label: `${v}-bit` }))} /></Field>
        <ChainFields s={wall.data} kind="port" limit={st.dataLimit} onChange={(p) => update('Data Routing', (w) => { Object.assign(w.data, p) })} />
      </>) : (<>
        <h4>Power</h4>
        <Field label="Voltage"><Select value={wall.power.voltage} onChange={(v) => update('Voltage', (w) => { w.power.voltage = v })} options={[100, 110, 120, 208, 220, 230, 240].map((v) => ({ value: v, label: `${v} V` }))} /></Field>
        <Field label="Circuit"><Select value={wall.power.circuitAmps} onChange={(v) => update('Circuit Size', (w) => { w.power.circuitAmps = v })} options={[10, 13, 15, 16, 20, 30, 32].map((v) => ({ value: v, label: `${v} A` }))} /></Field>
        <p className="muted small">Loads each circuit to 80 % with every panel at max draw ({wall.panel.maxWatts} W).</p>
        <ChainFields s={wall.power} kind="circuit" limit={st.powerLimit} onChange={(p) => update('Power Routing', (w) => { Object.assign(w.power, p) })} />
      </>)}

      <h4>Wiring diagram</h4>
      <p className="muted small">Adds the wall as a device with one Data input per port and one Power input per circuit – ports update as you change the wall.</p>
      <div className="row-gap">
        <button className="primary" onClick={() => {
          let eid = ''
          apply(onDiagram ? 'Update LED Wall Device' : 'Add LED Wall to Diagram', (d) => {
            const at = viewCenterNow() ?? { x: 0, y: 0 }
            const e = syncLedWallDevice(d, wall.id, at)
            if (e) { eid = e.id; if (!onDiagram) placeInFreeSpace(d, e.id, nodeGeom) }
          })
          if (eid) set({ mode: 'diagram', selection: [eid as never], selectedCable: null })
        }}>{onDiagram ? 'Show on Wiring Diagram' : 'Add to Wiring Diagram'}</button>
      </div>

      <h4>Notes</h4>
      <TextInput multiline value={wall.notes ?? ''} placeholder="Rigging, processor, spares…" onCommit={(v) => update('Wall Notes', (w) => { w.notes = v || undefined })} />
      <div className="row-gap" style={{ marginTop: 16 }}>
        <button className="danger" onClick={() => {
          if (!confirm(`Delete ${wall.name}?${onDiagram ? ' Its wiring-diagram device and cables are removed too.' : ''}`)) return
          apply('Delete LED Wall', (d) => {
            const w = d.ledWalls?.find((x) => x.id === wall.id)
            d.ledWalls = d.ledWalls?.filter((x) => x.id !== wall.id)
            if (w?.equipmentId) { d.equipment = d.equipment.filter((e) => e.id !== w.equipmentId); d.cables = d.cables.filter((c) => c.from.equipment !== w.equipmentId && c.to.equipment !== w.equipmentId) }
          })
        }}>Delete Wall</button>
      </div>

      {panelEdit && <PanelPicker current={wall.panel} onClose={() => setPanelEdit(false)} onPick={(p) => { setPanelEdit(false); update('Change Panel', (w) => { w.panel = structuredClone(p) }) }} />}
    </aside>
  )
}

/** Choose a panel: catalog (search) + the project's own panels + a custom panel builder. */
export function PanelPicker({ current, onPick, onClose }: { current?: LedPanel; onPick: (p: LedPanel, cols: number, rows: number) => void; onClose: () => void }) {
  const custom = useStore((s) => s.project.ledPanels ?? NO_PANELS)
  const apply = useStore((s) => s.apply)
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<LedPanel | null>(current ?? null)
  const [draft, setDraft] = useState<LedPanel | null>(null)
  const [cols, setCols] = useState(8)
  const [rows, setRows] = useState(4)
  const all = useMemo(() => [...custom, ...LED_PANELS], [custom])
  const list = all.filter((p) => q.trim().split(/\s+/).every((t) => `${p.manufacturer} ${p.model} ${p.pitchMM}`.toLowerCase().includes(t.toLowerCase())))
  const makers = [...new Set(list.map((p) => p.manufacturer))]
  const pick = useCallback((p: LedPanel) => { setChosen(p); setDraft(null) }, [])

  const saveDraft = () => {
    if (!draft) return
    const p = derivePanel({ ...draft, source: 'user', verified: true })
    apply(custom.some((x) => x.key === p.key) ? 'Edit LED Panel' : 'New LED Panel', (d) => {
      const i = (d.ledPanels ?? []).findIndex((x) => x.key === p.key)
      d.ledPanels = d.ledPanels ?? []
      if (i >= 0) d.ledPanels[i] = p; else d.ledPanels.push(p)
    })
    setChosen(p); setDraft(null)
  }

  return (
    <Modal title={current ? 'Change LED Panel' : 'New LED Wall'} onClose={onClose} wide footer={<>
      {!current && chosen && !draft && (<>
        <span>Grid</span>
        <NumberInput value={cols} min={1} max={200} width={56} onCommit={(v) => setCols(v ?? cols)} unit="wide" />
        <NumberInput value={rows} min={1} max={200} width={56} onCommit={(v) => setRows(v ?? rows)} unit="high" />
        <span className="muted small">{fmtFtIn((cols * chosen.widthMM) / 1000)} × {fmtFtIn((rows * chosen.heightMM) / 1000)} · {cols * chosen.pxW}×{rows * chosen.pxH} px</span>
      </>)}
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      {draft
        ? <button className="primary" onClick={saveDraft}>Save Panel</button>
        : <button className="primary" disabled={!chosen} onClick={() => chosen && onPick(chosen, cols, rows)}>{current ? 'Use Panel' : 'Create Wall'}</button>}
    </>}>
      <div className="led-picker">
        <div className="led-picker-list">
          <div className="row-gap">
            <input type="search" autoFocus placeholder="Search maker, model or pitch…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <button onClick={() => setDraft(newLedPanel())}>＋ Custom Panel</button>
          </div>
          {makers.map((m) => (
            <div key={m}>
              <h5>{m}</h5>
              {list.filter((p) => p.manufacturer === m).map((p) => (
                <button key={p.key} className={`led-panel-row ${chosen?.key === p.key && !draft ? 'on' : ''}`} onClick={() => pick(p)} onDoubleClick={() => onPick(p, cols, rows)}>
                  <span>{p.model}{p.source === 'user' && <span className="badge">custom</span>}</span>
                  <span className="muted small">{p.pitchMM} mm · {fmtLenPair(p.widthMM, p.heightMM, 1)} · {p.pxW}×{p.pxH} px · {p.maxWatts} W</span>
                </button>
              ))}
            </div>
          ))}
          {!list.length && <p className="muted">Nothing matches – make a custom panel.</p>}
        </div>
        <div className="led-picker-detail form">
          {draft ? <PanelForm p={draft} onChange={setDraft} />
            : chosen ? (<>
              <h4>{chosen.manufacturer} {chosen.model}</h4>
              <dl className="kv">
                <dt>Pitch</dt><dd>{chosen.pitchMM} mm</dd>
                <dt>Cabinet</dt><dd>{fmtLenPair(chosen.widthMM, chosen.heightMM, 2)}</dd>
                <dt>Pixels</dt><dd>{chosen.pxW} × {chosen.pxH}</dd>
                <dt>Weight</dt><dd>{fmtWt(chosen.weightKG)}</dd>
                <dt>Power</dt><dd>{chosen.maxWatts} W max · {chosen.typWatts} W typ</dd>
                <dt>Data</dt><dd>{chosen.dataConnector === 'rj45' ? 'RJ45' : 'etherCON'}</dd>
                <dt>Power in</dt><dd>{chosen.powerConnector === 'powerCON' ? 'powerCON' : 'powerCON TRUE1'}</dd>
              </dl>
              {!chosen.verified && <p className="muted small">Nominal specs – verify against the manufacturer’s sheet. Use “Edit a copy” to correct them.</p>}
              <div className="row-gap">
                <button onClick={() => setDraft(chosen.source === 'user' ? { ...chosen } : { ...chosen, key: `user.led.${Date.now().toString(36)}`, manufacturer: chosen.manufacturer, model: `${chosen.model} (edited)`, source: 'user' })}>
                  {chosen.source === 'user' ? 'Edit Panel' : 'Edit a copy'}
                </button>
                {chosen.source === 'user' && <button className="danger" onClick={() => { apply('Delete LED Panel', (d) => { d.ledPanels = d.ledPanels?.filter((x) => x.key !== chosen.key) }); setChosen(null) }}>Delete</button>}
              </div>
            </>) : <p className="muted">Pick a panel, or make a custom one if your manufacturer isn’t listed.</p>}
        </div>
      </div>
    </Modal>
  )
}

function PanelForm({ p, onChange }: { p: LedPanel; onChange: (p: LedPanel) => void }) {
  const set = (patch: Partial<LedPanel>) => onChange(derivePanel({ ...p, ...patch }))
  return (<>
    <h4>Custom panel</h4>
    <Field label="Manufacturer"><TextInput value={p.manufacturer} onCommit={(manufacturer) => set({ manufacturer })} /></Field>
    <Field label="Model"><TextInput value={p.model} onCommit={(model) => set({ model })} /></Field>
    <Field label="Pixel pitch"><NumberInput value={p.pitchMM} step={0.01} min={0.5} max={50} unit="mm" onCommit={(v) => set({ pitchMM: v ?? p.pitchMM })} /></Field>
    <Field label="Width"><LenInput value={p.widthMM} min={50} max={3000} onCommit={(v) => set({ widthMM: v ?? p.widthMM })} /></Field>
    <Field label="Height"><LenInput value={p.heightMM} min={50} max={3000} onCommit={(v) => set({ heightMM: v ?? p.heightMM })} /></Field>
    <Field label="Pixels" hint="Calculated from size ÷ pitch – override if the sheet differs">
      <span className="row-gap">
        <NumberInput value={p.pxW} min={1} width={60} onCommit={(v) => onChange({ ...p, pxW: v ?? p.pxW })} />×
        <NumberInput value={p.pxH} min={1} width={60} onCommit={(v) => onChange({ ...p, pxH: v ?? p.pxH })} />
      </span>
    </Field>
    <Field label="Weight"><WtInput value={p.weightKG} step={0.1} min={0} onCommit={(v) => onChange({ ...p, weightKG: v ?? p.weightKG })} /></Field>
    <Field label="Max power"><NumberInput value={p.maxWatts} min={1} unit="W" onCommit={(v) => onChange({ ...p, maxWatts: v ?? p.maxWatts })} /></Field>
    <Field label="Typical power"><NumberInput value={p.typWatts} min={0} unit="W" onCommit={(v) => onChange({ ...p, typWatts: v ?? p.typWatts })} /></Field>
    <Field label="Data"><Select value={p.dataConnector} onChange={(dataConnector) => onChange({ ...p, dataConnector })} options={[{ value: 'etherCON', label: 'etherCON' }, { value: 'rj45', label: 'RJ45' }]} /></Field>
    <Field label="Power in"><Select value={p.powerConnector} onChange={(powerConnector) => onChange({ ...p, powerConnector })} options={[{ value: 'powerCONTrue1', label: 'powerCON TRUE1' }, { value: 'powerCON', label: 'powerCON' }]} /></Field>
    <p className="muted small">Saved panels are stored in this project and show up at the top of the list.</p>
  </>)
}

let remembered: LedPrintOptions | null = null
export const lastLedOptions = () => remembered
export function LedPrintDialog({ onClose, wallId }: { onClose: () => void; wallId?: string }) {
  const project = useStore((s) => s.project)
  const [o, setO] = useState<LedPrintOptions>(() => remembered ?? defaultLedPrint())
  const [only, setOnly] = useState(!!wallId)
  const set = (v: LedPrintOptions) => { remembered = v; setO(v) }
  const opts = useMemo(() => ({ ...o, walls: only && wallId ? [wallId] : undefined }), [o, only, wallId])
  const render = useCallback((x: LedPrintOptions) => ledSheets(useStore.getState().project, x), [])
  const has = (v: View) => o.views.includes(v)
  const toggle = (v: View, on: boolean) => set({ ...o, views: on ? [...o.views.filter((x) => x !== v), v].sort() : o.views.filter((x) => x !== v) })
  return (
    <DrawingDialog title="Print / Export LED Wall Maps" name={`${project.info.name} LED`} options={opts} setOptions={(v) => set({ ...v, walls: undefined })} render={render} onClose={onClose}
      extra={<>
        <h4>Maps</h4>
        <Toggle label="Data flow" checked={has('data')} onChange={(v) => toggle('data', v)} />
        <Toggle label="Power flow" checked={has('power')} onChange={(v) => toggle('power', v)} />
        {wallId && (project.ledWalls?.length ?? 0) > 1 && <Toggle label="Only this wall" checked={only} onChange={setOnly} />}
      </>} />
  )
}

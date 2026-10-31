import { useMemo, useState } from 'react'
import { produce } from 'immer'
import { applyMeasured, cellSpanMM, CONNECTOR_TYPES, connectorIsPower, connectorName, finishPerCell, fitToWidth, FORMAT_KEYS, FORMATS, geometryProblems, newId, NORMALLING_NAMES, repeatPattern, rowsFor, templateName, toPerCell, totalChannels, CABLE_CATEGORIES, CABLE_CATEGORY_KEYS, isTwoSided, retemplateBay, TERMINATIONS, TERMINATION_KEYS, TWO_SIDED_FORMATS, type CableCategory, type LabelStripGeometry, type Normalling, type PatchBayTemplate, type PatchTermination, type PortDirection, fmtLen, lenUnit } from '@core/index'
import { DEFAULT_STYLE } from '@core/patchbay/patchbay'
import { api } from '../platform'
import { useStore } from '../store'
import { Modal, NumberInput, Select, TextInput, Toggle, LenInput } from '../components/ui'
import { StripView } from './StripView'

type Tab = 'layout' | 'fonts' | 'notes'
type Cursor = { kind: 'cell'; n: number } | { kind: 'gap'; n: number } | { kind: 'padLeft' } | { kind: 'padRight' }

const FONT_CHOICES = ['Helvetica, Arial, sans-serif', 'Arial Narrow, Arial, sans-serif', 'Futura, Helvetica, sans-serif', 'Menlo, ui-monospace, monospace', 'Georgia, serif', 'DIN Alternate, Helvetica, sans-serif']

/**
 * PatchCAD-style template editor: make/model/type, the important layout numbers,
 * a per-cell width table with gaps and padding (Add Gap at Cursor / in the Middle,
 * Delete Gap, Repeat Till End), fonts and notes, plus Save / Save As / Delete / Share.
 */
export function TemplateEditor({ initial }: { initial: PatchBayTemplate }) {
  const [t, setT] = useState<PatchBayTemplate>(() => ({ ...initial, rows: initial.rows.map((r) => ({ ...r, strip: toPerCell(r.strip) })) }))
  const [tab, setTab] = useState<Tab>('layout')
  const [shared, setShared] = useState(() => initial.rows.every((r) => JSON.stringify(r.strip) === JSON.stringify(initial.rows[0].strip)))
  const [rowId, setRowId] = useState(1)
  const [cursor, setCursor] = useState<Cursor>({ kind: 'cell', n: 1 })
  const [zoom, setZoom] = useState(2)
  const [measure, setMeasure] = useState<{ first: number | null; last: number | null }>({ first: null, last: null })
  const templates = useStore((s) => s.templates)
  const isSavedUser = templates.some((x) => x.key === initial.key && x.source === 'user')
  const close = () => useStore.getState().set({ editingTemplate: null, editingTemplateBay: null })
  const bayId = useStore((s) => s.editingTemplateBay)
  const bay = useStore((s) => (bayId ? s.project.patchBays.find((b) => b.id === bayId) : undefined))
  const panelish = TWO_SIDED_FORMATS.includes(t.format)
  /** Apply the edited layout to the placed bay (bay mode). */
  const applyToBay = () => {
    if (!bay) return
    let dropped = 0
    useStore.getState().apply(`Change ${bay.name} Layout`, (d) => { dropped = retemplateBay(d, bay.id, t) })
    useStore.getState().notify(`Updated ${bay.name}${dropped ? ` · ${dropped} cable${dropped === 1 ? '' : 's'} on removed ports deleted` : ''}`, { undo: true, kind: dropped ? 'warning' : 'success' })
    close()
  }
  const addRow = () => edit((d) => {
    const n = d.rows.length + 1
    d.rows = rowsFor(n, d.rows[d.rows.length - 1]?.strip ?? g, d.rows, TWO_SIDED_FORMATS.includes(d.format))
    if (TWO_SIDED_FORMATS.includes(d.format)) { d.rows.forEach((r, i) => { if (/^(Port|Row \d+)$/.test(r.name)) r.name = `Row ${i + 1}` }); d.rackUnits = Math.max(d.rackUnits, n) }
  })
  const edit = (fn: (d: PatchBayTemplate) => void) => setT((cur) => produce(cur, fn))

  const row = t.rows.find((r) => r.id === rowId) ?? t.rows[0]
  const g = row.strip
  const widths = g.cellWidthsMM ?? []
  const setG = (fn: (g: LabelStripGeometry) => LabelStripGeometry) => edit((d) => {
    const next = finishPerCell(fn(structuredClone(row.strip)))
    for (const r of d.rows) if (shared || r.id === row.id) r.strip = structuredClone(next)
  })
  const problems = useMemo(() => [
    ...t.rows.flatMap((r) => geometryProblems(r.strip).map((p) => `${r.name}: ${p}`)),
    ...(t.series.trim() ? [] : ['Model is required.']),
  ], [t])

  // ---- Save / Save As / Delete / Share
  const persist = async (tpl: PatchBayTemplate, msg: string) => {
    await api.saveUserTemplate({ ...tpl, source: 'user' })
    await useStore.getState().reloadLibrary()
    useStore.getState().notify(msg)
    close()
  }
  const save = () => persist(t, `Saved template “${templateName(t)}”`)
  const saveAs = () => {
    const name = prompt('Save a copy as (model name):', `${t.series} copy`)
    if (!name) return
    void persist({ ...t, key: `user.${newId()}`, series: name }, `Saved copy “${t.manufacturer} ${name}”`)
  }
  const del = async () => {
    if (!confirm(`Delete template “${templateName(t)}”? Bays already in projects keep their layout.`)) return
    await api.deleteUserTemplate(t.key)
    await useStore.getState().reloadLibrary()
    useStore.getState().notify(`Deleted “${templateName(t)}”`)
    close()
  }
  const share = () => {
    const blob = new Blob([JSON.stringify({ rackflowTemplate: 1, template: { ...t, source: 'user' } }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${templateName(t).replace(/[^\w.-]+/g, '_')}.rftemplate.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // ---- Cell table actions
  const cursorCell = cursor.kind === 'cell' ? cursor.n : cursor.kind === 'gap' ? cursor.n : 1
  const addGapAt = (n: number) => { if (n >= 1 && n < g.channelCount) { setG((x) => ({ ...x, gapsAfterMM: { ...x.gapsAfterMM, [String(n)]: x.gapsAfterMM?.[String(n)] || 5 } })); setCursor({ kind: 'gap', n }) } }
  const deleteGap = () => { if (cursor.kind !== 'gap') return; setG((x) => { const gaps = { ...x.gapsAfterMM }; delete gaps[String(cursor.n)]; return { ...x, gapsAfterMM: gaps } }); setCursor({ kind: 'cell', n: cursor.n }) }
  const setWidth = (n: number, v: number | null) => { if (v == null) return; setG((x) => { const w = [...(x.cellWidthsMM ?? [])]; w[n - 1] = v; return { ...x, cellWidthsMM: w } }) }
  const setAll = (v: number | null) => { if (v == null) return; setG((x) => ({ ...x, cellWidthsMM: Array(x.channelCount).fill(v) })) }
  const setChannels = (n: number) => setG((x) => {
    const w = (x.cellWidthsMM ?? []).slice(0, n)
    while (w.length < n) w.push(w[w.length - 1] ?? 10)
    return { ...x, channelCount: n, cellWidthsMM: w }
  })

  const sockR = Math.max(1.5, (g.socketDiameterMM ?? 4.4) / 2)
  return (
    <Modal title={bay ? `Change Layout – ${bay.name}` : "Edit Custom Template"} onClose={close} wide
      footer={<>
        <button onClick={close}>Cancel</button>
        {isSavedUser && <button className="danger" onClick={() => void del()}>Delete Template…</button>}
        <button onClick={share} title="Download a .rftemplate.json you can send to someone (import it from the Templates panel)">Share Template…</button>
        <span className="spacer" />
        <span className="muted">{problems[0] ?? `${totalChannels(t)} points · ${t.rows.length} row${t.rows.length > 1 ? 's' : ''}`}</span>
        <button disabled={problems.length > 0} onClick={saveAs}>{bay ? 'Save to Library As…' : 'Save As…'}</button>
        {bay
          ? <button className="primary" disabled={problems.length > 0} onClick={applyToBay} title="Change this bay's rows, ports and wiring sides. Labels on cells that still exist are kept.">Apply to {bay.name}</button>
          : <button className="primary" disabled={problems.length > 0} onClick={() => void save()}>Save</button>}
      </>}>
      <div className="tpl-editor">
        <div className="tpl-head">
          <label>Patchbay Make:<TextInput value={t.manufacturer} onCommit={(v) => edit((d) => { d.manufacturer = v })} /></label>
          <label>Patchbay Model:<TextInput value={t.series} onCommit={(v) => edit((d) => { d.series = v })} /></label>
          <label>Patchbay Type:<Select value={t.format} onChange={(f) => edit((d) => {
            d.format = f; d.rearConnector = FORMATS[f].rear
            if (TWO_SIDED_FORMATS.includes(f)) { d.termination ??= f === 'rj45' ? 'punchdown' : 'feedThrough'; d.normalling = 'isolated'; if (f === 'rj45') d.cableCategory ??= 'cat6a'; d.rows = rowsFor(d.rows.length, d.rows[0].strip, d.rows.map((r) => ({ ...r, rearDirection: 'bidirectional' as const })), true) }
            else { d.termination = undefined; d.cableCategory = undefined }
          })} options={FORMAT_KEYS.map((f) => ({ value: f, label: FORMATS[f].name }))} /></label>
        </div>

        <div className="tpl-tabs">
          {([['layout', 'The Important Stuff'], ['fonts', 'Fonts'], ['notes', 'Notes']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'layout' && (
          <div className="tpl-panel tpl-grid">
            <div className="tpl-col">
              <Q label="How many rows?">
                <span className="tpl-inline">
                  <Select value={t.rows.length} onChange={(n) => { edit((d) => { d.rows = rowsFor(n, d.rows[0]?.strip ?? g, d.rows, TWO_SIDED_FORMATS.includes(d.format)); if (TWO_SIDED_FORMATS.includes(d.format)) d.rackUnits = Math.max(d.rackUnits, n) }); setRowId(1) }} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))} />
                  <button className="mini" disabled={t.rows.length >= 8} onClick={addRow} title={panelish ? 'Adds a row of sockets and another rack unit' : 'Adds another row of sockets'}>+ Add {panelish ? '1RU ' : ''}Row</button>
                </span>
              </Q>
              {panelish && (<>
                <Q label="Termination:"><Select value={t.termination ?? 'punchdown'} onChange={(v: PatchTermination) => edit((d) => { d.termination = v })} options={TERMINATION_KEYS.map((k) => ({ value: k, label: TERMINATIONS[k].name }))} /></Q>
                {t.format === 'rj45' && <Q label="Category:">
                  <span className="tpl-inline">
                    <Select value={t.cableCategory ?? 'cat6a'} onChange={(v: CableCategory) => edit((d) => { d.cableCategory = v })} options={CABLE_CATEGORY_KEYS.map((k) => ({ value: k, label: CABLE_CATEGORIES[k].name }))} />
                    <Toggle label="Shielded" checked={!!t.shielded} onChange={(v) => edit((d) => { d.shielded = v })} />
                  </span>
                </Q>}
                <p className="muted small" style={{ margin: '0 0 8px' }}>{isTwoSided(t) ? 'Front jacks (patch cords) and rear terminations are both wireable on the diagram.' : 'Only the rear is wired; front jacks take patch cords.'}</p>
              </>)}
              <Q label="How many sockets in each row?"><NumberInput value={g.channelCount} min={1} max={128} onCommit={(v) => setChannels(Math.max(1, v ?? 1))} /></Q>
              <Q label="Divide each designation strip into how many lines?"><NumberInput value={g.linesPerCell} min={1} max={4} onCommit={(v) => setG((x) => ({ ...x, linesPerCell: v ?? 2 }))} /></Q>
              <Q label="Patchbay layout:"><Select value={g.socketLayout ?? 'mono'} onChange={(v: 'mono' | 'paired') => setG((x) => ({ ...x, socketLayout: v }))} options={[{ value: 'mono', label: 'Mono Spaced' }, { value: 'paired', label: 'Paired (stereo)' }]} /></Q>
              <Q label="Distance between two sockets in a pair:" disabled={(g.socketLayout ?? 'mono') !== 'paired'}>
                <LenInput value={g.pairSpacingMM ?? 0} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, pairSpacingMM: v ?? 0 }))} />
              </Q>
              <Q label="Rack units:"><NumberInput value={t.rackUnits} min={1} max={8} unit="RU" onCommit={(v) => edit((d) => { d.rackUnits = v ?? 1 })} /></Q>
              <Q label="Normalling:"><Select value={t.normalling} onChange={(v: Normalling) => edit((d) => { d.normalling = v })} options={(Object.keys(NORMALLING_NAMES) as Normalling[]).map((n) => ({ value: n, label: NORMALLING_NAMES[n] }))} /></Q>
              {!isTwoSided(t) && <Q label="Rear connection:"><Select value={t.rearConnector} onChange={(v) => edit((d) => { d.rearConnector = v })} options={CONNECTOR_TYPES.filter((c) => !connectorIsPower(c)).map((c) => ({ value: c, label: connectorName(c) }))} /></Q>}
              {t.rows.length > 1 && <Q label="All rows share these sizes"><Toggle label="" checked={shared} onChange={setShared} /></Q>}
              {t.rows.length > 1 && !shared && <Q label="Editing row:"><Select value={row.id} onChange={setRowId} options={t.rows.map((r) => ({ value: r.id, label: r.name }))} /></Q>}
              <Q label={`Name of ${t.rows.length > 1 && !shared ? 'this' : 'the selected'} row:`}>
                <span className="tpl-inline">
                  {t.rows.length > 1 && shared && <Select value={row.id} onChange={setRowId} options={t.rows.map((r) => ({ value: r.id, label: `Row ${r.id}` }))} />}
                  <TextInput value={row.name} onCommit={(v) => edit((d) => { const r = d.rows.find((x) => x.id === row.id); if (r) r.name = v })} />
                </span>
              </Q>
              <Q label="Rear direction (for label binding):">
                <Select value={row.rearDirection} onChange={(v: PortDirection) => edit((d) => { const r = d.rows.find((x) => x.id === row.id); if (r) r.rearDirection = v })}
                  options={[{ value: 'input', label: 'Inputs (fed by sources)' }, { value: 'output', label: 'Outputs (feed destinations)' }, { value: 'bidirectional', label: 'Either' }]} />
              </Q>
            </div>
            <div className="tpl-col">
              <Q label="Designation strip left padding:"><LenInput value={g.padLeftMM ?? 0} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, padLeftMM: v ?? 0 }))} /></Q>
              <Q label="Designation strip right padding:"><LenInput value={g.padRightMM ?? 0} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, padRightMM: v ?? 0 }))} /></Q>
              <Q label="Designation strip top padding:"><LenInput value={g.padTopMM ?? 0} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, padTopMM: v ?? 0 }))} /></Q>
              <Q label="Designation strip bottom padding:"><LenInput value={g.padBottomMM ?? 0} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, padBottomMM: v ?? 0 }))} /></Q>
              <Q label="Distance from the designation strip to the socket:"><LenInput value={g.socketOffsetMM ?? 2} min={0} step={0.1} onCommit={(v) => setG((x) => ({ ...x, socketOffsetMM: v ?? 0 }))} /></Q>
              <Q label="Socket diameter:"><LenInput value={g.socketDiameterMM ?? 4.4} min={0.5} step={0.1} onCommit={(v) => setG((x) => ({ ...x, socketDiameterMM: v ?? 4.4 }))} /></Q>
              <Q label="Designation strip height:"><LenInput value={g.stripHeightMM} min={2} step={0.1} onCommit={(v) => setG((x) => ({ ...x, stripHeightMM: v ?? x.stripHeightMM }))} /></Q>
              <Q label="Dimensions verified against the panel:"><Toggle label="" checked={t.dimensionsVerified} onChange={(v) => edit((d) => { d.dimensionsVerified = v })} /></Q>
              <details className="tpl-measure">
                <summary>Measure a physical panel</summary>
                <p className="muted small">With calipers, measure the first and last channel centres from the strip’s left edge. Widths are spread evenly between them.</p>
                <div className="tpl-inline">
                  <LenInput value={measure.first} allowEmpty step={0.01} onCommit={(v) => setMeasure((m) => ({ ...m, first: v }))} />
                  <LenInput value={measure.last} allowEmpty step={0.01} onCommit={(v) => setMeasure((m) => ({ ...m, last: v }))} />
                  <button disabled={measure.first == null || measure.last == null || measure.last! <= measure.first!}
                    onClick={() => setG((x) => {
                      const uniform = applyMeasured({ ...x, cellWidthsMM: undefined, gapsAfterMM: undefined, groupSize: null, groupGapMM: 0 }, measure.first!, measure.last!)
                      return toPerCell({ ...uniform, stripWidthMM: Math.max(x.stripWidthMM, measure.last! + uniform.channelPitchMM / 2) })
                    })}>Apply</button>
                </div>
              </details>
            </div>
          </div>
        )}

        {tab === 'fonts' && (
          <div className="tpl-panel tpl-grid">
            <div className="tpl-col">
              <p className="muted small">Defaults for new bays made from this template (each bay can still be restyled on the Patch Labels page).</p>
              <Q label="Font:"><Select value={t.defaultStyle?.fontFamily ?? DEFAULT_STYLE.fontFamily} onChange={(v) => edit((d) => { d.defaultStyle = { ...d.defaultStyle, fontFamily: v } })} options={FONT_CHOICES.map((f) => ({ value: f, label: f.split(',')[0] }))} /></Q>
              <Q label="Largest font size:"><NumberInput value={t.defaultStyle?.maxFontPt ?? DEFAULT_STYLE.maxFontPt} min={3} max={24} step={0.5} unit="pt" onCommit={(v) => edit((d) => { d.defaultStyle = { ...d.defaultStyle, maxFontPt: v ?? 7 } })} /></Q>
              <Q label="Smallest font size (auto-shrink):"><NumberInput value={t.defaultStyle?.minFontPt ?? DEFAULT_STYLE.minFontPt} min={2} max={12} step={0.5} unit="pt" onCommit={(v) => edit((d) => { d.defaultStyle = { ...d.defaultStyle, minFontPt: v ?? 4 } })} /></Q>
              <Q label="Print channel numbers:"><Toggle label="" checked={t.defaultStyle?.showChannelNumbers ?? DEFAULT_STYLE.showChannelNumbers} onChange={(v) => edit((d) => { d.defaultStyle = { ...d.defaultStyle, showChannelNumbers: v } })} /></Q>
              <Q label="Cell divider lines:"><Toggle label="" checked={t.defaultStyle?.cellDividers ?? DEFAULT_STYLE.cellDividers} onChange={(v) => edit((d) => { d.defaultStyle = { ...d.defaultStyle, cellDividers: v } })} /></Q>
            </div>
            <div className="tpl-col">
              <StripView g={g} pxPerMM={1.6} style={{ ...DEFAULT_STYLE, ...t.defaultStyle }}
                cells={new Map(Array.from({ length: Math.min(g.channelCount, 16) }, (_, i) => [i + 1, { row: 1, channel: i + 1, text: i % 3 === 0 ? `VOX\n${i + 1}` : i % 3 === 1 ? `GTR ${i + 1}` : `KEYS\nL/R`, manual: false, fill: null }]))} />
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="tpl-panel">
            <textarea className="tpl-notes" value={t.notes} placeholder="Part number, where you measured it, label stock, anything else…" onChange={(e) => { const v = e.target.value; edit((d) => { d.notes = v }) }} />
          </div>
        )}

        {tab === 'layout' && <>
          <div className="tpl-cells-head">
            <span>Please enter the width of each designation strip cell{t.rows.length > 1 && !shared ? ` (${row.name})` : ''}, in {lenUnit() === 'in' ? 'inches' : 'mm'}:</span>
            <span className="spacer" />
            <label className="tpl-inline">Set all to <LenInput value={null} allowEmpty min={0.5} step={0.1} width={70} onCommit={setAll} /></label>
            <label className="tpl-inline">Fit total to <LenInput value={null} allowEmpty min={10} step={0.1} width={80} onCommit={(v) => v && setG((x) => fitToWidth(x, v))} /></label>
          </div>
          <div className="tpl-cells">
            <div className={`tpl-pad ${cursor.kind === 'padLeft' ? 'sel' : ''}`} onClick={() => setCursor({ kind: 'padLeft' })}>
              <div className="hdr">Left<br />Padding</div>
              <LenInput noUnit value={g.padLeftMM ?? 0} min={0} step={0.1} width={64} onCommit={(v) => setG((x) => ({ ...x, padLeftMM: v ?? 0 }))} />
            </div>
            <div className="tpl-scroll">
              <div className="tpl-track">
                {widths.slice(0, g.channelCount).map((w, i) => {
                  const n = i + 1
                  const gap = g.gapsAfterMM?.[String(n)]
                  return [
                    <div key={`c${n}`} className={`tpl-cell ${cursor.kind === 'cell' && cursor.n === n ? 'sel' : ''}`} style={{ width: Math.max(56, w * zoom * 3) }} onClick={() => setCursor({ kind: 'cell', n })}>
                      <div className="hdr">{n}</div>
                      <LenInput noUnit value={w} min={0.5} step={0.1} width={58} onCommit={(v) => setWidth(n, v)} />
                      <div className="sock">
                        {(g.socketLayout ?? 'mono') === 'paired'
                          ? <><i style={{ width: sockR * 4.5, height: sockR * 4.5 }} /><i style={{ width: sockR * 4.5, height: sockR * 4.5 }} /></>
                          : <i style={{ width: sockR * 4.5, height: sockR * 4.5 }} />}
                      </div>
                    </div>,
                    gap ? (
                      <div key={`g${n}`} className={`tpl-gap ${cursor.kind === 'gap' && cursor.n === n ? 'sel' : ''}`} onClick={() => setCursor({ kind: 'gap', n })}>
                        <div className="hdr">Gap</div>
                        <LenInput noUnit value={gap} min={0} step={0.1} width={52} onCommit={(v) => setG((x) => ({ ...x, gapsAfterMM: { ...x.gapsAfterMM, [String(n)]: v ?? 0 } }))} />
                        <div className="sock" />
                      </div>
                    ) : null,
                  ]
                })}
              </div>
            </div>
            <div className={`tpl-pad ${cursor.kind === 'padRight' ? 'sel' : ''}`} onClick={() => setCursor({ kind: 'padRight' })}>
              <div className="hdr">Right<br />Padding</div>
              <LenInput noUnit value={g.padRightMM ?? 0} min={0} step={0.1} width={64} onCommit={(v) => setG((x) => ({ ...x, padRightMM: v ?? 0 }))} />
            </div>
          </div>
          <div className="tpl-actions">
            <button disabled={cursor.kind !== 'cell' || cursor.n >= g.channelCount} onClick={() => addGapAt(cursorCell)} title="Insert a gap after the selected cell">Add Gap at Cursor</button>
            <button disabled={g.channelCount < 2} onClick={() => addGapAt(Math.floor(g.channelCount / 2))}>Add Gap in the Middle</button>
            <button disabled={cursor.kind !== 'gap'} onClick={deleteGap}>Delete Gap</button>
            <button disabled={cursor.kind !== 'cell' && cursor.kind !== 'gap'} onClick={() => setG((x) => repeatPattern(x, cursorCell))}
              title="Repeat the widths and gaps of cells 1 … selected across the rest of the strip">Repeat Till End</button>
            <span className="spacer" />
            <label className="zoom">Zoom <input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
            <span>Total label width: <b>{fmtLen(g.stripWidthMM, 3)}</b></span>
          </div>
          <div className="tpl-preview">
            <svg width={g.stripWidthMM * zoom} height={(g.stripHeightMM + (g.socketOffsetMM ?? 2) + (g.socketDiameterMM ?? 4.4) + 2) * zoom}
              viewBox={`0 0 ${g.stripWidthMM} ${g.stripHeightMM + (g.socketOffsetMM ?? 2) + (g.socketDiameterMM ?? 4.4) + 2}`}>
              <rect x={0} y={0} width={g.stripWidthMM} height={g.stripHeightMM} fill="#fff" stroke="#000" strokeWidth={0.15} />
              {Array.from({ length: g.channelCount }, (_, i) => {
                const s = cellSpanMM(g, i)
                const cy = g.stripHeightMM + (g.socketOffsetMM ?? 2) + (g.socketDiameterMM ?? 4.4) / 2
                const r = (g.socketDiameterMM ?? 4.4) / 2
                const cx = s.x + s.width / 2, pair = (g.pairSpacingMM ?? 0) / 2
                const sel = cursor.kind === 'cell' && cursor.n === i + 1
                return (
                  <g key={i}>
                    <rect x={s.x} y={0} width={s.width} height={g.stripHeightMM} fill={sel ? '#0a84ff33' : 'transparent'} stroke="#000" strokeWidth={0.08} />
                    <rect x={s.x} y={g.padTopMM ?? 0} width={s.width} height={g.stripHeightMM - (g.padTopMM ?? 0) - (g.padBottomMM ?? 0)} fill="none" stroke="#3b82f6" strokeWidth={0.05} strokeDasharray="0.4 0.4" />
                    {(g.socketLayout ?? 'mono') === 'paired' && pair > 0
                      ? <><circle cx={cx - pair} cy={cy} r={r} fill="none" stroke="#666" strokeWidth={0.15} /><circle cx={cx + pair} cy={cy} r={r} fill="none" stroke="#666" strokeWidth={0.15} /></>
                      : <circle cx={cx} cy={cy} r={r} fill="none" stroke="#666" strokeWidth={0.15} />}
                    <text x={cx} y={g.stripHeightMM / 2 + 1} fontSize={Math.min(3, s.width / 3)} textAnchor="middle" fill="#999">{i + 1}</text>
                  </g>
                )
              })}
            </svg>
          </div>
        </>}
        {problems.length > 0 && <ul className="issues">{problems.map((m) => <li key={m}><span className="sev sev-error">✕</span><div>{m}</div></li>)}</ul>}
      </div>
    </Modal>
  )
}

/** "Question: [input]" row, PatchCAD style. */
function Q({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return <div className={`tpl-q ${disabled ? 'disabled' : ''}`}><span>{label}</span><div>{children}</div></div>
}


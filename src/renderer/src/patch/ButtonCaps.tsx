import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CAP_PRESETS, capFontPt, layoutCaps, newCapSheet, pagesToPrintHTML, pageToSVG, resizeCapGrid, STOCKS, PT_PER_MM,
  type CapPrintOptions, type CapSheet,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Empty, Modal, Select, TextInput, Toggle } from '../components/ui'
import { showContextMenu } from '../components/ContextMenu'

const CAP_COLORS: [string, string][] = [['Red', '#ff5a5a'], ['Orange', '#ffa340'], ['Yellow', '#ffe14d'], ['Green', '#58d26b'], ['Blue', '#5aa0ff'], ['Purple', '#b07cff'], ['Grey', '#bdbdbd']]

const NO_SHEETS: CapSheet[] = []

function editSheet(id: string, label: string, fn: (s: CapSheet) => void) {
  useStore.getState().apply(label, (d) => { const s = d.buttonCaps?.find((x) => x.id === id); if (s) fn(s) })
}

/**
 * Button Caps: sheets of free-typed labels for switcher / panel button caps
 * (Ross crosspoints, user buttons…). Not tied to the wiring – type, print 1:1
 * on clear film, cut out.
 */
export function ButtonCapsView() {
  const stored = useStore((s) => s.project.buttonCaps)
  const sheets = stored ?? NO_SHEETS
  const [cur, setCur] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const sheet = sheets.find((s) => s.id === cur) ?? sheets[0]
  const add = (presetKey: string) => {
    const preset = CAP_PRESETS.find((p) => p.key === presetKey) ?? CAP_PRESETS[0]
    let id = ''
    useStore.getState().apply('New Button Cap Sheet', (d) => { id = newCapSheet(d, preset, preset.key === 'custom' ? undefined : undefined).id })
    setCur(id)
  }
  const addMenu = (e: React.MouseEvent) => showContextMenu(e, CAP_PRESETS.map((p) => ({ label: `${p.name}${p.key !== 'custom' ? ` (${p.cols * p.rows})` : ''}`, onClick: () => add(p.key) })))

  if (!sheets.length) return (
    <Empty title="No button cap sheets yet">
      <p>Type your own labels for switcher button caps (Ross crosspoints, user / memory buttons…), then print them 1:1 on clear film and cut them out. They aren’t linked to the wiring.</p>
      <button className="primary" onClick={addMenu}>＋ New Button Cap Sheet ▾</button>
    </Empty>
  )
  return (
    <div className="caps-view">
      <div className="caps-bar">
        <div className="caps-tabs">
          {sheets.map((s) => <button key={s.id} className={s.id === sheet.id ? 'on' : ''} onClick={() => setCur(s.id)}
            onContextMenu={(e) => showContextMenu(e, [
              { label: 'Duplicate Sheet', onClick: () => { let id = ''; useStore.getState().apply('Duplicate Cap Sheet', (d) => { const src = d.buttonCaps?.find((x) => x.id === s.id); if (!src) return; const c = { ...JSON.parse(JSON.stringify(src)), id: crypto.randomUUID(), name: `${src.name} copy` }; d.buttonCaps = [...(d.buttonCaps ?? []), c]; id = c.id }); setCur(id) } },
              'sep',
              { label: 'Delete Sheet', danger: true, onClick: () => useStore.getState().apply('Delete Cap Sheet', (d) => { d.buttonCaps = (d.buttonCaps ?? []).filter((x) => x.id !== s.id) }) },
            ])}>{s.name}</button>)}
          <button className="caps-add" onClick={addMenu} title="New sheet from a preset">＋ ▾</button>
        </div>
        <span className="spacer" />
        <button className="primary" onClick={() => setPreview(true)}>Print / Export…</button>
      </div>
      <SheetEditor key={sheet.id} sheet={sheet} />
      {preview && <CapsPreview sheets={sheets} current={sheet.id} onClose={() => setPreview(false)} />}
    </div>
  )
}

function SheetEditor({ sheet }: { sheet: CapSheet }) {
  const [scale, setScale] = useState(4) // px per mm on screen
  const [pattern, setPattern] = useState<{ text: string; start: number } | null>(null)
  const upd = (label: string, fn: (s: CapSheet) => void) => editSheet(sheet.id, label, fn)
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || min))
  return (
    <div className="caps-editor">
      <div className="caps-opts">
        <label>Name<TextInput value={sheet.name} onCommit={(v) => upd('Rename Cap Sheet', (s) => { s.name = v.trim() || s.name })} /></label>
        <label title="One cap insert – measure a real cap">Cap size
          <input type="number" step={0.1} min={4} max={60} value={sheet.capW} onChange={(e) => upd('Cap Size', (s) => { s.capW = num(e.target.value, 4, 60) })} />×
          <input type="number" step={0.1} min={4} max={60} value={sheet.capH} onChange={(e) => upd('Cap Size', (s) => { s.capH = num(e.target.value, 4, 60) })} /> mm</label>
        <label>Grid
          <input type="number" min={1} max={64} value={sheet.cols} onChange={(e) => upd('Cap Grid', (s) => resizeCapGrid(s, num(e.target.value, 1, 64), s.rows))} /> across ×
          <input type="number" min={1} max={32} value={sheet.rows} onChange={(e) => upd('Cap Grid', (s) => resizeCapGrid(s, s.cols, num(e.target.value, 1, 32)))} /> rows</label>
        <label title="Space between caps on the printed sheet">Gap<input type="number" step={0.5} min={0} max={10} value={sheet.gapMM} onChange={(e) => upd('Cap Gap', (s) => { s.gapMM = Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /> mm</label>
        <label>Text
          <Select value={sheet.fontPt ? String(sheet.fontPt) : ''} width={90} onChange={(v) => upd('Cap Text Size', (s) => { s.fontPt = v ? Number(v) : undefined })}
            options={[{ value: '', label: 'Auto fit' }, ...[4, 5, 6, 7, 8, 9, 10, 12].map((n) => ({ value: String(n), label: `${n} pt` }))]} />
          <label className="fb-check"><input type="checkbox" checked={sheet.bold !== false} onChange={(e) => upd('Cap Bold', (s) => { s.bold = e.target.checked })} /> Bold</label>
        </label>
        {pattern == null
          ? <button onClick={() => setPattern({ text: 'CAM {n}', start: 1 })} title="Number every cap: CAM 1, CAM 2…">Fill series…</button>
          : <span className="fb-pop">
              <input value={pattern.text} onChange={(e) => setPattern({ ...pattern, text: e.target.value })} title="{n} number · {nn} 01" style={{ width: 90 }} />
              <input type="number" value={pattern.start} style={{ width: 52 }} onChange={(e) => setPattern({ ...pattern, start: +e.target.value })} />
              <button className="primary" onClick={() => { upd('Fill Caps', (s) => { s.texts = s.texts.map((_, i) => pattern.text.replace(/\{nn\}/g, String(pattern.start + i).padStart(2, '0')).replace(/\{n\}/g, String(pattern.start + i))) }); setPattern(null) }}>Fill all</button>
              <button onClick={() => setPattern(null)}>Cancel</button>
            </span>}
        <button onClick={() => upd('Clear Caps', (s) => { s.texts = s.texts.map(() => ''); s.fills = undefined })}>Clear</button>
        <span className="spacer" />
        <label className="zoom">Zoom <input type="range" min={2} max={10} step={0.5} value={scale} onChange={(e) => setScale(+e.target.value)} /></label>
      </div>
      <p className="muted small caps-hint">Type in a cap (Enter for a new line, Tab to the next) · right-click for a colour · sizes are nominal: measure one of your caps and set <b>Cap size</b>, then do a test print before a full run.</p>
      <div className="caps-grid-wrap">
        <div className="caps-grid" style={{ gridTemplateColumns: `repeat(${sheet.cols}, ${sheet.capW * scale}px)`, gap: Math.max(2, sheet.gapMM * scale) }}>
          {sheet.texts.map((t, i) => <Cap key={`${i}:${sheet.cols}`} sheet={sheet} i={i} text={t} scale={scale} />)}
        </div>
      </div>
    </div>
  )
}

function Cap({ sheet, i, text, scale }: { sheet: CapSheet; i: number; text: string; scale: number }) {
  const [draft, setDraft] = useState(text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setDraft(text) }, [text])
  const commit = () => { if (draft !== text) editSheet(sheet.id, 'Edit Cap', (s) => { s.texts[i] = draft }) }
  const lines = draft.split('\n')
  const pt = capFontPt(lines, sheet.capW - 0.8, sheet.capH - 0.8, sheet.fontPt)
  const fill = sheet.fills?.[i] ?? undefined
  const setFill = (c: string | null) => editSheet(sheet.id, 'Cap Colour', (s) => { const f = s.fills ?? s.texts.map(() => null); f[i] = c; s.fills = f.some(Boolean) ? f : undefined })
  return (
    <div className="cap" style={{ width: sheet.capW * scale, height: sheet.capH * scale, background: fill }}
      onContextMenu={(e) => showContextMenu(e, [...CAP_COLORS.map(([n, c]) => ({ label: `${fill === c ? '● ' : ''}${n}`, onClick: () => setFill(c) })), 'sep', { label: 'No colour', onClick: () => setFill(null) }])}>
      <textarea ref={ref} value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value.toUpperCase())} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(text); ref.current?.blur() } }}
        style={{ fontSize: (pt / PT_PER_MM) * scale, fontWeight: sheet.bold !== false ? 700 : 400, paddingTop: Math.max(1, (sheet.capH * scale - lines.length * (pt / PT_PER_MM) * scale * 1.12) / 2) }} />
    </div>
  )
}

function CapsPreview({ sheets, current, onClose }: { sheets: CapSheet[]; current: string; onClose: () => void }) {
  const project = useStore((s) => s.project)
  const notify = useStore((s) => s.notify)
  const [all, setAll] = useState(false)
  const [o, setO] = useState<CapPrintOptions>({ stock: STOCKS[0], landscape: true, cutMarks: true, captions: true, outlines: true })
  const shown = all ? sheets : sheets.filter((s) => s.id === current)
  const pages = useMemo(() => layoutCaps(shown, o), [shown, o])
  const name = all ? `${project.info.name} button caps` : `${shown[0]?.name ?? 'Button caps'}`
  const [zoom, setZoom] = useState(1)
  return (
    <Modal title="Print / Export Button Caps" onClose={onClose} wide footer={<>
      <span className="muted">{pages.length} page{pages.length === 1 ? '' : 's'} · 1:1 scale</span>
      <span className="spacer" />
      <button onClick={async () => { const out = await api.exportSVG(pages.map(pageToSVG), name); if (out) notify('Exported SVG') }}>Export SVG…</button>
      <button onClick={async () => { const out = await api.exportPDF(pagesToPrintHTML(pages), name); if (out) notify(`Exported ${out.split(/[\\/]/).pop()}`) }}>Export PDF…</button>
      <button className="primary" onClick={() => void api.print(pagesToPrintHTML(pages))}>Print…</button>
    </>}>
      <div className="preview">
        <div className="preview-opts form">
          <Toggle label="All cap sheets" checked={all} onChange={setAll} />
          <label className="field"><span className="field-label">Paper</span>
            <Select value={o.stock.key} onChange={(k) => setO({ ...o, stock: STOCKS.find((s) => s.key === k)! })} options={STOCKS.map((s) => ({ value: s.key, label: s.name }))} />
          </label>
          <Toggle label="Landscape" checked={o.landscape} onChange={(v) => setO({ ...o, landscape: v })} />
          <Toggle label="Cap outlines (cut lines)" checked={o.outlines} onChange={(v) => setO({ ...o, outlines: v })} />
          <Toggle label="Crop marks" checked={o.cutMarks} onChange={(v) => setO({ ...o, cutMarks: v })} />
          <Toggle label="Sheet captions" checked={o.captions} onChange={(v) => setO({ ...o, captions: v })} />
          <div className="zoom-row">
            <button className="mini" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</button>
            <input type="range" min={0.5} max={8} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
            <button className="mini" onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>+</button>
            <button className="mini" onClick={() => setZoom(1)}>Fit</button>
            <span className="muted small">{Math.round(zoom * 100)}%</span>
          </div>
          <p className="muted small">Print at 100 % (Actual Size) on clear film / transparency so the button backlight shows through, then cut along the outlines.</p>
        </div>
        <div className="preview-pages zoomable">
          {pages.map((p, i) => <div key={i} className="sheet" style={{ width: `${zoom * 100}%`, maxWidth: 1000 * zoom }} dangerouslySetInnerHTML={{ __html: pageToSVG(p).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />)}
        </div>
      </div>
    </Modal>
  )
}

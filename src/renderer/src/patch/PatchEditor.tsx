import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearFormatting, clearRange, resetToWiring, boundText, copyRange, defaultPrintOptions, fillSeries, findCell, FORMAT_PRESETS, layoutLabels, mergeTitle,
  NORMAL_SYMBOLS, normalsShown, pagesToPrintHTML, pageToSVG, pasteAt, refreshLabels, removeTitles, setNormals, staleCells, STOCKS, styleRange,
  toggleStyle, arrowGlyph, rowLetter, type CellStyle, type NormalMode, type PatchBay, type PrintOptions, type RowArrow, autoGroupTitles} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Empty, Modal, Segmented, Select, TextInput, Toggle } from '../components/ui'
import { BayGrid, CellEditorPopover } from './BayGrid'
import { ButtonCapsView } from './ButtonCaps'
import { bandForRow, editBay, editSelection, fontLabel, FONTS, PALETTE, usePatchUI } from './patchState'

/**
 * PatchCAD-style label editor: every patch bay in the project stacked as a
 * spreadsheet of strips, with group titles, a normalling row, per-cell
 * formatting, keyboard editing and Excel-compatible copy/paste. Cells that
 * weren't typed by hand fill themselves from the wiring diagram.
 */
export function PatchEditor() {
  const project = useStore((s) => s.project)
  const preview = usePatchUI((s) => s.preview)
  const tab = usePatchUI((s) => s.tab)

  if (tab === 'caps') return (
    <div className="patch-editor">
      <InfoBar />
      <ButtonCapsView />
    </div>
  )

  if (project.patchBays.length === 0) {
    return (
      <div className="patch-editor">
        <InfoBar />
        <Empty title="No patch bays yet">
          <p>Pick a layout in the <b>Add a patch bay</b> panel on the right and click <b>Add</b>, or double-click one in the library’s Patch Bays tab. Each bay also appears on the Wiring Diagram.</p>
          <AddBayButton />
        </Empty>
      </div>
    )
  }

  return (
    <div className="patch-editor">
      <InfoBar />
      <FormatBar />
      <Grid />
      <CellEditorPopover />
      {preview && <PrintPreview onClose={() => usePatchUI.getState().set({ preview: false })} />}
    </div>
  )
}

function InfoBar() {
  const info = useStore((s) => s.project.info)
  const count = useStore((s) => s.project.patchBays.length)
  const caps = useStore((s) => s.project.buttonCaps?.length ?? 0)
  const tab = usePatchUI((s) => s.tab)
  const apply = useStore((s) => s.apply)
  const upd = (label: string, fn: (i: typeof info) => void) => apply(label, (d) => fn(d.info))
  return (
    <div className="info-bar">
      <label>Project Name<TextInput value={info.name} onCommit={(v) => upd('Project Name', (i) => { i.name = v })} /></label>
      <label>Location<TextInput value={info.location ?? ''} onCommit={(v) => upd('Project Location', (i) => { i.location = v })} /></label>
      <label>Client Name<TextInput value={info.client} onCommit={(v) => upd('Client', (i) => { i.client = v })} /></label>
      <label>Revision<TextInput value={info.revision} onCommit={(v) => upd('Revision', (i) => { i.revision = v })} /></label>
      <Segmented value={tab} onChange={(v) => usePatchUI.getState().set({ tab: v })} options={[
        { value: 'bays', label: `Patch Bays${count ? ` (${count})` : ''}` },
        { value: 'caps', label: `Button Caps${caps ? ` (${caps})` : ''}`, title: 'Custom labels for switcher button caps (Ross…) – printed as their own sheets' },
      ]} />
      {tab === 'bays' && <AddBayButton />}
    </div>
  )
}

function useSelBay(): PatchBay | undefined {
  const sel = usePatchUI((s) => s.sel)
  const bays = useStore((s) => s.project.patchBays)
  const selectedBay = useStore((s) => s.selectedBay)
  return bays.find((b) => b.id === (sel?.bay ?? selectedBay)) ?? bays[0]
}

function FormatBar() {
  const sel = usePatchUI((s) => s.sel)
  const title = usePatchUI((s) => s.title)
  const setUI = usePatchUI((s) => s.set)
  usePatchUI((s) => s.colw)
  const project = useStore((s) => s.project)
  const bay = useSelBay()
  const [series, setSeries] = useState<{ pattern: string; start: number } | null>(null)
  const cell = bay && sel ? findCell(bay, sel.row, Math.min(sel.a, sel.b)) : undefined
  const st: CellStyle | undefined = title ? bay?.spans.find((s) => s.id === title)?.style : cell?.style
  const stale = useMemo(() => (bay ? staleCells(bay, project).length : 0), [bay, project])
  const has = !!sel

  /** Style either the selected title or the selected cells. */
  const styleSel = (label: string, patch: CellStyle) => editSelection(label, (b, s) => {
    const t = usePatchUI.getState().title
    const span = t && b.spans.find((x) => x.id === t)
    if (span) { span.style = { ...span.style, ...patch }; delete span.auto }
    else styleRange(b, s, patch)
  })
  const toggle = (k: 'bold' | 'italic' | 'underline' | 'strike') => editSelection('Format', (b, s) => {
    const t = usePatchUI.getState().title
    const span = t && b.spans.find((x) => x.id === t)
    if (span) { span.style = { ...span.style, [k]: !span.style?.[k] }; delete span.auto }
    else toggleStyle(b, s, k)
  })
  const normals = (m: NormalMode) => editSelection('Change Normalling', (b, s) => {
    const band = bandForRow(b, s.row)
    if (band != null) setNormals(b, band, s.a, s.b, m)
  })

  return (
    <div className="format-bar">
      <div className="fb-group">
        <button className={`fb ${st?.bold ? 'on' : ''}`} disabled={!has} onClick={() => toggle('bold')} title="Bold (⌘B)"><b>B</b></button>
        <button className={`fb ${st?.italic ? 'on' : ''}`} disabled={!has} onClick={() => toggle('italic')} title="Italic (⌘I)"><i>I</i></button>
        <button className={`fb ${st?.underline ? 'on' : ''}`} disabled={!has} onClick={() => toggle('underline')} title="Underline (⌘U)"><u>U</u></button>
        <button className={`fb ${st?.strike ? 'on' : ''}`} disabled={!has} onClick={() => toggle('strike')} title="Strikethrough"><s>S</s></button>
      </div>
      <div className="fb-group">
        <Select value={st?.fontFamily ?? ''} width={136} onChange={(f) => styleSel('Font', { fontFamily: f || undefined })}
          options={[{ value: '', label: 'Default font' }, ...FONTS.map((f) => ({ value: f, label: fontLabel(f) }))]} />
        <Select value={st?.sizePt ?? 0} width={80} onChange={(n) => styleSel('Font Size', { sizePt: n || undefined })}
          options={[{ value: 0, label: 'Auto' }, ...[4, 5, 6, 7, 8, 9, 10, 12].map((n) => ({ value: n, label: `${n} pt` }))]} />
      </div>
      <div className="fb-group">
        <ColorButton title="Cell fill" glyph="◧" value={st?.fill} disabled={!has} onPick={(c) => styleSel('Fill', { fill: c ?? undefined })} />
        <ColorButton title="Text colour" glyph="A" value={st?.color} disabled={!has} onPick={(c) => styleSel('Text Colour', { color: c ?? undefined })} />
        <ColorButton title="Strip colour (whole row)" glyph="▤" value={bay && sel ? bay.rowFill[String(sel.row)] : undefined} disabled={!has}
          onPick={(c) => editSelection('Strip Colour', (b, s) => { if (c) b.rowFill[String(s.row)] = c; else delete b.rowFill[String(s.row)] })} />
      </div>
      <div className="fb-group">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={`fb ${(st?.align ?? 'center') === a && has ? 'on' : ''}`} disabled={!has} title={`Align ${a}`} onClick={() => styleSel('Align', { align: a === 'center' ? undefined : a })}>
            {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
          </button>
        ))}
      </div>
      <div className="fb-group">
        <button className="fb" disabled={!has} title="Merge selection into a group title (⌘G)" onClick={() => mergeSelection()}>⊞ Title</button>
        <button className="fb" disabled={!has} title="Remove titles over the selection" onClick={() => editSelection('Remove Title', (b, s) => removeTitles(b, s))}>⊟</button>
      </div>
      <div className="fb-group">
        <button className="fb" disabled={!has} title="Number the selection 1, 2, 3…" onClick={() => editSelection('Number', (b, s) => fillSeries(b, s, '{n}', 1))}>123</button>
        <button className="fb" disabled={!has} title="Letter the selection A, B, C…" onClick={() => editSelection('Letter', (b, s) => fillSeries(b, s, '{A}', 1))}>ABC</button>
        <button className="fb" disabled={!has} title="Fill a series, e.g. MIC {n}" onClick={() => setSeries(series ? null : { pattern: 'MIC {n}', start: 1 })}>Σ Fill…</button>
        {series && (
          <span className="fb-pop">
            <input value={series.pattern} onChange={(e) => setSeries({ ...series, pattern: e.target.value })} title="{n} number · {nn} 01 · {A} letter" />
            <input type="number" value={series.start} style={{ width: 52 }} onChange={(e) => setSeries({ ...series, start: +e.target.value })} />
            <button className="primary" onClick={() => { editSelection('Fill Series', (b, s) => fillSeries(b, s, series.pattern, series.start)); setSeries(null) }}>Fill</button>
          </span>
        )}
      </div>
      <div className="fb-group" title="Normalling for the selected channels">
        <label className="fb-check" title="Show normalling on this bay (symbols and NORMAL / HALF / ISOLATED at the strip ends). Network, fiber and other pass-through panels don't normal, so it's off for them."><input type="checkbox" disabled={!bay} checked={!!bay && normalsShown(bay)} onChange={(e) => bay && editBay(bay.id, e.target.checked ? 'Show Normalling' : 'Hide Normalling', (b) => { b.showNormals = e.target.checked })} /> Normalling</label>
        {(!bay || normalsShown(bay)) && (['full', 'half', 'parallel', 'none'] as NormalMode[]).map((m) => (
          <button key={m} className="fb" disabled={!has || !bay || bandForRow(bay, sel!.row) == null} title={NORMAL_SYMBOLS[m].name} onClick={() => normals(m)}>
            {NORMAL_SYMBOLS[m].glyph || '∅'}
          </button>
        ))}
      </div>
      <div className="fb-group" title="Strip ends: a letter for each row (with ▼ and its normalling word under it when normalling is shown)">
        <label className="fb-check"><input type="checkbox" disabled={!bay} checked={!!bay?.rowTabs?.on} onChange={(e) => bay && editBay(bay.id, 'Row Letters', (b) => { b.rowTabs = { ...b.rowTabs, on: e.target.checked } })} /> Row letters</label>
        <input className="fb-letter" disabled={!has || !bay?.rowTabs?.on} maxLength={3} value={bay && sel ? rowLetter(bay, sel.row) : ''} title="Letter for the selected row"
          onChange={(e) => editSelection('Row Letter', (b, s) => { b.rowTabs = { on: true, ...b.rowTabs, letters: { ...b.rowTabs?.letters, [String(s.row)]: e.target.value.toUpperCase() } } })} />
      </div>
      <div className="fb-group" title="Arrow on every label of the selected row, pointing at the jacks it names">
        {(['up', 'down', undefined] as (RowArrow | undefined)[]).map((a) => (
          <button key={a ?? 'none'} className={`fb ${bay && sel && bay.arrows?.[String(sel.row)] === a ? 'on' : ''}`} disabled={!has}
            title={a ? `${arrowGlyph(a)} on this row's labels` : 'No arrow on this row'}
            onClick={() => editSelection('Row Arrow', (b, s) => { const m = { ...b.arrows }; if (a) m[String(s.row)] = a; else delete m[String(s.row)]; b.arrows = m })}>{a ? arrowGlyph(a) : '–'}</button>
        ))}
      </div>
      <div className="fb-group">
        <button className="fb" disabled={!has} title="Clear formatting" onClick={() => editSelection('Clear Formatting', (b, s) => clearFormatting(b, s))}>⌫ Fmt</button>
        {bay && (
          <>
            <Select value="" width={148} onChange={(name) => { const p = FORMAT_PRESETS.find((x) => x.name === name); if (p) editBay(bay.id, 'Label Format', (b) => { b.format = { ...p.format } }) }}
              options={[{ value: '', label: 'Wiring format…' }, ...FORMAT_PRESETS.map((x) => ({ value: x.name, label: x.name }))]} />
            <button className={`fb ${stale ? 'accent' : ''}`} title="Fill every non-typed cell from the cables wired to this bay's rear ports"
              onClick={() => {
                const pr = useStore.getState().project
                editBay(bay.id, 'Refresh from Wiring', (b) => refreshLabels(b, pr))
                // Typed cells are kept – say so when the wiring says something else there.
                const kept = bay.cells.filter((c) => c.manual && c.text && (boundText(bay, c.row, c.channel, pr) ?? c.text) !== c.text)
                if (kept.length) useStore.getState().notify(`Kept ${kept.length} typed label${kept.length === 1 ? '' : 's'} that differ from the wiring (${kept.slice(0, 4).map((c) => `${bay.template.rows.find((r) => r.id === c.row)?.name ?? ''} ${c.channel}`).join(', ')}${kept.length > 4 ? '…' : ''}) – select them and use ↺ Reset selected`, { kind: 'info' })
              }}>⟳ From wiring{stale ? ` (${stale})` : ''}</button>
            <button className="fb" disabled={!has} title="Put the selected cells back to what's wired – replaces text typed in them (From wiring leaves typed cells alone)"
              onClick={() => editSelection('Reset to Wiring', (b, s) => resetToWiring(b, useStore.getState().project, s))}>↺ Reset selected</button>
            <label className="fb-check" title="Title each run of channels wired to the same wall box, plate or floor box with its tag and room. Rename or restyle a title to make it your own; untick to remove the automatic ones.">
              <input type="checkbox" checked={bay.autoTitles !== false} onChange={(e) => editBay(bay.id, 'Group by Box', (b) => {
                b.autoTitles = e.target.checked
                if (e.target.checked) autoGroupTitles(b, useStore.getState().project); else b.spans = b.spans.filter((x) => !x.auto)
              })} /> Group by box
            </label>
          </>
        )}
      </div>
      <span className="spacer" />
      <label className="zoom" title="Column width (0 = fit window)">Zoom
        <input type="range" min={0} max={90} step={2} value={usePatchUI.getState().colw} onChange={(e) => setUI({ colw: +e.target.value })} />
      </label>
      <button className="primary" onClick={() => setUI({ preview: true })}>Print / Export…</button>
    </div>
  )
}

export function mergeSelection() {
  const { sel } = usePatchUI.getState()
  if (!sel) return
  let id = ''
  editSelection('Add Title', (b, s) => { id = mergeTitle(b, s, '') })
  if (id) usePatchUI.getState().set({ title: id, editing: { bay: sel.bay, title: id } })
}

function ColorButton({ title, glyph, value, disabled, onPick }: { title: string; glyph: string; value?: string; disabled?: boolean; onPick: (c: string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="color-btn">
      <button className="fb" disabled={disabled} title={title} onClick={() => setOpen((o) => !o)}>
        <span>{glyph}</span><span className="swatch" style={{ background: value ?? 'transparent' }} />
      </button>
      {open && (
        <div className="palette" onMouseLeave={() => setOpen(false)}>
          {PALETTE.map((c) => <button key={c} style={{ background: c }} title={c} onClick={() => { onPick(c); setOpen(false) }} />)}
          <button className="none" title="None" onClick={() => { onPick(null); setOpen(false) }}>∅</button>
          <input type="color" title="Custom colour" onChange={(e) => onPick(e.target.value)} />
        </div>
      )}
    </span>
  )
}

/** The stacked bays + keyboard model (arrows, shift-extend, type-to-edit, ⌘B/I/U/G, copy/paste). */
function Grid() {
  const bays = useStore((s) => s.project.patchBays)
  const colw = usePatchUI((s) => s.colw)
  const ui = usePatchUI

  useEffect(() => {
    if (!ui.getState().sel && bays[0]) ui.getState().setSel({ bay: bays[0].id, row: bays[0].template.rows[0].id, a: 1, b: 1 })
  }, [bays, ui])

  const onKey = (e: React.KeyboardEvent) => {
    const { sel, title, editing, setSel, set } = ui.getState()
    // Typing in the bay header fields (name, location) isn't cell input.
    if (!editing && isFormField(e.target)) return
    if (editing) {
      // Keys that arrive before the editor has focus belong to the text being typed.
      if ('seed' in editing && e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); set({ editing: { ...editing, seed: (editing.seed ?? '') + e.key } }) }
      return
    }
    if (!sel) return
    const bay = bays.find((b) => b.id === sel.bay)
    if (!bay) return
    const rows = bay.template.rows
    const ri = rows.findIndex((r) => r.id === sel.row)
    const n = rows[ri].strip.channelCount
    const mod = e.metaKey || e.ctrlKey
    const k = e.key

    if (mod && ['b', 'i', 'u'].includes(k.toLowerCase())) {
      e.preventDefault()
      const key = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[k.toLowerCase() as 'b' | 'i' | 'u']
      editSelection('Format', (b, s) => toggleStyle(b, s, key))
      return
    }
    if (mod && k.toLowerCase() === 'g') { e.preventDefault(); mergeSelection(); return }
    if (mod) return

    const move = (row: number, ch: number, extend: boolean) => {
      e.preventDefault()
      const max = rows.find((r) => r.id === row)!.strip.channelCount
      const c = Math.max(1, Math.min(max, ch))
      setSel(extend && row === sel.row ? { ...sel, b: c } : { bay: sel.bay, row, a: c, b: c })
    }
    switch (k) {
      case 'ArrowLeft': return move(sel.row, sel.b - 1, e.shiftKey)
      case 'ArrowRight': return move(sel.row, sel.b + 1, e.shiftKey)
      case 'Tab': return move(sel.row, sel.b + (e.shiftKey ? -1 : 1), false)
      case 'ArrowUp': {
        if (ri > 0) return move(rows[ri - 1].id, sel.b, false)
        const bi = bays.findIndex((b) => b.id === bay.id)
        if (bi > 0) { e.preventDefault(); const pb = bays[bi - 1]; const r = pb.template.rows[pb.template.rows.length - 1]; setSel({ bay: pb.id, row: r.id, a: Math.min(sel.b, r.strip.channelCount), b: Math.min(sel.b, r.strip.channelCount) }) }
        return
      }
      case 'ArrowDown': {
        if (ri < rows.length - 1) return move(rows[ri + 1].id, sel.b, false)
        const bi = bays.findIndex((b) => b.id === bay.id)
        if (bi < bays.length - 1) { e.preventDefault(); const nb = bays[bi + 1]; const r = nb.template.rows[0]; setSel({ bay: nb.id, row: r.id, a: Math.min(sel.b, r.strip.channelCount), b: Math.min(sel.b, r.strip.channelCount) }) }
        return
      }
      case 'Enter': case 'F2':
        e.preventDefault()
        set({ editing: title ? { bay: bay.id, title } : { bay: bay.id, row: sel.row, channel: Math.min(sel.a, sel.b) } })
        return
      case 'Backspace': case 'Delete':
        e.preventDefault()
        if (title) editSelection('Delete Title', (b) => { b.spans = b.spans.filter((s) => s.id !== title) })
        else editSelection('Clear Cells', (b, s) => clearRange(b, s))
        ui.getState().set({ title: null })
        return
      case 'Escape': setSel({ ...sel, a: sel.b }); return
    }
    if (k.length === 1 && !e.altKey && n > 0) {
      e.preventDefault()
      set({ editing: { bay: bay.id, row: sel.row, channel: Math.min(sel.a, sel.b), seed: k } })
    }
  }

  const onCopy = (e: React.ClipboardEvent, cut = false) => {
    if (!ui.getState().editing && isFormField(e.target)) return
    const { sel } = ui.getState()
    const bay = sel && bays.find((b) => b.id === sel.bay)
    if (!sel || !bay) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', copyRange(bay, sel))
    if (cut) editSelection('Cut', (b, s) => clearRange(b, s))
  }
  const onPaste = (e: React.ClipboardEvent) => {
    if (!ui.getState().editing && isFormField(e.target)) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    editSelection('Paste', (b, s) => pasteAt(b, s.row, Math.min(s.a, s.b), text))
  }

  return (
    <div className="patch-grid" style={{ ['--colw' as string]: `${colw}px` }} tabIndex={0} onKeyDown={onKey} onCopy={(e) => onCopy(e)} onCut={(e) => onCopy(e, true)} onPaste={onPaste}>
      {bays.map((b, i) => <BayGrid key={b.id} bay={b} index={i} count={bays.length} />)}
    </div>
  )
}

/** Exact-scale print preview + export. */
function PrintPreview({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const notify = useStore((s) => s.notify)
  const bay = useSelBay()
  const [opts, setOpts] = useState<PrintOptions>(defaultPrintOptions)
  const [all, setAll] = useState(true)
  const bays = all ? project.patchBays : bay ? [bay] : []
  const pages = useMemo(() => layoutLabels(bays, opts), [bays, opts])
  const name = all ? `${project.info.name} labels` : `${bay?.name} labels`
  const unverified = bays.filter((b) => !b.template.dimensionsVerified)
  // Zoom: −/+ / slider, ⌘-scroll or pinch (zooms round the pointer); drag to move around when zoomed in.
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const pagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const fx = (el.scrollLeft + e.clientX - r.left) / el.scrollWidth, fy = (el.scrollTop + e.clientY - r.top) / el.scrollHeight
      const next = Math.min(8, Math.max(0.5, zoomRef.current * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002))))
      setZoom(next)
      requestAnimationFrame(() => { el.scrollLeft = fx * el.scrollWidth - (e.clientX - r.left); el.scrollTop = fy * el.scrollHeight - (e.clientY - r.top) })
    }
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom((z) => Math.min(8, z * 1.25)) }
      else if (e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.5, z / 1.25)) }
      else if (e.key === '0') { e.preventDefault(); setZoom(1) }
    }
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key, true)
    return () => { el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key, true) }
  }, [])

  return (
    <Modal title="Print / Export Labels" onClose={onClose} wide footer={<>
      <span className="muted">{pages.length} page{pages.length === 1 ? '' : 's'} · 1:1 scale</span>
      <span className="spacer" />
      <button onClick={async () => { const out = await api.exportSVG(pages.map(pageToSVG), name); if (out) notify('Exported SVG') }}>Export SVG…</button>
      <button onClick={async () => { const out = await api.exportPDF(pagesToPrintHTML(pages), name); if (out) notify(`Exported ${out.split(/[\\/]/).pop()}`) }}>Export PDF…</button>
      <button className="primary" onClick={() => void api.print(pagesToPrintHTML(pages))}>Print…</button>
    </>}>
      <div className="preview">
        <div className="preview-opts form">
          <Toggle label="All patch bays" checked={all} onChange={setAll} />
          <label className="field"><span className="field-label">Paper</span>
            <Select value={opts.stock.key} onChange={(k) => setOpts({ ...opts, stock: STOCKS.find((s) => s.key === k)! })} options={STOCKS.map((s) => ({ value: s.key, label: s.name }))} />
          </label>
          <Toggle label="Landscape" checked={opts.landscape} onChange={(v) => setOpts({ ...opts, landscape: v })} />
          <Toggle label="Cut marks" checked={opts.cutMarks} onChange={(v) => setOpts({ ...opts, cutMarks: v })} />
          <Toggle label="Strip captions" checked={opts.captions} onChange={(v) => setOpts({ ...opts, captions: v })} />
          <Toggle label="Normalling symbols" checked={opts.normals !== false} onChange={(v) => setOpts({ ...opts, normals: v })} />
          <div className="zoom-row">
            <button className="mini" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title="Zoom out (⌘−)">−</button>
            <input type="range" min={0.5} max={8} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
            <button className="mini" onClick={() => setZoom((z) => Math.min(8, z * 1.25))} title="Zoom in (⌘+)">+</button>
            <button className="mini" onClick={() => setZoom(1)} title="Fit the page to the window (⌘0)">Fit</button>
            <span className="muted small">{Math.round(zoom * 100)}%</span>
          </div>
          <p className="muted small">Zoom with ⌘-scroll, pinch or ⌘+ / ⌘−; drag the page to move around.</p>
          <p className="muted small">Printed at 100 %. Strips wider than the paper are split at channel boundaries and marked “cont.”.</p>
          {unverified.length > 0 && <p className="warn-text small">⚠ {unverified.map((b) => b.name).join(', ')} use nominal template dimensions. Check one strip against the panel before printing a full run.</p>}
        </div>
        <div className={`preview-pages zoomable ${zoom > 1 ? 'pannable' : ''}`} ref={pagesRef}
          onPointerDown={(e) => {
            const el = pagesRef.current
            if (!el || e.button !== 0 || zoom <= 1) return
            const start = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop }
            el.setPointerCapture(e.pointerId); el.classList.add('panning')
            const move = (ev: PointerEvent) => { el.scrollLeft = start.l - (ev.clientX - start.x); el.scrollTop = start.t - (ev.clientY - start.y) }
            const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('panning') }
            el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
          }}>
          {pages.map((p, i) => <div key={i} className="sheet" style={{ width: `${zoom * 100}%`, maxWidth: 1000 * zoom }} dangerouslySetInnerHTML={{ __html: pageToSVG(p).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />)}
        </div>
      </div>
    </Modal>
  )
}

/** Shows the template panel (it lives in the right-hand pane) and focuses its search. */
function AddBayButton() {
  const show = () => {
    useStore.getState().set({ showInspector: true })
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>('.templates-panel input[type=search]')
      el?.focus()
      document.querySelector('.templates-panel')?.classList.add('flash')
      setTimeout(() => document.querySelector('.templates-panel')?.classList.remove('flash'), 900)
    })
  }
  return <button className="primary add-bay" onClick={show}>+ Add Patch Bay</button>
}

const isFormField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

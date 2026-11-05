import { useEffect, useMemo, useRef, useState } from 'react'
import {
  blankFreeTitleBlock, cloneTemplate, defaultTitleBlock, drawFreeItems, fieldsToItems, itemRect, newId, SHEETS, Svg, TB_VARIABLES, titleBlockOf, twoRowTitleBlock, useTemplate,
  type TBItem, type TBItemKind, type TBSide, type TitleBlockPrefs, type TitleBlockTemplate,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Modal, NumberInput, Segmented, Select } from '../components/ui'
import { pickImage } from '../rack/AccessoryInspector'

// MARK: Saved templates + the default one (app-wide)

export async function loadTemplates(): Promise<TitleBlockTemplate[]> {
  return ((await api.storeGet<TitleBlockTemplate[]>('TitleBlocks')) ?? []).filter((t) => t && (Array.isArray(t.fields) || Array.isArray(t.items)))
}
const saveTemplates = (ts: TitleBlockTemplate[]) => api.storeSet('TitleBlocks', ts)
export async function loadTBPrefs(): Promise<TitleBlockPrefs> { return (await api.storeGet<TitleBlockPrefs>('TitleBlockPrefs')) ?? {} }
const saveTBPrefs = (p: TitleBlockPrefs) => api.storeSet('TitleBlockPrefs', p)

export { refreshDefaultTB } from './tbDefault'
import { refreshDefaultTB } from './tbDefault'

const MARGIN = 10
const ensureItems = (t: TitleBlockTemplate): TitleBlockTemplate => (t.items ? t : { ...t, items: fieldsToItems(t), side: 'bottom' })

// MARK: Variable text input – type freely, ＋ inserts {variables}

export function VariableText({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const insert = (key: string) => {
    const el = ref.current, tok = `{${key}}`
    const at = el ? el.selectionStart : value.length, end = el ? el.selectionEnd : value.length
    onChange(value.slice(0, at) + tok + value.slice(end))
    setOpen(false)
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + tok.length } })
  }
  const groups = [...new Set(TB_VARIABLES.map((v) => v.group))]
  return (
    <div className="vt">
      <textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type text – ＋ adds a variable such as {project}" />
      <button className="vt-plus" title="Insert a variable (fills in from the project and sheet)" onClick={() => setOpen((o) => !o)}>＋</button>
      {open && (
        <div className="vt-menu" onMouseLeave={() => setOpen(false)}>
          {groups.map((g) => (
            <div key={g}>
              <h5>{g}</h5>
              {TB_VARIABLES.filter((v) => v.group === g).map((v) => <button key={v.key} onClick={() => insert(v.key)}><span>{v.label}</span><code>{`{${v.key}}`}</code></button>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// MARK: Builder

type Drag = { id: string; mode: 'move' | 'size' | 'end'; x0: number; y0: number; orig: TBItem }

export function TitleBlockBuilder({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [t, setT0] = useState<TitleBlockTemplate>(() => ensureItems(structuredClone(titleBlockOf(project))))
  const [past, setPast] = useState<TitleBlockTemplate[]>([])
  const setT = (n: TitleBlockTemplate, record = true) => { if (record) setPast((p) => [...p.slice(-60), t]); setT0(n) }
  const [saved, setSaved] = useState<TitleBlockTemplate[]>([])
  const [prefs, setPrefs] = useState<TitleBlockPrefs>({})
  const [sel, setSel] = useState<string | null>(null)
  const [paper, setPaper] = useState('ansiB')
  const [snap, setSnap] = useState(true)
  useEffect(() => { void loadTemplates().then(setSaved); void loadTBPrefs().then(setPrefs) }, [])
  const side: TBSide = t.side ?? 'bottom'
  const sheet = SHEETS.find((s) => s.key === paper) ?? SHEETS[0]
  const L = (side === 'bottom' ? Math.max(sheet.w, sheet.h) : Math.min(sheet.w, sheet.h)) - MARGIN // landscape sheet
  const T = t.height
  const strip = side === 'bottom' ? { x: 0, y: 0, w: L, h: T } : { x: 0, y: 0, w: T, h: L }
  // px per mm: a bottom strip fills the width; a side strip fits the canvas height.
  const k = side === 'bottom' ? 900 / L : 420 / L
  const items = t.items ?? []
  const item = items.find((i) => i.id === sel)
  const upd = (id: string, patch: Partial<TBItem>, record = true) => setT({ ...t, items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, record)

  const svg = useMemo(() => {
    const s = new Svg(strip.w, strip.h)
    s.rect(0, 0, strip.w, strip.h, { lw: 0.5 })
    drawFreeItems(s, project, t, { drawing: 'SIGNAL FLOW – AUDIO', sheet: 'AV101', rev: project.revisions?.at(-1)?.rev ?? project.info.revision ?? 'A', date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), page: 1, pages: 3, pageTitle: 'AUDIO', drawingNo: 'AV101', paper: sheet.name }, strip, side)
    return s.toString().replace(/width="[^"]*mm" height="[^"]*mm"/, `width="${strip.w * k}" height="${strip.h * k}"`)
  }, [t, project, strip.w, strip.h, k, side, sheet.name])

  // Drag: move, resize (corner) or move a line's end.
  const drag = useRef<Drag | null>(null)
  const q = (v: number) => (snap ? Math.round(v * 2) / 2 : v)
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x0) / k, dy = (e.clientY - d.y0) / k
    const along = side === 'bottom' ? dx : dy, across = side === 'bottom' ? dy : dx
    const o = d.orig
    if (d.mode === 'move') {
      const a = q((o.a * L + along)) / L, b = q(o.b + across)
      upd(o.id, { a, b }, false)
    } else upd(o.id, { da: q((o.da * L + along)) / L, db: q(o.db + across) }, false)
  }
  const onUp = () => { drag.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  const start = (e: React.PointerEvent, it: TBItem, mode: Drag['mode']) => {
    e.stopPropagation(); e.preventDefault()
    setSel(it.id)
    setPast((p) => [...p.slice(-60), t])
    drag.current = { id: it.id, mode, x0: e.clientX, y0: e.clientY, orig: it }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }
  useEffect(() => () => onUp(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (kind: TBItemKind | 'field' | 'hline') => {
    const mid = 0.4
    const base = { id: newId(), a: mid, b: Math.min(4, T / 4) }
    const across = Math.max(6, Math.min(T - 4, 12))
    const make: Record<string, TBItem[]> = {
      text: [{ ...base, kind: 'text', da: 60 / L, db: 6, text: 'Text', size: 3.5, vAlign: 'middle' }],
      rect: [{ ...base, kind: 'rect', da: 60 / L, db: across, strokeWidth: 0.35 }],
      line: [{ ...base, kind: 'line', da: side === 'bottom' ? 0 : 60 / L, db: side === 'bottom' ? T - 2 * base.b : 0, strokeWidth: 0.35 }],
      hline: [{ ...base, kind: 'line', da: side === 'bottom' ? 60 / L : 0, db: side === 'bottom' ? 0 : T - 4, strokeWidth: 0.35 }],
      image: [],
      field: [{ ...base, kind: 'rect', da: 60 / L, db: across, strokeWidth: 0.35 },
        { id: newId(), kind: 'text', a: mid + 2 / L, b: base.b + 0.8, da: 56 / L, db: 3.4, text: 'CAPTION', size: 2.2, color: '#555555', vAlign: 'middle' },
        { id: newId(), kind: 'text', a: mid + 2 / L, b: base.b + 4.4, da: 56 / L, db: across - 5, text: '{project}', size: 4, bold: true, vAlign: 'middle' }],
    }
    const list = make[kind] ?? []
    if (!list.length) return
    setT({ ...t, items: [...items, ...list] })
    setSel(list[list.length - 1].id)
  }
  const addImage = async () => {
    const img = await pickImage()
    if (!img) return
    const it: TBItem = { id: newId(), kind: 'image', a: 0.005, b: 2, da: 45 / L, db: Math.max(8, T - 4), src: img.dataUrl, light: img.light }
    setT({ ...t, items: [...items, it] }); setSel(it.id)
  }
  const del = () => { if (!sel) return; setT({ ...t, items: items.filter((i) => i.id !== sel) }); setSel(null) }
  const dup = () => { if (!item) return; const c = { ...structuredClone(item), id: newId(), a: item.a + 4 / L, b: item.b + 2 }; setT({ ...t, items: [...items, c] }); setSel(c.id) }
  const order = (d: 1 | -1) => { if (!item) return; const i = items.indexOf(item), j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setT({ ...t, items: n }) }
  const undo = () => { const p = past[past.length - 1]; if (p) { setPast(past.slice(0, -1)); setT0(p) } }
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      if (typing) return
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel) { e.preventDefault(); del() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); dup() }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (arrows[e.key] && item) {
        e.preventDefault()
        const st = e.altKey ? 0.1 : 1, [dx, dy] = arrows[e.key]
        const along = (side === 'bottom' ? dx : dy) * st, across = (side === 'bottom' ? dy : dx) * st
        upd(item.id, { a: item.a + along / L, b: item.b + across })
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  })

  // Position (mm) as shown: x / y / w / h on the strip.
  const R = item ? itemRect(item, strip, side) : null
  const setR = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (!item || !R) return
    const n = { ...R, ...patch }
    upd(item.id, side === 'bottom' ? { a: n.x / L, b: n.y, da: n.w / L, db: n.h } : { a: n.y / L, b: n.x, da: n.h / L, db: n.w })
  }

  const isDefault = (id: string) => prefs.defaultId === id
  const setDefault = async (id: string | undefined) => { const p = { ...prefs, defaultId: id }; setPrefs(p); await saveTBPrefs(p); await refreshDefaultTB() }
  const saveAs = async (asDefault = false) => {
    const name = (t.name || 'My title block').trim()
    const existing = saved.find((x) => x.name === name)
    const copy: TitleBlockTemplate = { ...structuredClone(t), id: existing?.id ?? newId(), name, templateId: undefined }
    const next = [...saved.filter((x) => x.id !== copy.id), copy]
    await saveTemplates(next); setSaved(next)
    if (asDefault) await setDefault(copy.id)
    setT0({ ...t, templateId: copy.id })
    notify(`Saved title block “${name}”${asDefault ? ' – the default for new projects' : ''}`, { kind: 'success' })
    return copy
  }

  const toLocal = (it: TBItem) => itemRect(it, strip, side)
  return (
    <Modal title="Title Block Builder" onClose={onClose} wide footer={<>
      <button disabled={!past.length} onClick={undo}>Undo</button>
      <span className="spacer" />
      <button onClick={() => void saveAs()} title="Keep this design for other projects (Export dialogs list it)">Save as Template</button>
      <button onClick={onClose}>Cancel</button>
      <button className="primary" onClick={() => { apply('Title Block', (d) => { d.titleBlock = structuredClone(t) }); onClose() }}>Use for This Project</button>
    </>}>
      <div className="tbb">
        <div className="tbb-top">
          <input className="tbb-name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value }, false)} placeholder="Template name" />
          <Segmented<TBSide> value={side} onChange={(v) => { setT({ ...t, side: v, height: v === 'bottom' ? Math.min(t.height, 60) : Math.max(t.height, 40) }); setSel(null) }}
            options={[{ value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
          <label className="tbb-inline">{side === 'bottom' ? 'Height' : 'Width'} <NumberInput value={t.height} min={10} max={140} unit="mm" width={70} onCommit={(v) => setT({ ...t, height: v ?? t.height })} /></label>
          <label className="tbb-inline">Preview on <Select value={paper} width={170} onChange={setPaper} options={SHEETS.map((s) => ({ value: s.key, label: s.name }))} /></label>
          <label className="tbb-inline"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap ½ mm</label>
        </div>
        <div className="tbb-body">
          <div className="tbb-side">
            <h4>Templates</h4>
            <div className="tbb-list">
              {saved.map((s) => (
                <div key={s.id} className={`tbb-tpl ${t.templateId === s.id ? 'on' : ''}`}>
                  <button className="link" onClick={() => { setT(ensureItems(useTemplate(s))); setSel(null) }} title="Open this template">{s.name}</button>
                  <button className={`star ${isDefault(s.id) ? 'on' : ''}`} title={isDefault(s.id) ? 'Default for new projects (click to clear)' : 'Make this the default for new projects'} onClick={() => void setDefault(isDefault(s.id) ? undefined : s.id)}>{isDefault(s.id) ? '★' : '☆'}</button>
                  <button className="mini danger" title="Delete this template" onClick={async () => { if (!confirm(`Delete the title block template “${s.name}”?`)) return; const next = saved.filter((x) => x.id !== s.id); await saveTemplates(next); setSaved(next); if (isDefault(s.id)) await setDefault(undefined) }}>×</button>
                </div>
              ))}
              {!saved.length && <p className="muted small">No saved templates yet – build one and Save as Template.</p>}
            </div>
            <h4>Start from</h4>
            <div className="tbb-starts">
              <button className="mini" onClick={() => { setT({ ...blankFreeTitleBlock(side), company: t.company }); setSel(null) }}>Blank</button>
              <button className="mini" onClick={() => { setT(ensureItems({ ...defaultTitleBlock(), id: newId(), logo: t.items?.find((i) => i.kind === 'image')?.src ? undefined : t.logo })); setSel(null) }}>Standard strip</button>
              <button className="mini" onClick={() => { setT(ensureItems(twoRowTitleBlock())); setSel(null) }}>Two rows + company</button>
            </div>
            <h4>Template details</h4>
            <p className="muted small">Shown by the {'{company}'}, {'{scale}'}, {'{checkedBy}'} and {'{approvedBy}'} variables.</p>
            <label className="field-label">Company</label>
            <textarea rows={3} value={t.company ?? ''} onChange={(e) => setT({ ...t, company: e.target.value }, false)} placeholder={'Company name\nAddress · phone'} />
            <div className="tbb-pair">
              <label>Scale<input value={t.scale ?? ''} placeholder="NTS" onChange={(e) => setT({ ...t, scale: e.target.value }, false)} /></label>
              <label>Checked<input value={t.checkedBy ?? ''} onChange={(e) => setT({ ...t, checkedBy: e.target.value }, false)} /></label>
              <label>Approved<input value={t.approvedBy ?? ''} onChange={(e) => setT({ ...t, approvedBy: e.target.value }, false)} /></label>
            </div>
          </div>
          <div className="tbb-main">
            <div className="tbb-tools">
              <button onClick={() => add('text')}>＋ Text</button>
              <button onClick={() => add('field')} title="A section: box with a caption and a value">＋ Section</button>
              <button onClick={() => add('rect')}>＋ Box</button>
              <button onClick={() => add(side === 'bottom' ? 'line' : 'hline')} title="Divider across the strip">＋ Divider</button>
              <button onClick={() => add(side === 'bottom' ? 'hline' : 'line')} title="Line along the strip">＋ Line</button>
              <button onClick={() => void addImage()}>＋ Image / Logo</button>
              <span className="spacer" />
              <button disabled={!item} onClick={dup} title="Duplicate (⌘D)">Duplicate</button>
              <button disabled={!item} onClick={() => order(-1)} title="Send backward">↓</button>
              <button disabled={!item} onClick={() => order(1)} title="Bring forward">↑</button>
              <button disabled={!item} className="danger" onClick={del} title="Delete (⌫)">Delete</button>
            </div>
            <div className={`tbb-canvas ${side}`} onPointerDown={() => setSel(null)}>
              <div className="tbb-paper" style={{ width: strip.w * k, height: strip.h * k }}>
                <div dangerouslySetInnerHTML={{ __html: svg }} />
                {items.map((it) => {
                  const b = toLocal(it)
                  const line = it.kind === 'line'
                  const x = Math.min(b.x, b.x + b.w) * k, y = Math.min(b.y, b.y + b.h) * k
                  const w = Math.max(6, Math.abs(b.w) * k), h = Math.max(6, Math.abs(b.h) * k)
                  return (
                    <div key={it.id} className={`tbb-hit ${sel === it.id ? 'sel' : ''} ${it.kind}`} style={{ left: line ? x - 3 : x, top: line ? y - 3 : y, width: w, height: h }}
                      onPointerDown={(e) => start(e, it, 'move')} title={it.kind === 'text' ? it.text : it.kind}>
                      {sel === it.id && <span className="tbb-handle" onPointerDown={(e) => start(e, it, line ? 'end' : 'size')} />}
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="muted small">Drag to move · drag the corner dot to resize (or a line's end) · arrows nudge (⌥ for 0.1 mm) · ⌘D duplicates · ⌫ deletes. Text can hold {'{variables}'} – they fill in from the project and each sheet.</p>
            {item && R && (
              <div className="tbb-insp">
                <div className="tbb-pos">
                  <label>X<NumberInput value={+R.x.toFixed(2)} width={64} onCommit={(v) => setR({ x: v ?? R.x })} /></label>
                  <label>Y<NumberInput value={+R.y.toFixed(2)} width={64} onCommit={(v) => setR({ y: v ?? R.y })} /></label>
                  <label>{item.kind === 'line' ? 'ΔX' : 'W'}<NumberInput value={+R.w.toFixed(2)} width={64} onCommit={(v) => setR({ w: v ?? R.w })} /></label>
                  <label>{item.kind === 'line' ? 'ΔY' : 'H'}<NumberInput value={+R.h.toFixed(2)} width={64} onCommit={(v) => setR({ h: v ?? R.h })} /></label>
                  <span className="muted small">mm</span>
                </div>
                {item.kind === 'text' && (<>
                  <VariableText value={item.text ?? ''} onChange={(v) => upd(item.id, { text: v }, false)} />
                  <div className="tbb-row">
                    <label>Size<NumberInput value={item.size ?? 3} min={1} max={30} width={56} unit="mm" onCommit={(v) => upd(item.id, { size: v ?? 3 })} /></label>
                    <label><input type="checkbox" checked={!!item.bold} onChange={(e) => upd(item.id, { bold: e.target.checked })} /> Bold</label>
                    <Segmented value={item.align ?? 'left'} onChange={(v) => upd(item.id, { align: v })} options={[{ value: 'left', label: '⇤' }, { value: 'center', label: '↔' }, { value: 'right', label: '⇥' }]} />
                    <Segmented value={item.vAlign ?? 'top'} onChange={(v) => upd(item.id, { vAlign: v })} options={[{ value: 'top', label: '⤒' }, { value: 'middle', label: '↕' }, { value: 'bottom', label: '⤓' }]} />
                    <label>Rotate<Select value={String(((item.rotate ?? 0) % 360 + 360) % 360)} width={84} onChange={(v) => upd(item.id, { rotate: +v })} options={[0, 90, 180, 270].map((r) => ({ value: String(r), label: `${r}°` })).concat([0, 90, 180, 270].includes(((item.rotate ?? 0) % 360 + 360) % 360) ? [] : [{ value: String(item.rotate), label: `${item.rotate}°` }])} /></label>
                    <label>Angle<NumberInput value={item.rotate ?? 0} min={-360} max={360} width={56} unit="°" onCommit={(v) => upd(item.id, { rotate: v ?? 0 })} /></label>
                    <label>Colour<input type="color" value={item.color ?? '#000000'} onChange={(e) => upd(item.id, { color: e.target.value })} /></label>
                  </div>
                </>)}
                {(item.kind === 'rect' || item.kind === 'line') && (
                  <div className="tbb-row">
                    <label>Line<NumberInput value={item.strokeWidth ?? 0.35} min={0.1} max={3} width={56} unit="mm" onCommit={(v) => upd(item.id, { strokeWidth: v ?? 0.35 })} /></label>
                    <label>Colour<input type="color" value={item.stroke ?? '#000000'} onChange={(e) => upd(item.id, { stroke: e.target.value })} /></label>
                    <label><input type="checkbox" checked={!!item.dash} onChange={(e) => upd(item.id, { dash: e.target.checked })} /> Dashed</label>
                    {item.kind === 'rect' && (<>
                      <label><input type="checkbox" checked={!!item.fill} onChange={(e) => upd(item.id, { fill: e.target.checked ? '#eeeeee' : undefined })} /> Fill</label>
                      {item.fill && <input type="color" value={item.fill} onChange={(e) => upd(item.id, { fill: e.target.value })} />}
                      <label>Corners<NumberInput value={item.radius ?? 0} min={0} max={20} width={56} unit="mm" onCommit={(v) => upd(item.id, { radius: v || undefined })} /></label>
                    </>)}
                  </div>
                )}
                {item.kind === 'image' && (
                  <div className="tbb-row">
                    <button className="mini" onClick={async () => { const img = await pickImage(); if (img) upd(item.id, { src: img.dataUrl, light: img.light }) }}>Replace Image…</button>
                    <label><input type="checkbox" checked={!!item.light} onChange={(e) => upd(item.id, { light: e.target.checked })} /> Print solid black (for white logos)</label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// MARK: Picker for export dialogs

/** Which title block to print with: the project's own, or a saved template (★ = default for new projects). */
export function TitleBlockPicker({ onBuild }: { onBuild: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [saved, setSaved] = useState<TitleBlockTemplate[]>([])
  const [prefs, setPrefs] = useState<TitleBlockPrefs>({})
  const tb = titleBlockOf(project)
  useEffect(() => { void loadTemplates().then(setSaved); void loadTBPrefs().then(setPrefs) }, [tb])
  const cur = tb.templateId && saved.some((s) => s.id === tb.templateId) ? tb.templateId : 'project'
  return (
    <span className="row-gap tb-picker">
      <Select value={cur} width={180} onChange={(id) => {
        if (id === 'project') return
        const s = saved.find((x) => x.id === id)
        if (s) apply('Title Block', (d) => { d.titleBlock = useTemplate(s) })
      }} options={[
        { value: 'project', label: cur === 'project' ? `${tb.name} (this project)` : 'This project’s own' },
        ...saved.map((s) => ({ value: s.id, label: `${prefs.defaultId === s.id ? '★ ' : ''}${s.name}` })),
      ]} />
      <button className="mini" onClick={onBuild}>Builder…</button>
    </span>
  )
}

export { cloneTemplate }

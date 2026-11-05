import { useMemo, useRef, useState, type ReactNode } from 'react'
import { SHEETS, sheetsToHTML, sheetSize, titleBlockOf, type SheetOptions } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Field, Modal, Select, TextInput, Toggle } from '../components/ui'
import { pickImage } from '../rack/AccessoryInspector'
import { TitleBlockBuilder, TitleBlockPicker } from './TitleBlockBuilder'
import { createPortal } from 'react-dom'
import { RevisionsEditor } from './RevisionsEditor'

/**
 * Shared print / export dialog for drawings: sheet + title block options on
 * the left, live preview of every sheet on the right, SVG / PDF / Print.
 */
export function DrawingDialog<O extends SheetOptions>({ title, name, options, setOptions, render, extra, onClose }: {
  title: string
  name: string
  options: O
  setOptions: (o: O) => void
  render: (o: O) => string[]
  extra?: ReactNode
  onClose: () => void
}) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const pages = useMemo(() => render(options), [render, options, project]) // eslint-disable-line react-hooks/exhaustive-deps
  const size = sheetSize(options)
  const [zoom, setZoom] = useState(1)
  const [editingTB, setEditingTB] = useState(false)
  // The logo lives in the project's title block (saved with the project); older projects picked one per print.
  const tbLogo = titleBlockOf(project).logo?.dataUrl ?? (project.logos ?? []).find((l) => l.id === options.logoId)?.dataUrl
  const pagesRef = useRef<HTMLDivElement>(null)
  const info = (k: keyof typeof project.info, label: string) => (
    <Field label={label}><TextInput value={String(project.info[k] ?? '')} onCommit={(v) => apply('Title Block', (d) => { (d.info as unknown as Record<string, string>)[k] = v })} /></Field>
  )
  const set = (patch: Partial<SheetOptions>) => setOptions({ ...options, ...patch })
  return (<>
    {editingTB && createPortal(<TitleBlockBuilder onClose={() => setEditingTB(false)} />, document.body)}
    <Modal title={title} onClose={onClose} wide footer={<>
      <span className="muted">{pages.length} sheet{pages.length === 1 ? '' : 's'} · {SHEETS.find((s) => s.key === options.sheet)?.name}</span>
      <span className="spacer" />
      <button disabled={!pages.length} onClick={async () => { const out = await api.exportSVG(pages, name); if (out) notify('Exported SVG') }}>Export SVG…</button>
      <button disabled={!pages.length} onClick={async () => { const out = await api.exportPDF(sheetsToHTML(pages, size), name); if (out) notify(`Exported ${out.split(/[\\/]/).pop()}`) }}>Export PDF…</button>
      <button className="primary" disabled={!pages.length} onClick={() => void api.print(sheetsToHTML(pages, size))}>Print…</button>
    </>}>
      <div className="preview drawing-preview">
        <div className="preview-opts form">
          <h4>Sheet</h4>
          <Field label="Paper"><Select value={options.sheet} onChange={(v) => set({ sheet: v })} options={SHEETS.map((s) => ({ value: s.key, label: s.name }))} /></Field>
          <Toggle label="Portrait" checked={!!options.portrait} onChange={(v) => set({ portrait: v })} />
          {extra}
          <h4>Title block</h4>
          <Toggle label="Show title block" checked={options.titleBlock} onChange={(v) => set({ titleBlock: v })} />
          {options.titleBlock && (<>
            <Field label="Drawing title"><TextInput value={options.title} onCommit={(v) => set({ title: v })} /></Field>
            <Field label="Drawing no."><TextInput value={options.drawingNumber ?? ''} placeholder="e.g. AV-201" onCommit={(v) => set({ drawingNumber: v || undefined })} /></Field>
            {info('name', 'Project')}
            {info('client', 'Client')}
            {info('location', 'Location')}
            {info('designer', 'Designer')}
            {!project.revisions?.length && info('revision', 'Revision')}
            <Field label="Template"><TitleBlockPicker onBuild={() => setEditingTB(true)} /></Field>
            {!titleBlockOf(project).items && <Field label="Logo">
              <span className="row-gap">
                {tbLogo ? <img className="tb-logo-thumb" src={tbLogo} alt="" /> : <span className="muted small">None</span>}
                <button className="mini" onClick={async () => {
                  const img = await pickImage()
                  if (img) apply('Title Block Logo', (d) => { d.titleBlock = { ...structuredClone(titleBlockOf(d)), logo: img } })
                }}>{tbLogo ? 'Replace…' : 'Upload…'}</button>
                {tbLogo && <button className="mini danger" onClick={() => { apply('Title Block Logo', (d) => { d.titleBlock = { ...structuredClone(titleBlockOf(d)), logo: undefined } }); if (options.logoId) set({ logoId: undefined }) }}>Remove</button>}
              </span>
            </Field>}
          </>)}
          <h4>Revisions</h4>
          <RevisionsEditor />
          <h4>Preview</h4>
          <div className="zoom-row">
            <button className="mini" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title="Zoom out">−</button>
            <input type="range" min={0.5} max={6} step={0.05} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
            <button className="mini" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title="Zoom in">+</button>
            <button className="mini" onClick={() => setZoom(1)} title="Fit the sheet to the window">Fit</button>
            <span className="muted small">{Math.round(zoom * 100)}%</span>
          </div>
          <p className="muted small">Drag the sheet to move around when zoomed in.</p>
        </div>
        <div className={`preview-pages ${zoom > 1 ? 'pannable' : ''}`} ref={pagesRef}
          title={zoom > 1 ? 'Drag to move around · ⌘-scroll or pinch to zoom' : '⌘-scroll or pinch to zoom'}
          onPointerDown={(e) => {
            const el = pagesRef.current
            if (!el || e.button !== 0) return
            const start = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop }
            el.setPointerCapture(e.pointerId); el.classList.add('panning')
            const move = (ev: PointerEvent) => { el.scrollLeft = start.l - (ev.clientX - start.x); el.scrollTop = start.t - (ev.clientY - start.y) }
            const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.classList.remove('panning') }
            el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
          }}
          onWheel={(e) => {
            if (!(e.metaKey || e.ctrlKey)) return
            e.preventDefault()
            const el = pagesRef.current!
            const r = el.getBoundingClientRect()
            const fx = (el.scrollLeft + e.clientX - r.left) / el.scrollWidth, fy = (el.scrollTop + e.clientY - r.top) / el.scrollHeight
            const next = Math.min(6, Math.max(0.5, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
            setZoom(next)
            // Keep the point under the cursor in place.
            requestAnimationFrame(() => { el.scrollLeft = fx * el.scrollWidth - (e.clientX - r.left); el.scrollTop = fy * el.scrollHeight - (e.clientY - r.top) })
          }}>
          {pages.length === 0 && <p className="muted pad">Nothing to print yet.</p>}
          {pages.map((svg, i) => (
            <div key={i} className="drawing-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${size.w} / ${size.h}` }} dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
      </div>
    </Modal>
  </>)
}

import { useMemo, useState, type ReactNode } from 'react'
import { SHEETS, sheetsToHTML, sheetSize, type SheetOptions } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Field, Modal, Select, TextInput, Toggle } from '../components/ui'
import { uploadLogo } from '../rack/AccessoryInspector'

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
  const info = (k: keyof typeof project.info, label: string) => (
    <Field label={label}><TextInput value={String(project.info[k] ?? '')} onCommit={(v) => apply('Title Block', (d) => { (d.info as unknown as Record<string, string>)[k] = v })} /></Field>
  )
  const set = (patch: Partial<SheetOptions>) => setOptions({ ...options, ...patch })
  return (
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
            {info('revision', 'Revision')}
            <Field label="Logo">
              <Select value={options.logoId ?? ''} onChange={(v) => set({ logoId: v || undefined })} options={[{ value: '', label: 'None' }, ...(project.logos ?? []).map((l) => ({ value: l.id, label: l.name }))]} />
            </Field>
            <button className="mini" onClick={async () => { const id = await uploadLogo(); if (id) set({ logoId: id }) }}>Upload Logo…</button>
          </>)}
          <h4>Preview</h4>
          <label className="zoom">Zoom <input type="range" min={0.5} max={3} step={0.25} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
        </div>
        <div className="preview-pages">
          {pages.length === 0 && <p className="muted pad">Nothing to print yet.</p>}
          {pages.map((svg, i) => (
            <div key={i} className="drawing-page" style={{ width: `${zoom * 100}%`, aspectRatio: `${size.w} / ${size.h}` }} dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
      </div>
    </Modal>
  )
}

import { useMemo, useState } from 'react'
import { DEFAULT_CONTENT, LABEL_TEMPLATES, labelSheets, labelsFor, fmtLong, type LabelContent, type LabelTemplate, type PullRow } from '@core/index'
import { Modal } from '../components/ui'

interface Saved { templateId: string; custom: LabelTemplate; copies: number; content: LabelContent; offsetX: number; offsetY: number }
const KEY = 'rackflow.cableLabels.v2'
const load = (): Saved => {
  const def: Saved = { templateId: LABEL_TEMPLATES[0].id, custom: { ...LABEL_TEMPLATES[0], id: 'custom', name: 'Custom' }, copies: 2, content: DEFAULT_CONTENT, offsetX: 0, offsetY: 0 }
  try { return { ...def, ...(JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {}) } } catch { return def }
}
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }

/** Prints SVG sheets at exact size (one sheet per page) through a hidden frame. */
function printPages(title: string, pages: string[], t: LabelTemplate) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>
    @page { size: ${t.pageW}in ${t.pageH}in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    svg { display: block; width: ${t.pageW}in; height: ${t.pageH}in; page-break-after: always; break-after: page; }
    svg:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${pages.join('')}</body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  document.body.appendChild(f)
  f.contentDocument!.open(); f.contentDocument!.write(html); f.contentDocument!.close()
  setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 1500) }, 250)
}

/**
 * Wrap-around cable labels for the chosen pull schedule rows: pick the sheet,
 * how many per cable, what to print, and where to start on a partly used
 * sheet. "Print Test Sheet" prints outlines only – hold it against a label
 * sheet to check the alignment, then nudge with the offsets.
 */
export function CableLabelsDialog({ rows, scope, project, onClose }: { rows: PullRow[]; scope: string; project: string; onClose: () => void }) {
  const [s, setS] = useState<Saved>(load)
  const [skip, setSkip] = useState(0)
  const upd = (patch: Partial<Saved>) => { const next = { ...s, ...patch }; setS(next); save(next) }
  const t: LabelTemplate = s.templateId === 'custom' ? s.custom : LABEL_TEMPLATES.find((x) => x.id === s.templateId) ?? LABEL_TEMPLATES[0]
  const per = t.cols * t.rows
  const labels = useMemo(() => labelsFor(rows, { copies: s.copies, content: s.content }, (r) => (r.cable?.lengthMeters != null ? fmtLong(r.cable.lengthMeters) : '')), [rows, s.copies, s.content])
  const opts = { copies: s.copies, content: s.content, skip, offsetX: s.offsetX, offsetY: s.offsetY }
  const preview = useMemo(() => labelSheets(t, labels, { ...opts, outlines: true })[0]?.replace(/width="[^"]+in" height="[^"]+in"/, 'width="100%" height="100%"') ?? '', [t, labels, skip, s.offsetX, s.offsetY])
  const sheets = Math.max(1, Math.ceil((labels.length + Math.min(skip, per - 1)) / per))
  const cables = rows.filter((r) => r.cable).length
  const num = (v: string, f: number) => { const x = parseFloat(v); return Number.isFinite(x) ? x : f }
  const field = (k: keyof LabelTemplate, label: string, step = 0.01) => (
    <label className="cl-field">{label}<input type="number" step={step} value={t[k] as number} disabled={s.templateId !== 'custom'}
      onChange={(e) => upd({ custom: { ...s.custom, [k]: num(e.target.value, t[k] as number) } })} /></label>
  )
  const toggle = (k: keyof LabelContent, label: string) => (
    <label className="toggle small"><input type="checkbox" checked={s.content[k]} onChange={(e) => upd({ content: { ...s.content, [k]: e.target.checked } })} /> {label}</label>
  )

  return (
    <Modal title="Print Cable Labels" onClose={onClose} wide footer={<>
      <span className="muted">{cables} cable{cables === 1 ? '' : 's'} ({scope}) · {labels.length} labels · {sheets} sheet{sheets === 1 ? '' : 's'}</span>
      <span className="spacer" />
      <button onClick={() => printPages(`${project} – label test`, labelSheets(t, [], { ...opts, skip: 0, outlines: true }), t)} title="Outlines only – hold it against a label sheet to check alignment">Print Test Sheet</button>
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!labels.length} onClick={() => printPages(`${project} – cable labels`, labelSheets(t, labels, opts), t)}>Print {labels.length} Labels…</button>
    </>}>
      <div className="cable-labels">
        <div className="cl-side form">
          <label className="field-label">Label sheet</label>
          <select value={s.templateId} onChange={(e) => upd(e.target.value === 'custom' ? { templateId: 'custom', custom: { ...t, id: 'custom', name: 'Custom' } } : { templateId: e.target.value })}>
            {LABEL_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="custom">Custom…</option>
          </select>
          <div className="cl-grid">
            {field('labelW', 'Label W (in)')}{field('labelH', 'Label H (in)')}{field('printH', 'Print area H')}
            {field('cols', 'Across', 1)}{field('rows', 'Down', 1)}{field('gapX', 'Gap across')}
            {field('gapY', 'Gap down')}{field('left', 'Left margin')}{field('top', 'Top margin')}
          </div>
          {s.templateId !== 'custom' && <p className="muted small" style={{ margin: 0 }}>Pick Custom… to change any measurement (starts from this sheet).</p>}
          <label className="field-label">On each label</label>
          <div className="cl-toggles">{toggle('cable', 'Cable number')}{toggle('from', 'From (device + port)')}{toggle('to', 'To (device + port)')}{toggle('type', 'Cable type')}{toggle('length', 'Length')}</div>
          <div className="cl-grid">
            <label className="cl-field">Labels per cable<select value={s.copies} onChange={(e) => upd({ copies: +e.target.value })}>{[1, 2, 3, 4].map((k) => <option key={k} value={k}>{k}{k === 2 ? ' (each end)' : ''}</option>)}</select></label>
            <label className="cl-field">Start at label<input type="number" min={1} max={per} value={skip + 1} onChange={(e) => setSkip(Math.max(0, Math.min(per - 1, num(e.target.value, 1) - 1)))} /></label>
            <span />
            <label className="cl-field">Nudge right (in)<input type="number" step={0.01} value={s.offsetX} onChange={(e) => upd({ offsetX: num(e.target.value, 0) })} /></label>
            <label className="cl-field">Nudge down (in)<input type="number" step={0.01} value={s.offsetY} onChange={(e) => upd({ offsetY: num(e.target.value, 0) })} /></label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Print at <b>100% / Actual size</b> (no “fit to page”). Run a test sheet on plain paper first and hold it against a label sheet; nudge if it’s off. “Start at label” skips used labels on a partly used sheet.</p>
        </div>
        <div className="cl-preview" style={{ aspectRatio: `${t.pageW} / ${t.pageH}` }} dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
    </Modal>
  )
}

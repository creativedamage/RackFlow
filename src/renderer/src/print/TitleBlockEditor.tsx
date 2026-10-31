import { useEffect, useMemo, useState } from 'react'
import { cloneTemplate, defaultTitleBlock, newId, newSheet, TB_SOURCES, titleBlockOf, twoRowTitleBlock, type TBField, type TitleBlockTemplate } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Modal, NumberInput, Select } from '../components/ui'
import { pickImage } from '../rack/AccessoryInspector'

/** Saved title block templates (app-wide, shared by every project). */
export async function loadTemplates(): Promise<TitleBlockTemplate[]> {
  return ((await api.storeGet<TitleBlockTemplate[]>('TitleBlocks')) ?? []).filter((t) => t && Array.isArray(t.fields))
}
const saveTemplates = (ts: TitleBlockTemplate[]) => api.storeSet('TitleBlocks', ts)

/**
 * Title block designer: fields (what each box shows, its caption, width, row,
 * size), height, logo and its side, with a live preview. "Use for This
 * Project" saves it (logo included) in the project; "Save as Template" keeps a
 * copy for other projects.
 */
export function TitleBlockEditor({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [t, setT] = useState<TitleBlockTemplate>(() => structuredClone(titleBlockOf(project)))
  const [saved, setSaved] = useState<TitleBlockTemplate[]>([])
  const [tplName, setTplName] = useState('')
  useEffect(() => { void loadTemplates().then(setSaved) }, [])
  const upd = (patch: Partial<TitleBlockTemplate>) => setT({ ...t, ...patch })
  const updF = (id: string, patch: Partial<TBField>) => setT({ ...t, fields: t.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const move = (id: string, d: -1 | 1) => {
    const i = t.fields.findIndex((f) => f.id === id), j = i + d
    if (j < 0 || j >= t.fields.length) return
    const fs = [...t.fields]; [fs[i], fs[j]] = [fs[j], fs[i]]; setT({ ...t, fields: fs })
  }
  // Live preview: a Tabloid sheet with this title block, cropped to the bottom strip.
  const preview = useMemo(() => {
    const { svg } = newSheet({ ...project, titleBlock: t }, { sheet: 'ansiB', titleBlock: true, title: 'SIGNAL FLOW' }, 1, 3, 'AUDIO', 'AV101')
    const H = 279.4, h = t.height + 8
    return svg.toString().replace(/viewBox="[^"]*"/, `viewBox="2 ${H - h - 2} 428 ${h + 1}"`).replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="100%"')
  }, [project, t])

  const starters: { label: string; make: () => TitleBlockTemplate }[] = [
    { label: 'Standard (one row)', make: defaultTitleBlock },
    { label: 'Two rows with company block', make: twoRowTitleBlock },
  ]

  return (
    <Modal title="Title Block" onClose={onClose} wide footer={<>
      <input value={tplName} placeholder="Template name" onChange={(e) => setTplName(e.target.value)} style={{ width: 180 }} />
      <button onClick={async () => {
        const name = tplName.trim() || t.name || 'My title block'
        const next = [...saved.filter((x) => x.name !== name), { ...cloneTemplate(t, name) }]
        await saveTemplates(next); setSaved(next); setTplName('')
        notify(`Saved title block template “${name}” – available in every project`, { kind: 'success' })
      }} title="Keep this layout (and logo) for other projects">Save as Template</button>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" onClick={() => { apply('Title Block', (d) => { d.titleBlock = structuredClone(t) }); onClose() }}>Use for This Project</button>
    </>}>
      <div className="tb-editor">
        <div className="tb-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        <div className="tb-cols">
          <div className="form tb-side">
            <h4>Start from</h4>
            <div className="tb-starts">
              {starters.map((s) => <button key={s.label} className="mini" onClick={() => setT({ ...s.make(), logo: t.logo, logoSide: t.logoSide })}>{s.label}</button>)}
              {saved.map((s) => (
                <span key={s.id} className="tb-saved">
                  <button className="mini" onClick={() => setT(structuredClone({ ...s, id: s.id }))} title="Load this saved template">{s.name}</button>
                  <button className="mini danger" title="Delete this saved template" onClick={async () => { const next = saved.filter((x) => x.id !== s.id); await saveTemplates(next); setSaved(next) }}>×</button>
                </span>
              ))}
            </div>
            <h4>Size</h4>
            <label className="tb-inline">Height <NumberInput value={t.height} min={14} max={80} unit="mm" width={60} onCommit={(v) => upd({ height: v ?? t.height })} /></label>
            <h4>Logo</h4>
            {t.logo ? <div className="logo-preview finish-white"><img src={t.logo.dataUrl} alt={t.logo.name} /></div> : <p className="muted small">No logo.</p>}
            <div className="row-gap">
              <button className="mini" onClick={async () => { const img = await pickImage(); if (img) upd({ logo: img }) }}>{t.logo ? 'Replace…' : 'Upload Logo…'}</button>
              {(project.logos ?? []).length > 0 && (
                <Select value="" width={120} onChange={(id) => { const l = project.logos?.find((x) => x.id === id); if (l) upd({ logo: { name: l.name, dataUrl: l.dataUrl } }) }}
                  options={[{ value: '', label: 'From project…' }, ...(project.logos ?? []).map((l) => ({ value: l.id, label: l.name }))]} />
              )}
              {t.logo && <button className="mini danger" onClick={() => upd({ logo: undefined })}>Remove</button>}
            </div>
            {t.logo && (<>
              <label className="tb-inline">Side <Select value={t.logoSide} onChange={(v) => upd({ logoSide: v })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} /></label>
              <label className="tb-inline">Width <NumberInput value={t.logoWidth} min={15} max={120} unit="mm" width={60} onCommit={(v) => upd({ logoWidth: v ?? t.logoWidth })} /></label>
            </>)}
            <p className="muted small">The logo is saved with the project (and inside any template you save), so it’s there next time.</p>
          </div>
          <div className="tb-fields">
            <table>
              <thead><tr><th>Caption</th><th>Shows</th><th>Text</th><th>Width</th><th>Row</th><th>Big</th><th /></tr></thead>
              <tbody>
                {t.fields.map((f) => (
                  <tr key={f.id}>
                    <td><input value={f.label} onChange={(e) => updF(f.id, { label: e.target.value.toUpperCase() })} style={{ width: 100 }} /></td>
                    <td><Select value={f.source} onChange={(v) => updF(f.id, { source: v })} options={TB_SOURCES} /></td>
                    <td>{f.source === 'custom'
                      ? <textarea rows={2} value={f.text ?? ''} onChange={(e) => updF(f.id, { text: e.target.value })} placeholder="Company, address, licence…" />
                      : <span className="muted small">from project</span>}</td>
                    <td><NumberInput value={f.width} min={1} max={100} width={50} onCommit={(v) => updF(f.id, { width: v ?? f.width })} /></td>
                    <td><Select value={f.row} onChange={(v) => updF(f.id, { row: v as 0 | 1 })} options={[{ value: 0, label: 'Top' }, { value: 1, label: 'Bottom' }]} /></td>
                    <td><input type="checkbox" checked={!!f.big} onChange={(e) => updF(f.id, { big: e.target.checked })} /></td>
                    <td className="tb-row-btns">
                      <button className="mini" onClick={() => move(f.id, -1)} title="Move left">◀</button>
                      <button className="mini" onClick={() => move(f.id, 1)} title="Move right">▶</button>
                      <button className="mini danger" onClick={() => setT({ ...t, fields: t.fields.filter((x) => x.id !== f.id) })} title="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mini" onClick={() => setT({ ...t, fields: [...t.fields, { id: newId(), label: 'NOTES', source: 'custom', text: '', width: 15, row: 0 }] })}>＋ Add Box</button>
            <p className="muted small">Width is relative within its row. Put boxes on the Bottom row to split the block into two rows. “Fixed text” boxes can hold several lines (company name, address, stamp…).</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

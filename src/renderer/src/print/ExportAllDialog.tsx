import { useMemo, useState } from 'react'
import { buildExport, EXPORT_PARTS, SHEETS, type ExportPart } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Field, Modal, Select, Toggle } from '../components/ui'

/** File › Export Everything: every page, rack elevation, patch label, LED map and schedule in one folder. */
export function ExportAllDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const notify = useStore((s) => s.notify)
  const [parts, setParts] = useState<Set<ExportPart>>(new Set(EXPORT_PARTS.map((p) => p.key)))
  const [sheet, setSheet] = useState('ansiB')
  const [busy, setBusy] = useState(false)
  const available = useMemo(() => new Map(buildExport(project, EXPORT_PARTS.map((p) => p.key), sheet).map((f) => [f.name, f.count])), [project, sheet])
  const run = async () => {
    setBusy(true)
    try {
      const files = buildExport(project, [...parts], sheet)
      if (!files.length) { notify('Nothing to export yet', { kind: 'info' }); return }
      const stamp = new Date().toISOString().slice(0, 10)
      const dir = await api.exportAll(files, `${project.info.name || 'Untitled Project'} – Export ${stamp}`)
      if (dir) { notify(`Exported ${files.length} file${files.length === 1 ? '' : 's'} to ${dir.split(/[\\/]/).pop()}`, { kind: 'success' }); onClose() }
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Export Everything" onClose={onClose} footer={<>
      <span className="muted">{busy ? 'Exporting…' : `${[...parts].filter((k) => available.has(EXPORT_PARTS.find((p) => p.key === k)!.file)).length} files`}</span>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={busy || !parts.size} onClick={() => void run()}>{busy ? 'Exporting…' : 'Export…'}</button>
    </>}>
      <div className="form" style={{ padding: 16, minWidth: 440 }}>
        <p className="muted small">Saves a new folder with every drawing as a PDF and every schedule as a CSV (opens in Excel / Numbers / Google Sheets).</p>
        {EXPORT_PARTS.map((p) => {
          const n = available.get(p.file)
          return (
            <div key={p.key} className="export-row">
              <Toggle label={p.name} checked={parts.has(p.key) && !!n} onChange={(on) => { const next = new Set(parts); if (on) next.add(p.key); else next.delete(p.key); setParts(next) }} />
              <span className="muted small">{n ? `${n} ${p.file.endsWith('.csv') ? 'rows' : n === 1 ? 'sheet' : 'sheets'}` : 'nothing yet'}</span>
            </div>
          )
        })}
        <Field label="Drawing sheet"><Select value={sheet} onChange={setSheet} options={SHEETS.map((s) => ({ value: s.key, label: s.name }))} /></Field>
        <p className="muted small">The wiring diagram uses ARCH D when Tabloid is chosen so busy pages stay readable; it prints one sheet per page. Title blocks, logos and revisions come from your print settings.</p>
      </div>
    </Modal>
  )
}

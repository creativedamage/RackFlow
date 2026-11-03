import { useMemo, useState } from 'react'
import { buildExport, EXPORT_PARTS, exportChoices, GENERAL_PAGE, SHEETS, type ExportPart, type ExportSelection } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Field, Modal, Select, Toggle } from '../components/ui'

type Picks = Partial<Record<ExportPart, string[]>>
const SEL_KEY: Partial<Record<ExportPart, keyof ExportSelection>> = { wiring: 'sheets', racks: 'racks', panels: 'panels', labels: 'bays', led: 'walls' }

/** What the Export button starts with: the thing you're looking at. */
let preset: { parts: ExportPart[]; picks?: Picks } | null = null

/** Opens Export with the current page / view / rack / bay / wall / table ticked. */
export function openExport(all = false) {
  const s = useStore.getState()
  if (all) preset = null
  else switch (s.mode) {
    case 'diagram': {
      const sheet = s.diagramView ?? s.diagramPage ?? null
      const plates = s.selection.filter((id) => s.project.equipment.find((e) => e.id === id)?.product.plate).map(String)
      preset = { parts: ['wiring', ...(plates.length ? ['panels' as const] : [])], picks: { ...(sheet ? { wiring: [sheet] } : {}), ...(plates.length ? { panels: plates } : {}) } }
      break
    }
    case 'rack': preset = { parts: ['racks'], picks: s.selectedRack ? { racks: [s.selectedRack] } : {} }; break
    case 'patch': preset = { parts: ['labels'], picks: s.selectedBay ? { labels: [s.selectedBay] } : {} }; break
    case 'led': preset = { parts: ['led'], picks: s.selectedLedWall ? { led: [s.selectedLedWall] } : {} }; break
    case 'boxes': { const b = s.selectedBox ?? s.project.equipment.find((e) => e.product.plate)?.id; preset = { parts: ['panels'], picks: b ? { panels: [b] } : {} }; break }
    case 'sheet': {
      const tab = document.querySelector('.schedule-tabs button.on')?.textContent ?? ''
      const part: ExportPart = /pull/i.test(tab) ? 'pull' : /device/i.test(tab) ? 'equipment' : /switch/i.test(tab) ? 'switchports' : /network/i.test(tab) ? 'network' : /box/i.test(tab) ? 'panels' : 'cables'
      preset = { parts: [part] }
      break
    }
    default: preset = null
  }
  s.set({ exportingAll: true })
}

/**
 * Export: tick the drawings and schedules you want – and, inside each, which
 * pages, racks, boxes, bays or walls – then save them to a folder (PDFs and
 * CSVs), or print a single drawing straight away.
 */
export function ExportAllDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const notify = useStore((s) => s.notify)
  const [init] = useState(() => { const p = preset; preset = null; return p })
  const choices = useMemo(() => exportChoices(project), [project])
  const [parts, setParts] = useState<Set<ExportPart>>(new Set(init?.parts ?? EXPORT_PARTS.map((p) => p.key)))
  const [picks, setPicks] = useState<Picks>(() => {
    const out: Picks = {}
    for (const [k, list] of Object.entries(choices) as [ExportPart, { id: string }[]][]) {
      const want = init?.picks?.[k]
      out[k] = want ? list.filter((c) => want.includes(c.id) || (k === 'wiring' && want.includes(GENERAL_PAGE) && c.id === GENERAL_PAGE)).map((c) => c.id) : list.map((c) => c.id)
      if (want && !out[k]!.length) out[k] = list.map((c) => c.id)
    }
    return out
  })
  const [open, setOpen] = useState<ExportPart | null>(init?.parts.length === 1 && (choices[init.parts[0]]?.length ?? 0) > 1 ? init.parts[0] : null)
  const [perBox, setPerBox] = useState(true)
  const [sheet, setSheet] = useState('ansiB')
  const [busy, setBusy] = useState(false)

  const sel: ExportSelection = useMemo(() => {
    const out: ExportSelection = { panelsPerBox: perBox }
    for (const [part, key] of Object.entries(SEL_KEY) as [ExportPart, keyof ExportSelection][]) {
      const all = choices[part] ?? [], picked = picks[part] ?? []
      if (picked.length < all.length) (out as Record<string, unknown>)[key] = picked
    }
    return out
  }, [picks, choices, perBox])
  const files = useMemo(() => buildExport(project, [...parts], sheet, sel), [project, parts, sheet, sel])
  const counts = useMemo(() => new Map(buildExport(project, EXPORT_PARTS.map((p) => p.key), sheet, sel).map((f) => [f.name, f.count])), [project, sheet, sel])
  const pdfs = files.filter((f) => f.kind === 'pdf')

  const run = async () => {
    setBusy(true)
    try {
      if (!files.length) { notify('Nothing selected to export', { kind: 'info' }); return }
      const stamp = new Date().toISOString().slice(0, 10)
      const dir = await api.exportAll(files, `${project.info.name || 'Untitled Project'} – Export ${stamp}`)
      if (dir) { notify(`Exported ${files.length} file${files.length === 1 ? '' : 's'} to ${dir.split(/[\\/]/).pop()}`, { kind: 'success' }); onClose() }
    } finally { setBusy(false) }
  }
  const print = async () => { if (pdfs.length === 1) { await api.print(pdfs[0].content); onClose() } }
  const togglePick = (part: ExportPart, id: string, on: boolean) => setPicks((cur) => ({ ...cur, [part]: on ? [...(cur[part] ?? []), id] : (cur[part] ?? []).filter((x) => x !== id) }))

  return (
    <Modal title="Export" onClose={onClose} footer={<>
      <span className="muted">{busy ? 'Exporting…' : `${files.length} file${files.length === 1 ? '' : 's'}`}</span>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button disabled={busy || pdfs.length !== 1} onClick={() => void print()} title={pdfs.length === 1 ? 'Print this drawing now (or save it as a PDF from the print dialog)' : 'Pick a single drawing to print it directly'}>Print…</button>
      <button className="primary" disabled={busy || !files.length} onClick={() => void run()}>{busy ? 'Exporting…' : 'Export to Folder…'}</button>
    </>}>
      <div className="form export-form" style={{ padding: 16, minWidth: 480 }}>
        <p className="muted small">Tick what you want. Drawings save as PDFs, schedules as CSVs (Excel / Numbers / Google Sheets). Use “Choose” to pick pages, racks, boxes or bays.</p>
        {EXPORT_PARTS.map((p) => {
          const n = counts.get(p.file)
          const list = choices[p.key] ?? []
          const picked = picks[p.key] ?? []
          const on = parts.has(p.key) && !!n
          return (
            <div key={p.key} className="export-part">
              <div className="export-row">
                <Toggle label={p.name} checked={on} onChange={(v) => { const next = new Set(parts); if (v) next.add(p.key); else next.delete(p.key); setParts(next) }} />
                <span className="muted small">{n ? `${n} ${p.file.endsWith('.csv') ? 'rows' : n === 1 ? 'sheet' : 'sheets'}` : 'nothing selected'}</span>
                {list.length > 1 && <button className="mini" onClick={() => setOpen(open === p.key ? null : p.key)}>{picked.length === list.length ? 'All' : `${picked.length} of ${list.length}`} ▾</button>}
              </div>
              {open === p.key && (
                <div className="export-picks">
                  <div className="export-picks-bar">
                    <button className="link" onClick={() => setPicks((c) => ({ ...c, [p.key]: list.map((x) => x.id) }))}>All</button>
                    <button className="link" onClick={() => setPicks((c) => ({ ...c, [p.key]: [] }))}>None</button>
                  </div>
                  {list.map((c) => (
                    <label key={c.id} className="check"><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => togglePick(p.key, c.id, e.target.checked)} /> {c.label}</label>
                  ))}
                </div>
              )}
              {p.key === 'panels' && on && (
                <div className="export-sub"><Toggle label="One sheet per box (shows where each goes); off = identical boxes share a sheet with a location table" checked={perBox} onChange={setPerBox} /></div>
              )}
            </div>
          )
        })}
        <Field label="Drawing sheet"><Select value={sheet} onChange={setSheet} options={SHEETS.map((s) => ({ value: s.key, label: s.name }))} /></Field>
        <p className="muted small">The wiring diagram uses ARCH D when Tabloid is chosen so busy pages stay readable. Title blocks, logos and revisions come from your print settings.</p>
      </div>
    </Modal>
  )
}

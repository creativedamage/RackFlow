import { useCallback, useMemo, useState } from 'react'
import {
  CABLE_CATALOG, cableSpec, DOMAINS, fittingCables, fromLong, longUnit, pullCells, pullDone, PULL_HEAD, pullRows, pullScheduleCSV, resolve, toLong,
  type PullRow, type SignalDomain,
} from '@core/index'
import { useStore } from '../store'
import { Select } from '../components/ui'
import { Sheet, type SheetColumn } from './Sheet'
import { CableLabelsDialog } from './CableLabelsDialog'

type Stage = '' | 'notPulled' | 'notTerminated' | 'notTested' | 'done' | 'unwired'
const YES = /^(y|yes|x|✓|✔|true|1|done)$/i

/**
 * Pull schedule: every cable with both ends located (room, rack/RU, device,
 * port, connector), its type, length and pathway, plus pulled / terminated /
 * tested check-offs – and optionally every port that has no cable yet.
 */
export function PullSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [q, setQ] = useState('')
  const [system, setSystem] = useState<SignalDomain | ''>('')
  const [stage, setStage] = useState<Stage>('')
  const [unwired, setUnwired] = useState(true)
  const [picked, setPicked] = useState<PullRow[]>([])
  const [labels, setLabels] = useState(false)

  const all = useMemo(() => pullRows(project, { unwired }), [project, unwired])
  const cables = all.filter((r) => r.cable)
  const done = (k: 'pulled' | 'terminated' | 'tested') => cables.filter((r) => pullDone(r, k)).length
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => {
      if (system && r.system !== system) return false
      if (stage === 'unwired' && r.cable) return false
      if (stage && stage !== 'unwired' && !r.cable) return false
      if (stage === 'notPulled' && pullDone(r, 'pulled')) return false
      if (stage === 'notTerminated' && pullDone(r, 'terminated')) return false
      if (stage === 'notTested' && pullDone(r, 'tested')) return false
      if (stage === 'done' && !(pullDone(r, 'pulled') && pullDone(r, 'terminated') && pullDone(r, 'tested'))) return false
      return !s || pullCells(r).join(' ').toLowerCase().includes(s)
    })
  }, [all, q, system, stage])

  const check = (k: 'pulled' | 'terminated' | 'tested', title: string): SheetColumn<PullRow> => ({
    key: k, title, width: 84, align: 'center',
    get: (r) => (r.cable ? (pullDone(r, k) ? '✓' : '') : ''),
    value: (r) => (pullDone(r, k) ? 'yes' : ''),
    options: (r) => (r.cable ? [{ value: '', label: '—' }, { value: 'yes', label: '✓ Yes' }] : []),
    render: (r) => (r.cable ? <span className={`pull-check ${pullDone(r, k) ? 'on' : ''}`}>{pullDone(r, k) ? '✓' : ''}</span> : null),
    set: (r, v) => { if (!r.cable) return; r.cable.pull = { ...r.cable.pull, [k]: YES.test(v.trim()) || undefined } },
  })
  const endCols = (side: 'from' | 'to', title: string): SheetColumn<PullRow>[] => {
    const e = (r: PullRow) => (side === 'from' ? r.from : r.to)
    return [
      { key: `${side}Room`, title: `${title} Room`, width: 110, get: (r) => e(r)?.room ?? '', set: () => { /* handled in commit */ } },
      { key: `${side}Rack`, title: `${title} Rack`, width: 96, get: (r) => e(r)?.rack ?? '' },
      { key: `${side}Tag`, title: `${title} Device`, width: 90, get: (r) => e(r)?.tag ?? '', render: (r) => <b>{e(r)?.tag ?? ''}</b> },
      { key: `${side}Port`, title: `${title} Port`, width: 130, get: (r) => e(r)?.port ?? '' },
      { key: `${side}Conn`, title: `${title} Conn.`, width: 110, get: (r) => e(r)?.connector ?? '' },
    ]
  }

  const columns = useMemo<SheetColumn<PullRow>[]>(() => [
    { key: 'label', title: 'Cable #', width: 110, get: (r) => r.label || (r.cable ? '' : 'Unwired'), render: (r) => (r.cable ? <b>{r.label}</b> : <span className="muted">Unwired</span>),
      set: (r, v) => { if (r.cable) r.cable.label = v.trim() } },
    { key: 'system', title: 'System', width: 84, get: (r) => (r.system ? DOMAINS[r.system].name : '—'),
      render: (r) => <span className="sys"><i style={{ background: r.system ? DOMAINS[r.system].color : '#999' }} />{r.system ? DOMAINS[r.system].name : '—'}</span> },
    { key: 'type', title: 'Cable', width: 210, get: (r) => (r.cable ? (r.channels ? `${r.type} · ${r.channels.used}/${r.channels.of} ch` : r.type) : ''), value: (r) => r.cable?.specKey ?? '',
      options: (r) => {
        if (!r.cable) return []
        const a = resolve(project, r.cable.from), b = resolve(project, r.cable.to)
        const fit = a && b ? fittingCables(a.port, b.port) : CABLE_CATALOG
        return [{ value: '', label: 'TBD' }, ...fit.map((f) => ({ value: f.key, label: f.name }))]
      },
      set: (r, v) => {
        if (!r.cable) return
        const t = v.trim()
        if (!t || /^tbd$/i.test(t)) { r.cable.specKey = null; return }
        const hit = CABLE_CATALOG.find((c) => c.key === t || c.name.toLowerCase() === t.toLowerCase()) ?? cableSpec(t)
        if (hit) r.cable.specKey = hit.key
      } },
    { key: 'length', title: `Length (${longUnit()})`, width: 84, numeric: true, get: (r) => (r.cable?.lengthMeters == null ? '' : String(Number(toLong(r.cable.lengthMeters).toFixed(1)))),
      set: (r, v) => { if (!r.cable) return; const n = parseFloat(v.replace(',', '.')); r.cable.lengthMeters = v.trim() === '' || isNaN(n) ? null : Math.max(0, fromLong(n)) } },
    ...endCols('from', 'From'),
    ...endCols('to', 'To'),
    { key: 'pathway', title: 'Pathway', width: 150, get: (r) => r.cable?.pull?.pathway ?? '', set: (r, v) => { if (r.cable) r.cable.pull = { ...r.cable.pull, pathway: v.trim() || undefined } } },
    check('pulled', 'Pulled'), check('terminated', 'Terminated'), check('tested', 'Tested'),
    { key: 'notes', title: 'Notes', width: 200, get: (r) => r.cable?.notes ?? '', set: (r, v) => { if (r.cable) r.cable.notes = v } },
  ], [project])

  // Edits land on the draft's cables (and devices, for rooms) as one undo step.
  const commit = useCallback((label: string, changes: { row: PullRow; col: SheetColumn<PullRow>; value: string }[]) => {
    apply(label, (d) => {
      for (const ch of changes) {
        if (ch.col.key === 'fromRoom' || ch.col.key === 'toRoom') {
          const id = ch.col.key === 'fromRoom' ? ch.row.fromId : ch.row.toId
          const e = id ? d.equipment.find((x) => x.id === id) : undefined
          if (e) e.room = ch.value.trim()
          continue
        }
        // A snake row edits every channel in it.
        for (const one of ch.row.cables) {
          const cable = d.cables.find((c) => c.id === one.id)
          if (cable) ch.col.set?.({ ...ch.row, cable }, ch.value)
        }
      }
    })
  }, [apply])

  const name = project.info.name || 'Project'
  const print = () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const head = PULL_HEAD()
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} – Pull Schedule</title><style>
      @page { size: 17in 11in; margin: 0.4in; }
      body { font: 9px -apple-system, Helvetica, Arial, sans-serif; color: #000; }
      h1 { font-size: 15px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 8px; }
      table { border-collapse: collapse; width: 100%; } th, td { border: 0.6px solid #888; padding: 2px 4px; text-align: left; vertical-align: top; }
      th { background: #eee; font-size: 8px; text-transform: uppercase; } tr { break-inside: avoid; } td.c { text-align: center; }
    </style></head><body><h1>${esc(name)} – Cable Pull Schedule</h1>
      <div class="sub">${cables.length} pulls · ${done('pulled')} pulled · ${done('terminated')} terminated · ${done('tested')} tested · printed ${new Date().toLocaleDateString()}</div>
      <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${pullCells(r).map((c, i) => `<td${i >= 17 && i <= 19 ? ' class="c"' : ''}>${esc(i >= 17 && i <= 19 ? (c ? '✓' : (r.cable ? '☐' : '')) : c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></body></html>`
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
    document.body.appendChild(f)
    f.contentDocument!.open(); f.contentDocument!.write(html); f.contentDocument!.close()
    setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 1000) }, 200)
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([pullScheduleCSV(project, { unwired })], { type: 'text/csv' }))
    a.download = `${name} pull schedule.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const systems = [...new Set(all.map((r) => r.system).filter(Boolean))] as SignalDomain[]
  const unwiredN = all.length - cables.length

  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter cables, rooms, ports…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={system} onChange={setSystem} options={[{ value: '', label: 'All systems' }, ...systems.map((d) => ({ value: d, label: DOMAINS[d].name }))]} />
        <Select value={stage} onChange={setStage} options={[
          { value: '', label: 'Every row' }, { value: 'notPulled', label: 'Not pulled yet' }, { value: 'notTerminated', label: 'Not terminated' },
          { value: 'notTested', label: 'Not tested' }, { value: 'done', label: 'Complete' }, { value: 'unwired', label: 'Unwired ports' }]} />
        <label className="toggle small"><input type="checkbox" checked={unwired} onChange={(e) => setUnwired(e.target.checked)} /> Unwired ports{unwired ? ` (${unwiredN})` : ''}</label>
        <span className="pull-progress small" title="Install progress">
          <b>{cables.length}</b> pulls · <b>{done('pulled')}</b> pulled · <b>{done('terminated')}</b> terminated · <b>{done('tested')}</b> tested
        </span>
        <span className="spacer" />
        <button disabled={!rows.some((r) => r.cable)} onClick={() => setLabels(true)} title="Wrap-around cable labels for the selected rows (or every row shown)">Print Labels…</button>
        <button disabled={!rows.length} onClick={print} title="Print or save as PDF (tabloid landscape) – the rows shown">Print Schedule…</button>
        <button disabled={!all.length} onClick={download}>Export CSV</button>
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.key} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.cable ? (pullDone(r, 'pulled') && pullDone(r, 'terminated') && pullDone(r, 'tested') ? 'done' : '') : 'unwired')}
        emptyText="No cables yet. Wire devices on the Wiring Diagram and they appear here." />
      {labels && <CableLabelsDialog project={name} onClose={() => setLabels(false)}
        rows={picked.filter((r) => r.cable).length > 1 ? picked : rows} scope={picked.filter((r) => r.cable).length > 1 ? 'selected rows' : q || system || stage ? 'filtered rows' : 'all'} />}
    </>
  )
}

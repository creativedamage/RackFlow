import { useCallback, useMemo, useState } from 'react'
import {
  addToGroup, createGroup, groupColor, groupsOf, removeFromGroup, CABLE_CATALOG, cableRows, cablesToCSV, cableSpec, CATEGORIES, defaultSchemes, DOMAINS, findRack, fittingCables, renumberCables, resolve,
  type CableId, type CableRow, type EquipmentInstance, type NumberScheme, type RenumberOrder, type SignalDomain,
} from '@core/index'
import { useStore } from '../store'
import { Modal, NumberInput, Select } from '../components/ui'
import { Sheet, type SheetColumn } from './Sheet'

type Tab = 'cables' | 'devices'

/** Spreadsheet view of the whole project: every cable and every device, editable in bulk. */
export function ScheduleView() {
  const [tab, setTab] = useState<Tab>('cables')
  return (
    <div className="schedule">
      <div className="schedule-tabs">
        <button className={tab === 'cables' ? 'on' : ''} onClick={() => setTab('cables')}>Cables</button>
        <button className={tab === 'devices' ? 'on' : ''} onClick={() => setTab('devices')}>Devices</button>
        <span className="muted small hint">Click, Shift-click or drag to select · type or Enter to edit · ⌘C / ⌘V with Excel, Numbers or Google Sheets · ⌘D fill down · click a header to sort</span>
      </div>
      {tab === 'cables' ? <CableSheet /> : <DeviceSheet />}
    </div>
  )
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// MARK: Cables

function CableSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [q, setQ] = useState('')
  const [system, setSystem] = useState<SignalDomain | 'other' | ''>('')
  const [picked, setPicked] = useState<CableRow[]>([])
  const [renumber, setRenumber] = useState(false)

  const all = useMemo(() => cableRows(project), [project])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => (!system || (r.system ?? 'other') === system)
      && (!s || [r.cable.label, r.fromTag, r.fromPort, r.toTag, r.toPort, r.signal, r.cableType, r.cable.notes].join(' ').toLowerCase().includes(s)))
  }, [all, q, system])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) m.set(r.system ?? 'other', (m.get(r.system ?? 'other') ?? 0) + 1)
    return m
  }, [all])

  const columns = useMemo<SheetColumn<CableRow>[]>(() => [
    { key: 'label', title: 'Label', width: 110, get: (r) => r.cable.label, set: (r, v) => { r.cable.label = v.trim() } },
    { key: 'system', title: 'System', width: 90, get: (r) => (r.system ? DOMAINS[r.system].name : '—'),
      render: (r) => <span className="sys"><i style={{ background: r.system ? DOMAINS[r.system].color : '#999' }} />{r.system ? DOMAINS[r.system].name : '—'}</span> },
    { key: 'from', title: 'From', width: 100, get: (r) => r.fromTag },
    { key: 'fromPort', title: 'From Port', width: 150, get: (r) => r.fromPort },
    { key: 'to', title: 'To', width: 100, get: (r) => r.toTag },
    { key: 'toPort', title: 'To Port', width: 150, get: (r) => r.toPort },
    { key: 'signal', title: 'Signal', width: 120, get: (r) => r.signal },
    { key: 'type', title: 'Cable Type', width: 230, get: (r) => r.cableType || 'TBD', value: (r) => r.cable.specKey ?? '',
      options: (r) => {
        const a = resolve(project, r.cable.from), b = resolve(project, r.cable.to)
        const fit = a && b ? fittingCables(a.port, b.port) : CABLE_CATALOG
        const cur = cableSpec(r.cable.specKey)
        return [{ value: '', label: 'TBD' }, ...(cur && !fit.some((f) => f.key === cur.key) ? [{ value: cur.key, label: `${cur.name} (doesn’t fit)` }] : []), ...fit.map((f) => ({ value: f.key, label: f.name }))]
      },
      set: (r, v) => {
        const t = v.trim()
        if (!t || /^tbd$/i.test(t)) { r.cable.specKey = null; return }
        const hit = CABLE_CATALOG.find((c) => c.key === t || c.name.toLowerCase() === t.toLowerCase()) ?? cableSpec(t)
        if (hit) r.cable.specKey = hit.key
      } },
    { key: 'length', title: 'Length (m)', width: 90, numeric: true, get: (r) => (r.cable.lengthMeters == null ? '' : String(r.cable.lengthMeters)),
      set: (r, v) => { const n = parseFloat(v.replace(',', '.')); r.cable.lengthMeters = v.trim() === '' || isNaN(n) ? null : Math.max(0, n) } },
    { key: 'notes', title: 'Notes', width: 220, get: (r) => r.cable.notes, set: (r, v) => { r.cable.notes = v } },
    { key: 'status', title: 'Status', width: 260, get: (r) => r.message || 'OK',
      render: (r) => <span className={`status ${r.severity ?? 'ok'}`}>{r.severity === 'error' ? '✕ ' : r.severity === 'warning' ? '! ' : r.severity ? 'ⓘ ' : '✓ '}{r.message || 'OK'}</span> },
  ], [project])

  // Apply a batch of edits as one undo step. Edits run on a fresh row model built
  // from the draft project so they mutate the draft's cables.
  const commit = useCallback((label: string, changes: { row: CableRow; col: SheetColumn<CableRow>; value: string }[]) => {
    apply(label, (d) => {
      for (const ch of changes) {
        const cable = d.cables.find((c) => c.id === ch.row.cable.id)
        if (cable) ch.col.set?.({ ...ch.row, cable }, ch.value)
      }
    })
  }, [apply])

  const showInDiagram = () => {
    const c = picked[0]
    if (!c) return
    useStore.getState().set({ mode: 'diagram' })
    useStore.getState().select([], c.cable.id)
  }

  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter cables…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={system} onChange={setSystem} options={[{ value: '', label: `All systems (${all.length})` },
          ...(Object.keys(DOMAINS) as SignalDomain[]).filter((d) => counts.get(d)).map((d) => ({ value: d, label: `${DOMAINS[d].name} (${counts.get(d)})` })),
          ...(counts.get('other') ? [{ value: 'other' as const, label: `Other (${counts.get('other')})` }] : [])]} />
        <span className="muted small">{picked.length > 1 ? `${picked.length} rows selected` : `${rows.length} cable${rows.length === 1 ? '' : 's'}`}</span>
        <span className="spacer" />
        <button disabled={!picked.length} onClick={showInDiagram}>Show in Diagram</button>
        <button className="primary" disabled={!all.length} onClick={() => setRenumber(true)}>Renumber…</button>
        <button disabled={!all.length} onClick={() => download(`${project.info.name || 'Project'} cable schedule.csv`, cablesToCSV(project))}>Export CSV</button>
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.cable.id} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.severity === 'error' ? 'err' : '')} emptyText="No cables yet. Wire devices on the Wiring Diagram and they appear here." />
      {renumber && <RenumberDialog selected={picked.length > 1 ? picked.map((r) => r.cable.id) : []} filtered={rows.map((r) => r.cable.id)}
        filterActive={!!q || !!system} counts={counts} onClose={() => setRenumber(false)} />}
    </>
  )
}

const ORDER_OPTIONS: { value: RenumberOrder; label: string }[] = [
  { value: 'from', label: 'By source device and port' },
  { value: 'to', label: 'By destination device and port' },
  { value: 'label', label: 'Keep current label order' },
  { value: 'diagram', label: 'In the order they were drawn' },
]

function RenumberDialog({ selected, filtered, filterActive, counts, onClose }: {
  selected: CableId[]; filtered: CableId[]; filterActive: boolean; counts: Map<string, number>; onClose: () => void
}) {
  const apply = useStore((s) => s.apply)
  const [scope, setScope] = useState<'all' | 'selected' | 'filtered'>(selected.length ? 'selected' : filterActive ? 'filtered' : 'all')
  const [schemes, setSchemes] = useState<Record<SignalDomain, NumberScheme>>(defaultSchemes)
  const [other, setOther] = useState<NumberScheme>({ prefix: 'X', start: 1, digits: 4 })
  const [order, setOrder] = useState<RenumberOrder>('from')
  const [sep, setSep] = useState('-')
  const [on, setOn] = useState<Set<string>>(() => new Set([...counts.keys()]))
  const systems = [...(Object.keys(DOMAINS) as SignalDomain[]).filter((d) => counts.get(d)), ...(counts.get('other') ? ['other' as const] : [])]
  const sample = (s: NumberScheme) => `${s.prefix}${s.prefix ? sep : ''}${String(s.start).padStart(s.digits, '0')}`

  const run = () => {
    let n = 0
    apply('Renumber Cables', (d) => {
      const ids = scope === 'all' ? undefined : new Set(scope === 'selected' ? selected : filtered)
      n = renumberCables(d, { ids, schemes, other, order, separator: sep, systems: on as Set<SignalDomain | 'other'> })
    })
    useStore.getState().notify(`Renumbered ${n} cable${n === 1 ? '' : 's'}`, { undo: true })
    onClose()
  }
  const upd = (d: SignalDomain | 'other', patch: Partial<NumberScheme>) =>
    d === 'other' ? setOther((o) => ({ ...o, ...patch })) : setSchemes((s) => ({ ...s, [d]: { ...s[d], ...patch } }))

  return (
    <Modal title="Renumber Cables" onClose={onClose}
      footer={<><span className="spacer" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!on.size} onClick={run}>Renumber</button></>}>
      <div className="form renumber">
        <div className="seg-row">
          <label><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> All cables</label>
          <label className={selected.length ? '' : 'disabled'}><input type="radio" disabled={!selected.length} checked={scope === 'selected'} onChange={() => setScope('selected')} /> Selected rows ({selected.length})</label>
          <label className={filterActive ? '' : 'disabled'}><input type="radio" disabled={!filterActive} checked={scope === 'filtered'} onChange={() => setScope('filtered')} /> Filtered rows ({filtered.length})</label>
        </div>
        <table className="renumber-table">
          <thead><tr><th /><th>System</th><th>Cables</th><th>Prefix</th><th>Start at</th><th>Digits</th><th>First label</th></tr></thead>
          <tbody>
            {systems.map((d) => {
              const s = d === 'other' ? other : schemes[d]
              return (
                <tr key={d} className={on.has(d) ? '' : 'off'}>
                  <td><input type="checkbox" checked={on.has(d)} onChange={(e) => setOn((x) => { const n = new Set(x); if (e.target.checked) n.add(d); else n.delete(d); return n })} /></td>
                  <td><span className="sys"><i style={{ background: d === 'other' ? '#999' : DOMAINS[d].color }} />{d === 'other' ? 'Other' : DOMAINS[d].name}</span></td>
                  <td className="num">{counts.get(d)}</td>
                  <td><input className="pfx" value={s.prefix} onChange={(e) => upd(d, { prefix: e.target.value.toUpperCase() })} /></td>
                  <td><NumberInput value={s.start} min={0} width={70} onCommit={(v) => upd(d, { start: v ?? 1 })} /></td>
                  <td><NumberInput value={s.digits} min={1} max={6} width={56} onCommit={(v) => upd(d, { digits: v ?? 3 })} /></td>
                  <td className="mono">{sample(s)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="seg-row">
          <label>Order <Select value={order} onChange={setOrder} options={ORDER_OPTIONS} /></label>
          <label>Separator <Select value={sep} onChange={setSep} options={[{ value: '-', label: 'V-001' }, { value: '', label: 'V001' }, { value: '.', label: 'V.001' }, { value: ' ', label: 'V 001' }]} /></label>
        </div>
        <p className="muted small">Labels used by cables you aren’t renumbering are skipped, so every label stays unique. One ⌘Z undoes the whole renumber.</p>
      </div>
    </Modal>
  )
}

// MARK: Devices

interface DeviceRow { eq: EquipmentInstance }

function DeviceSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return project.equipment.map((eq) => ({ eq }))
      .filter((r) => !s || [r.eq.tag, r.eq.room, r.eq.product.manufacturer, r.eq.product.model, CATEGORIES[r.eq.product.category].name, r.eq.notes].join(' ').toLowerCase().includes(s))
  }, [project, q])
  const cablesOn = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of project.cables) for (const e of [c.from.equipment, c.to.equipment]) m.set(e, (m.get(e) ?? 0) + 1)
    return m
  }, [project])

  const columns = useMemo<SheetColumn<DeviceRow>[]>(() => [
    { key: 'tag', title: 'Tag', width: 100, get: (r) => r.eq.tag, set: (r, v) => { if (v.trim()) r.eq.tag = v.trim() } },
    { key: 'room', title: 'Room', width: 150, get: (r) => r.eq.room, set: (r, v) => { r.eq.room = v } },
    { key: 'group', title: 'Group', width: 150, get: (r) => groupsOf(project).find((g) => g.id === r.eq.groupId)?.name ?? '', value: (r) => r.eq.groupId ?? '',
      options: () => [{ value: '', label: '—' }, ...groupsOf(project).map((g) => ({ value: g.id, label: g.name }))],
      render: (r) => { const g = groupsOf(project).find((x) => x.id === r.eq.groupId); return g ? <span className="sys"><i style={{ background: groupColor(g) }} />{g.name}</span> : '' },
      set: () => { /* applied in commit (needs the whole draft) */ } },
    { key: 'cat', title: 'Category', width: 140, get: (r) => CATEGORIES[r.eq.product.category].name },
    { key: 'mfr', title: 'Manufacturer', width: 160, get: (r) => r.eq.product.manufacturer },
    { key: 'model', title: 'Model', width: 220, get: (r) => r.eq.product.model },
    { key: 'rack', title: 'Rack / U', width: 130, get: (r) => (r.eq.rackPlacement ? `${findRack(project, r.eq.rackPlacement.rack)?.name ?? '?'} · U${r.eq.rackPlacement.startUnit}` : '') },
    { key: 'ru', title: 'RU', width: 50, numeric: true, get: (r) => (r.eq.product.physical.rackUnits ? String(r.eq.product.physical.rackUnits) : '') },
    { key: 'watts', title: 'Max W', width: 70, numeric: true, get: (r) => String(r.eq.product.power.maxWatts) },
    { key: 'ports', title: 'Ports', width: 60, numeric: true, get: (r) => String(r.eq.product.ports.length) },
    { key: 'cables', title: 'Cables', width: 64, numeric: true, get: (r) => String(cablesOn.get(r.eq.id) ?? 0) },
    { key: 'notes', title: 'Notes', width: 260, get: (r) => r.eq.notes, set: (r, v) => { r.eq.notes = v } },
  ], [project, cablesOn])

  const commit = useCallback((label: string, changes: { row: DeviceRow; col: SheetColumn<DeviceRow>; value: string }[]) => {
    apply(label, (d) => {
      for (const ch of changes) {
        const eq = d.equipment.find((e) => e.id === ch.row.eq.id)
        if (!eq) continue
        if (ch.col.key === 'group') {
          const v = ch.value.trim()
          const g = groupsOf(d).find((x) => x.id === v || x.name.toLowerCase() === v.toLowerCase())
          if (!v) removeFromGroup(d, [eq.id])
          else if (g) addToGroup(d, [eq.id], g.id)
          else createGroup(d, [eq.id], { name: v })
        } else ch.col.set?.({ eq }, ch.value)
      }
      const bays = new Map(d.patchBays.map((b) => [b.equipment, b]))
      for (const e of d.equipment) { const b = bays.get(e.id); if (b) b.name = e.tag }
    })
  }, [apply])

  const csv = () => {
    const head = columns.map((c) => c.title)
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    download(`${project.info.name || 'Project'} equipment list.csv`, [head.join(','), ...rows.map((r) => columns.map((c) => esc(c.get(r))).join(','))].join('\n'))
  }

  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter devices…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{rows.length} device{rows.length === 1 ? '' : 's'} · Tag, Room, Group and Notes are editable (paste a new group name to create one)</span>
        <span className="spacer" />
        <button disabled={!rows.length} onClick={csv}>Export CSV</button>
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.eq.id} commit={commit} emptyText="No devices yet." />
    </>
  )
}

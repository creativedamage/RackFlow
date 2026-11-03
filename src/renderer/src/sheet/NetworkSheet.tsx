import { useCallback, useMemo, useState } from 'react'
import { autoAssignIps, duplicateIps, networkRows, rowSwitch, rowSwitchPort, rowVlan, setNet, validIp, type NetworkRow } from '@core/index'
import { useStore } from '../store'
import { Modal, Toggle } from '../components/ui'
import { Sheet, type SheetColumn } from './Sheet'

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/**
 * Network / IP schedule: one row per network interface. IP, VLAN, Device ID,
 * Location and Notes are editable; Switch / Port come from the wiring (traced
 * through patch panels and wall plates) and can be typed in where it isn't wired.
 */
export function NetworkSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [q, setQ] = useState('')
  const [showSwitches, setShowSwitches] = useState(true)
  const [picked, setPicked] = useState<NetworkRow[]>([])
  const [assign, setAssign] = useState(false)

  const all = useMemo(() => networkRows(project), [project])
  const dupes = useMemo(() => duplicateIps(all), [all])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => (showSwitches || !r.isSwitch)
      && (!s || [r.info.ip, r.eq.tag, r.eq.product.manufacturer, r.eq.product.model, r.eq.room, r.interface, rowSwitch(r), rowSwitchPort(r), r.info.vlan, r.info.notes].join(' ').toLowerCase().includes(s)))
  }, [all, q, showSwitches])

  const columns = useMemo<SheetColumn<NetworkRow>[]>(() => [
    { key: 'ip', title: 'IP Address', width: 140, get: (r) => r.info.ip ?? '', set: () => {},
      render: (r) => {
        const ip = r.info.ip ?? ''
        const bad = ip && !validIp(ip), dup = dupes.has(r.key)
        return <span className={bad || dup ? 'net-bad' : ''} title={bad ? 'Not a valid IPv4 address' : dup ? 'This address is used more than once' : undefined}>{ip}{dup ? ' ⚠︎' : ''}</span>
      } },
    { key: 'tag', title: 'Device ID', width: 110, get: (r) => r.eq.tag, set: () => {} },
    { key: 'iface', title: 'Interface', width: 130, get: (r) => r.interface },
    { key: 'mfr', title: 'Manufacturer', width: 150, get: (r) => r.eq.product.manufacturer },
    { key: 'model', title: 'Model', width: 190, get: (r) => r.eq.product.model },
    { key: 'room', title: 'Location', width: 140, get: (r) => r.eq.room, set: () => {} },
    { key: 'switch', title: 'Switch', width: 110, get: (r) => (r.isSwitch ? '' : rowSwitch(r)), set: () => {},
      render: (r) => r.isSwitch ? <span className="muted">—</span> : <span className={r.info.switchTag ? 'net-manual' : ''} title={r.link ? `Traced from the wiring${r.link.via.length ? ` via ${r.link.via.join(' → ')}` : ''}${r.link.direct ? ' (not a switch)' : ''}` : r.info.switchTag ? 'Typed in (not wired)' : 'Not wired to a switch yet – type one in or cable it on the diagram'}>{rowSwitch(r)}{r.link?.direct && !r.info.switchTag ? ' (direct)' : ''}</span> },
    { key: 'port', title: 'Switch Port', width: 110, get: (r) => (r.isSwitch ? '' : rowSwitchPort(r)), set: () => {},
      render: (r) => r.isSwitch ? '' : <span className={r.info.switchPort ? 'net-manual' : ''}>{rowSwitchPort(r)}</span> },
    { key: 'vlan', title: 'VLAN', width: 70, get: (r) => r.info.vlan ?? '', set: () => {},
      render: (r) => { const v = rowVlan(r); return <span className={v.inherited ? 'muted' : ''} title={v.inherited && v.vlan ? `From ${rowSwitch(r)} ${rowSwitchPort(r)} (switch port VLAN) – type to set this interface’s own` : undefined}>{v.vlan}</span> } },
    { key: 'cable', title: 'Cable', width: 90, get: (r) => r.link?.cable ?? '' },
    { key: 'notes', title: 'Notes', width: 260, get: (r) => r.info.notes ?? '', set: () => {} },
  ], [dupes])

  const commit = useCallback((label: string, changes: { row: NetworkRow; col: SheetColumn<NetworkRow>; value: string }[]) => {
    let bad = 0
    apply(label, (d) => {
      for (const ch of changes) {
        const eq = d.equipment.find((e) => e.id === ch.row.eq.id)
        if (!eq) continue
        const v = ch.value.trim()
        switch (ch.col.key) {
          case 'ip': if (v && !validIp(v)) bad++; setNet(eq, ch.row.portId, { ip: v }); break
          case 'vlan': setNet(eq, ch.row.portId, { vlan: v }); break
          case 'notes': setNet(eq, ch.row.portId, { notes: ch.value }); break
          // Typing the traced value (or clearing) removes the manual override.
          case 'switch': setNet(eq, ch.row.portId, { switchTag: v && v !== (ch.row.link?.eq.tag ?? '') ? v : undefined }); break
          case 'port': setNet(eq, ch.row.portId, { switchPort: v && v !== (ch.row.link?.port.label ?? '') ? v : undefined }); break
          case 'tag': if (v) eq.tag = v; break
          case 'room': eq.room = ch.value; break
        }
      }
      const bays = new Map(d.patchBays.map((b) => [b.equipment, b]))
      for (const e of d.equipment) { const b = bays.get(e.id); if (b) b.name = e.tag }
    })
    if (bad) notify(`${bad} address${bad === 1 ? ' isn’t a' : 'es aren’t'} valid IPv4 (e.g. 192.168.1.20 or 10.0.0.5/24) – highlighted in red`, { kind: 'warning' })
  }, [apply, notify])

  const csv = () => {
    const cols = columns
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    download(`${project.info.name || 'Project'} network schedule.csv`, [cols.map((c) => c.title).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))].join('\n'))
  }

  const assigned = rows.filter((r) => r.info.ip).length
  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter by IP, device, switch, location…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Toggle label="Switch management rows" checked={showSwitches} onChange={setShowSwitches} />
        <span className="muted small">{rows.length} interface{rows.length === 1 ? '' : 's'} · {assigned} with an IP{dupes.size ? ` · ${dupes.size} duplicate` : ''} · Switch / Port are traced from the wiring (type to override)</span>
        <span className="spacer" />
        <button disabled={!rows.length} onClick={() => setAssign(true)}>Assign IPs…</button>
        <button disabled={!rows.length} onClick={csv}>Export CSV</button>
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.key} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.isSwitch ? 'net-switch-row' : '')}
        emptyText="No network devices yet. Devices with Ethernet, Dante, NDI or other network ports show up here." />
      {assign && <AssignDialog rows={picked.length > 1 ? picked : rows} scope={picked.length > 1 ? 'selected' : 'shown'} onClose={() => setAssign(false)} />}
    </>
  )
}

function AssignDialog({ rows, scope, onClose }: { rows: NetworkRow[]; scope: 'selected' | 'shown'; onClose: () => void }) {
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [start, setStart] = useState('192.168.1.20')
  const [step, setStep] = useState(1)
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const ok = validIp(start)
  const run = () => {
    let n = 0
    apply('Assign IP Addresses', (d) => { n = autoAssignIps(d, rows.map((r) => r.key), start, step, onlyEmpty) })
    notify(n ? `Assigned ${n} IP address${n === 1 ? '' : 'es'}` : 'Nothing to assign – every row already has an IP', { undo: !!n, kind: n ? 'success' : 'info' })
    onClose()
  }
  return (
    <Modal title="Assign IP Addresses" onClose={onClose} footer={<>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!ok} onClick={run}>Assign</button>
    </>}>
      <div className="form" style={{ padding: 16, minWidth: 380 }}>
        <p className="muted small">Numbers the {scope === 'selected' ? `${rows.length} selected rows` : `${rows.length} rows shown`} in order, skipping addresses already used in the project (and .0 / .255).</p>
        <label className="field"><span className="field-label">Start at</span><input value={start} onChange={(e) => setStart(e.target.value)} placeholder="192.168.1.20 or 10.0.0.20/24" style={{ borderColor: ok ? undefined : 'var(--danger)' }} /></label>
        <label className="field"><span className="field-label">Step</span><input type="number" min={1} max={64} value={step} onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))} /></label>
        <Toggle label="Only rows without an IP" checked={onlyEmpty} onChange={setOnlyEmpty} />
      </div>
    </Modal>
  )
}

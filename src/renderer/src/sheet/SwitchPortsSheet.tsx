import { useCallback, useMemo, useState } from 'react'
import { deviceName, setNet, switchPortRows, validVlans, type SwitchPortRow } from '@core/index'
import { useStore } from '../store'
import { Select } from '../components/ui'
import { Sheet, type SheetColumn } from './Sheet'

const modeOf = (v: string): 'access' | 'trunk' | undefined => (/^t/i.test(v.trim()) ? 'trunk' : /^a/i.test(v.trim()) ? 'access' : undefined)

/**
 * Switch Ports: every network port on every switch with its VLAN – access
 * (one untagged VLAN) or trunk (tagged VLANs + native) – and the device it's
 * wired to, traced through patch panels and wall plates. Devices on an access
 * port show its VLAN on the Network sheet unless they have their own.
 */
export function SwitchPortsSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [q, setQ] = useState('')
  const [sw, setSw] = useState('')
  const [picked, setPicked] = useState<SwitchPortRow[]>([])
  const [bulk, setBulk] = useState<string | null>(null)

  const all = useMemo(() => switchPortRows(project), [project])
  const switches = useMemo(() => [...new Map(all.map((r) => [r.sw.id as string, r.sw.tag])).entries()], [all])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => (!sw || r.sw.id === sw) && (!s || [r.sw.tag, r.port.label, r.info.vlan, r.info.tagged, r.device?.eq.tag, r.device ? deviceName(r.device.eq) : '', r.device?.interface, r.info.notes].join(' ').toLowerCase().includes(s)))
  }, [all, q, sw])

  const columns = useMemo<SheetColumn<SwitchPortRow>[]>(() => [
    { key: 'sw', title: 'Switch', width: 110, get: (r) => r.sw.tag, render: (r) => <b>{r.sw.tag}</b> },
    { key: 'port', title: 'Port', width: 120, get: (r) => r.port.label },
    { key: 'mode', title: 'Mode', width: 90, get: (r) => (r.info.mode === 'trunk' ? 'Trunk' : r.info.vlan ? 'Access' : ''), set: () => {},
      render: (r) => r.info.mode === 'trunk' ? <span className="vlan-chip trunk">Trunk</span> : r.info.vlan ? <span className="vlan-chip">Access</span> : <span className="muted">—</span> },
    { key: 'vlan', title: 'VLAN (untagged)', width: 140, get: (r) => r.info.vlan ?? '', set: () => {},
      render: (r) => <span className={r.info.vlan && !validVlans(r.info.vlan) ? 'net-bad' : ''}>{r.info.vlan ?? ''}</span> },
    { key: 'tagged', title: 'Tagged VLANs', width: 150, get: (r) => r.info.tagged ?? '', set: () => {},
      render: (r) => <span className={r.info.tagged && !validVlans(r.info.tagged) ? 'net-bad' : ''}>{r.info.tagged ?? ''}</span> },
    { key: 'device', title: 'Connected Device', width: 130, get: (r) => r.device?.eq.tag ?? '' },
    { key: 'devname', title: 'Device Name', width: 200, get: (r) => (r.device ? deviceName(r.device.eq) : '') },
    { key: 'iface', title: 'Device Interface', width: 140, get: (r) => r.device?.interface ?? '' },
    { key: 'via', title: 'Via', width: 200, get: (r) => r.device?.link?.via.join(' → ') ?? '' },
    { key: 'notes', title: 'Notes', width: 240, get: (r) => r.info.notes ?? '', set: () => {} },
  ], [])

  const commit = useCallback((label: string, changes: { row: SwitchPortRow; col: SheetColumn<SwitchPortRow>; value: string }[]) => {
    let bad = 0
    apply(label === 'Edit VLAN (untagged)' ? 'Set VLAN' : label, (d) => {
      for (const ch of changes) {
        const eq = d.equipment.find((e) => e.id === ch.row.sw.id)
        if (!eq) continue
        const v = ch.value.trim()
        switch (ch.col.key) {
          case 'vlan': if (!validVlans(v) || v.includes(',') || v.includes('-')) bad++; setNet(eq, ch.row.port.id, { vlan: v, mode: eq.network?.[ch.row.port.id]?.mode ?? (v ? 'access' : undefined) }); break
          case 'tagged': if (!validVlans(v)) bad++; setNet(eq, ch.row.port.id, { tagged: v, ...(v ? { mode: 'trunk' as const } : {}) }); break
          case 'mode': setNet(eq, ch.row.port.id, { mode: modeOf(v) }); break
          case 'notes': setNet(eq, ch.row.port.id, { notes: ch.value }); break
        }
      }
    })
    if (bad) notify(`${bad} VLAN entr${bad === 1 ? 'y isn’t' : 'ies aren’t'} valid – use IDs 1–4094 (one for untagged; a list like 10,20,100-110 for tagged)`, { kind: 'warning' })
  }, [apply, notify])

  const target = picked.length > 1 ? picked : rows
  const fill = (vlan: string) => {
    const v = vlan.trim()
    if (!validVlans(v) || v.includes(',')) { notify('Enter one VLAN ID (1–4094)', { kind: 'warning' }); return }
    apply(`Set VLAN ${v}`, (d) => { for (const r of target) { const eq = d.equipment.find((e) => e.id === r.sw.id); if (eq) setNet(eq, r.port.id, { vlan: v, mode: 'access' }) } })
    notify(`VLAN ${v} on ${target.length} port${target.length === 1 ? '' : 's'}`, { undo: true, kind: 'success' })
    setBulk(null)
  }

  const trunks = all.filter((r) => r.info.mode === 'trunk').length
  const vlans = new Set(all.flatMap((r) => [r.info.vlan, ...(r.info.tagged ?? '').split(',')]).map((x) => x?.trim()).filter(Boolean))
  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter by switch, port, VLAN, device…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={sw} onChange={setSw} options={[{ value: '', label: 'All switches' }, ...switches.map(([id, tag]) => ({ value: id, label: tag }))]} />
        <span className="muted small">{picked.length > 1 ? `${picked.length} ports selected` : `${rows.length} port${rows.length === 1 ? '' : 's'}`} · {vlans.size} VLAN{vlans.size === 1 ? '' : 's'} · {trunks} trunk{trunks === 1 ? '' : 's'} · type “t” or “a” in Mode for trunk / access</span>
        <span className="spacer" />
        {bulk == null
          ? <button disabled={!rows.length} onClick={() => setBulk('')}>Set VLAN on {picked.length > 1 ? 'Selected' : 'Shown'}…</button>
          : <span className="fb-pop">
              VLAN <input className="mono" autoFocus value={bulk} style={{ width: 70 }} onChange={(e) => setBulk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fill(bulk); if (e.key === 'Escape') setBulk(null) }} />
              <button className="primary" disabled={!bulk.trim()} onClick={() => fill(bulk)}>Set</button>
              <button onClick={() => setBulk(null)}>Cancel</button>
            </span>}
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.key} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.info.mode === 'trunk' ? 'vlan-trunk-row' : '')}
        emptyText="No network switches yet. Add one from the library (search “switch”), then set a VLAN on each port here." />
    </>
  )
}

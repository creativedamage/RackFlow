import { useCallback, useMemo, useState } from 'react'
import { autoAssignIps, autoAssignByVlan, inSubnet, type VlanAssignResult, duplicateIps, ipVlanIssue, networkRows, prefixMask, rowSwitch, rowSwitchPort, rowVlan, setNet, subnetOf, startOf, intToIp, validIp, vlanPlan, vlansOf, type NetworkRow, type VlanPlan } from '@core/index'
import { useStore } from '../store'
import { Modal, Select, Toggle } from '../components/ui'
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
  const [vlanEdit, setVlanEdit] = useState(false)

  const all = useMemo(() => networkRows(project), [project])
  const dupes = useMemo(() => duplicateIps(all), [all])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => (showSwitches || !r.isSwitch)
      && (!s || [r.info.ip, r.eq.tag, r.eq.product.manufacturer, r.eq.product.model, r.eq.room, r.interface, rowSwitch(r), rowSwitchPort(r), r.info.vlan, r.info.notes].join(' ').toLowerCase().includes(s)))
  }, [all, q, showSwitches])

  // VLANs to pick from: the planned ones, plus any ID already used on a switch port or interface.
  const vlanChoices = useMemo(() => {
    const plans = vlansOf(project)
    const used = new Set(all.map((r) => r.info.vlan?.trim()).filter(Boolean) as string[])
    for (const e of project.equipment) for (const n of Object.values(e.network ?? {})) if (n.vlan?.trim()) used.add(n.vlan.trim())
    const extra = [...used].filter((v) => !plans.some((p) => p.vlan.trim() === v)).map((v) => ({ vlan: v, name: '(no subnet set)' }))
    return [...plans.map((p) => ({ vlan: p.vlan.trim(), name: p.name ?? '' })), ...extra].sort((a, b) => Number(a.vlan) - Number(b.vlan) || a.vlan.localeCompare(b.vlan))
  }, [project, all])

  const columns = useMemo<SheetColumn<NetworkRow>[]>(() => [
    { key: 'ip', title: 'IP Address', width: 140, get: (r) => r.info.ip ?? '', set: () => {},
      render: (r) => {
        const ip = r.info.ip ?? ''
        const bad = ip && !validIp(ip), dup = dupes.has(r.key), off = !bad ? ipVlanIssue(project, ip, rowVlan(r).vlan) : null
        return <span className={bad || dup || off ? 'net-bad' : ''} title={bad ? 'Not a valid IPv4 address' : dup ? 'This address is used more than once' : off ?? undefined}>{ip}{dup || off ? ' ⚠︎' : ''}</span>
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
    { key: 'vlan', title: 'VLAN', width: 150, get: (r) => rowVlan(r).vlan, value: (r) => r.info.vlan ?? '', set: () => {},
      options: (r) => {
        const sp = r.link && !r.link.direct ? r.link.eq.network?.[r.link.port.id] : undefined
        const inherit = sp && sp.mode !== 'trunk' && sp.vlan ? ` (switch port: ${sp.vlan})` : ''
        return [{ value: '', label: `—${inherit}` }, ...vlanChoices.map((v) => ({ value: v.vlan, label: v.name ? `${v.vlan} – ${v.name}` : v.vlan }))]
      },
      render: (r) => { const v = rowVlan(r), pl = vlanPlan(project, v.vlan); return <span className={`net-vlan-cell ${v.inherited ? 'muted' : ''}`} title={v.inherited && v.vlan ? `From ${rowSwitch(r)} ${rowSwitchPort(r)} (switch port VLAN) – pick one to set this interface’s own` : 'Double-click (or Enter) to pick a VLAN – the IP is filled in from that VLAN'}>{v.vlan}{pl?.name ? <span className="muted"> {pl.name}</span> : null}<i>▾</i></span> } },
    { key: 'mask', title: 'Subnet Mask', width: 120, get: (r) => { const pl = vlanPlan(project, rowVlan(r).vlan); return pl && subnetOf(pl) ? `${prefixMask(pl.prefix)} (/${pl.prefix})` : '' } },
    { key: 'gw', title: 'Gateway', width: 110, get: (r) => vlanPlan(project, rowVlan(r).vlan)?.gateway ?? '' },
    { key: 'cable', title: 'Cable', width: 90, get: (r) => r.link?.cable ?? '' },
    { key: 'notes', title: 'Notes', width: 260, get: (r) => r.info.notes ?? '', set: () => {} },
  ], [dupes, project, vlanChoices])

  const commit = useCallback((label: string, changes: { row: NetworkRow; col: SheetColumn<NetworkRow>; value: string }[]) => {
    let bad = 0
    const vlanKeys = changes.filter((ch) => ch.col.key === 'vlan').map((ch) => ch.row.key)
    let res: VlanAssignResult | null = null
    apply(vlanKeys.length ? (vlanKeys.length > 1 ? `Set VLAN on ${vlanKeys.length}` : 'Set VLAN') : label, (d) => {
      for (const ch of changes) {
        const eq = d.equipment.find((e) => e.id === ch.row.eq.id)
        if (!eq) continue
        const v = ch.value.trim()
        switch (ch.col.key) {
          case 'ip': if (v && !validIp(v)) bad++; setNet(eq, ch.row.portId, { ip: v }); break
          case 'vlan': {
            setNet(eq, ch.row.portId, { vlan: v })
            // …and the switch port it's plugged into gets the same VLAN (trunks are left as they are).
            const l = ch.row.link, sw = l && !l.direct ? d.equipment.find((e) => e.id === l.eq.id) : undefined
            if (l && sw && sw.network?.[l.port.id]?.mode !== 'trunk') setNet(sw, l.port.id, { vlan: v, mode: v ? 'access' : undefined })
            break
          }
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
      // A new VLAN gives the interface an address in that VLAN's subnet (one that already fits is kept).
      if (vlanKeys.length) {
        const byKey = new Map(networkRows(d).map((r) => [r.key, r]))
        for (const k of vlanKeys) {
          const r = byKey.get(k), pl = r && vlanPlan(d, rowVlan(r).vlan)
          if (r && pl && r.info.ip && !inSubnet(r.info.ip, pl)) { const eq = d.equipment.find((e) => e.id === r.eq.id); if (eq) setNet(eq, r.portId, { ip: '' }) }
        }
        res = autoAssignByVlan(d, vlanKeys, { onlyEmpty: true })
      }
    })
    const r = res as VlanAssignResult | null
    if (r) {
      const parts = [r.assigned ? `${r.assigned} IP address${r.assigned === 1 ? '' : 'es'} assigned` : '',
        r.noPlan.length ? `VLAN ${r.noPlan.join(', ')} has no subnet yet – set it under VLANs… to get addresses` : '',
        r.full.length ? `VLAN ${r.full.join(', ')} is full` : ''].filter(Boolean)
      if (parts.length) notify(parts.join(' · '), { kind: r.noPlan.length || r.full.length ? 'warning' : 'success', undo: !!r.assigned })
    }
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
        <button onClick={() => setVlanEdit(true)} title="Each VLAN's gateway and size (e.g. VLAN 20 → 10.10.20.1 /24)">VLANs{vlansOf(project).length ? ` (${vlansOf(project).length})` : ''}…</button>
        <button disabled={!rows.length} onClick={() => setAssign(true)}>Assign IPs…</button>
        <button disabled={!rows.length} onClick={csv}>Export CSV</button>
      </div>
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.key} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.isSwitch ? 'net-switch-row' : '')}
        emptyText="No network devices yet. Devices with Ethernet, Dante, NDI or other network ports show up here." />
      {vlanEdit && <VlanDialog rows={all} onClose={() => setVlanEdit(false)} />}
      {assign && <AssignDialog rows={picked.length > 1 ? picked : rows} scope={picked.length > 1 ? 'selected' : 'shown'} onClose={() => setAssign(false)} />}
    </>
  )
}

function AssignDialog({ rows, scope, onClose }: { rows: NetworkRow[]; scope: 'selected' | 'shown'; onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const plans = vlansOf(project)
  const [mode, setMode] = useState<'vlan' | 'range'>(plans.length ? 'vlan' : 'range')
  const [start, setStart] = useState('192.168.1.20')
  const [step, setStep] = useState(1)
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [fallback, setFallback] = useState('')
  const ok = mode === 'vlan' ? plans.length > 0 : validIp(start)
  // Per-VLAN preview: how many rows land on each VLAN and how much room it has.
  const todo = rows.filter((r) => !onlyEmpty || !r.info.ip)
  const byVlan = new Map<string, number>()
  for (const r of todo) { const v = rowVlan(r).vlan || fallback; byVlan.set(v, (byVlan.get(v) ?? 0) + 1) }
  const run = () => {
    let n = 0, msg = ''
    if (mode === 'vlan') {
      let res = { assigned: 0, noVlan: 0, noPlan: [] as string[], full: [] as string[] }
      apply('Assign IP Addresses', (d) => { res = autoAssignByVlan(d, rows.map((r) => r.key), { onlyEmpty, fallback: fallback || undefined }) })
      n = res.assigned
      msg = [res.noVlan ? `${res.noVlan} with no VLAN skipped` : '', res.noPlan.length ? `no plan for VLAN ${res.noPlan.join(', ')}` : '', res.full.length ? `VLAN ${res.full.join(', ')} full` : ''].filter(Boolean).join(' · ')
    } else apply('Assign IP Addresses', (d) => { n = autoAssignIps(d, rows.map((r) => r.key), start, step, onlyEmpty) })
    notify(`${n ? `Assigned ${n} IP address${n === 1 ? '' : 'es'}` : 'Nothing assigned'}${msg ? ` – ${msg}` : ''}`, { undo: !!n, kind: n && !msg ? 'success' : n ? 'info' : 'warning' })
    onClose()
  }
  return (
    <Modal wide title="Assign IP Addresses" onClose={onClose} footer={<>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!ok} onClick={run}>Assign</button>
    </>}>
      <div className="form vlan-modal" style={{ padding: 16 }}>
        <div className="row-gap">
          <label className="check"><input type="radio" checked={mode === 'vlan'} onChange={() => setMode('vlan')} /> By VLAN</label>
          <label className="check"><input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> From one starting address</label>
        </div>
        {mode === 'vlan' ? (<>
          <p className="muted small">Each of the {scope === 'selected' ? `${todo.length} selected` : `${todo.length} shown`} interfaces gets the next free address in its VLAN’s subnet (its own VLAN, or the VLAN of the switch port it lands on), skipping the gateway and addresses already used.</p>
          {!plans.length && <p className="net-bad small">No VLANs set up yet – use VLANs… first.</p>}
          <table className="vlan-preview"><thead><tr><th>VLAN</th><th>Subnet</th><th>Interfaces</th><th>Free</th></tr></thead><tbody>
            {[...byVlan].sort((a, b) => Number(a[0]) - Number(b[0])).map(([v, k]) => {
              const pl = vlanPlan(project, v), sn = pl && subnetOf(pl)
              const usedHere = sn ? rows.filter((r) => r.info.ip && rowVlan(r).vlan === v).length : 0
              const free = sn ? sn.hosts - 1 - usedHere : 0
              return <tr key={v || '-'} className={!v || !sn || free < k ? 'net-bad' : ''}>
                <td>{v || 'none'}</td><td>{sn ? sn.cidr : v ? 'no plan – add it in VLANs…' : 'skipped'}</td><td>{k}</td><td>{sn ? free : '—'}</td></tr>
            })}
          </tbody></table>
          {plans.length > 0 && <label className="field"><span className="field-label">No VLAN?</span>
            <Select value={fallback} onChange={setFallback} options={[{ value: '', label: 'Skip those interfaces' }, ...plans.map((v) => ({ value: v.vlan, label: `Use VLAN ${v.vlan}${v.name ? ` – ${v.name}` : ''}` }))]} /></label>}
        </>) : (<>
          <p className="muted small">Numbers the {scope === 'selected' ? `${rows.length} selected rows` : `${rows.length} rows shown`} in order, skipping addresses already used in the project (and .0 / .255).</p>
          <label className="field"><span className="field-label">Start at</span><input value={start} onChange={(e) => setStart(e.target.value)} placeholder="192.168.1.20 or 10.0.0.20/24" style={{ borderColor: validIp(start) ? undefined : 'var(--danger)' }} /></label>
          <label className="field"><span className="field-label">Step</span><input type="number" min={1} max={64} value={step} onChange={(e) => setStep(Math.max(1, Number(e.target.value) || 1))} /></label>
        </>)}
        <Toggle label="Only rows without an IP" checked={onlyEmpty} onChange={setOnlyEmpty} />
      </div>
    </Modal>
  )
}

const autoStart = (x: VlanPlan) => intToIp(startOf({ ...x, start: undefined }))
const PREFIXES = [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]

/** VLAN IP plan: per VLAN its name, gateway and size; devices are numbered inside it. */
function VlanDialog({ rows, onClose }: { rows: NetworkRow[]; onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [list, setList] = useState<VlanPlan[]>(() => vlansOf(project).map((v) => ({ ...v })))
  const inUse = [...new Set(rows.map((r) => rowVlan(r).vlan).filter(Boolean).flatMap((v) => v.split(/[,\s]+/)).filter((v) => /^\d+$/.test(v)))].sort((a, b) => Number(a) - Number(b))
  const missing = inUse.filter((v) => !list.some((x) => x.vlan === v))
  const count = (v: string) => rows.filter((r) => rowVlan(r).vlan === v).length
  const upd = (i: number, patch: Partial<VlanPlan>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const guess = (v: string): VlanPlan => ({ vlan: v, gateway: `10.10.${Number(v) % 256}.1`, prefix: 24 })
  const dupIds = new Set(list.map((x) => x.vlan).filter((v, i, a) => v && a.indexOf(v) !== i))
  const valid = list.every((x) => x.vlan.trim() && subnetOf(x) && !dupIds.has(x.vlan))
  const save = () => { apply('VLAN IP Plan', (d) => { d.vlans = list.map((x) => ({ ...x, vlan: x.vlan.trim(), name: x.name?.trim() || undefined, start: x.start?.trim() || undefined })); if (!d.vlans.length) delete d.vlans }); onClose() }
  return (
    <Modal wide title="VLAN IP Settings" onClose={onClose} footer={<>
      <button onClick={() => setList((l) => [...l, guess(String(Math.max(0, ...l.map((x) => Number(x.vlan) || 0)) + 10))])}>＋ Add VLAN</button>
      {missing.length > 0 && <button onClick={() => setList((l) => [...l, ...missing.map(guess)])}>Add VLANs in use ({missing.join(', ')})</button>}
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!valid} onClick={save}>Save</button>
    </>}>
      <div className="vlan-modal" style={{ padding: 16, overflowX: 'auto' }}>
        <p className="muted small">Set each VLAN’s gateway and size. Assign IPs… then numbers every interface inside its VLAN’s subnet, and the Network schedule shows each one’s mask and gateway and flags addresses outside it.</p>
        <table className="vlan-table">
          <thead><tr><th>VLAN</th><th>Name</th><th>Gateway</th><th>Size</th><th>Devices start at</th><th>Subnet</th><th>Usable range</th><th>On it</th><th /></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} className="muted small">No VLANs yet. Add one, or add the VLANs already set on switch ports.</td></tr>}
            {list.map((x, i) => {
              const sn = subnetOf(x)
              const startOk = !x.start || (sn && validIp(x.start))
              return (
                <tr key={i}>
                  <td><input className={!x.vlan.trim() || dupIds.has(x.vlan) ? 'bad' : ''} style={{ width: 60 }} value={x.vlan} onChange={(e) => upd(i, { vlan: e.target.value.replace(/\D/g, '') })} /></td>
                  <td><input style={{ width: 120 }} value={x.name ?? ''} placeholder="e.g. Dante" onChange={(e) => upd(i, { name: e.target.value })} /></td>
                  <td><input className={validIp(x.gateway) ? '' : 'bad'} style={{ width: 120 }} value={x.gateway} placeholder="10.10.20.1" onChange={(e) => upd(i, { gateway: e.target.value.trim() })} /></td>
                  <td><Select value={x.prefix} onChange={(v: number) => upd(i, { prefix: v })} options={PREFIXES.map((n) => ({ value: n, label: `/${n} · ${(2 ** (32 - n) - 2).toLocaleString()} hosts` }))} /></td>
                  <td><input className={startOk ? '' : 'bad'} style={{ width: 120 }} value={x.start ?? ''} placeholder={sn ? `auto (${autoStart(x)})` : ''} onChange={(e) => upd(i, { start: e.target.value.trim() })} /></td>
                  <td>{sn ? <span title={`Mask ${sn.mask}`}>{sn.cidr}</span> : <span className="net-bad">invalid</span>}</td>
                  <td className="small">{sn ? `${sn.first} – ${sn.last}` : ''}</td>
                  <td>{count(x.vlan) || ''}</td>
                  <td><button className="mini danger" onClick={() => setList((l) => l.filter((_, k) => k !== i))}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import {
  CABLE_CATALOG, cableSpec, CATEGORIES, CONNECTOR_TYPES, connectorIsPower, exactFitCable, fittingCables, cablesAt, connectorName, DOMAINS, heatBTU, orientation, portDomain, resolve, SIGNALS,
  validateCable, findRack, addToGroup, groupsOf, removeFromGroup, groupColor, circuitLoads, circuitName, isPowerSource, sourceRating, sourcesFor, type Cable, type EquipmentId, type EquipmentInstance,
} from '@core/index'
import { useStore } from '../store'
import { RackSettings } from '../rack/RackView'
import { groupSelection, SYSTEM_OPTIONS } from '../diagram/GroupsPanel'
import { Dot, Field, NumberInput, Select, SeverityIcon, TextInput } from '../components/ui'

export function Inspector() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const selectedCable = useStore((s) => s.selectedCable)
  const selectedRack = useStore((s) => s.selectedRack)
  const mode = useStore((s) => s.mode)

  const cable = selectedCable ? project.cables.find((c) => c.id === selectedCable) : undefined
  const eq = selection.length === 1 ? project.equipment.find((e) => e.id === selection[0]) : undefined
  const rack = mode === 'rack' && selectedRack && !eq ? findRack(project, selectedRack) : undefined

  return (
    <aside className="inspector">
      {cable ? <CableInspector cable={cable} /> : eq ? <EquipmentInspector eq={eq} /> : rack ? <RackSettings rack={rack} /> : selection.length > 1 ? <MultiInspector ids={selection} /> : <IssuesList />}
    </aside>
  )
}

function EquipmentInspector({ eq }: { eq: EquipmentInstance }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const p = eq.product
  const upd = (label: string, fn: (e: EquipmentInstance) => void) => apply(label, (d) => { const x = d.equipment.find((e) => e.id === eq.id); if (x) fn(x) })

  return (
    <div className="form">
      <h3>{eq.tag}</h3>
      <p className="muted">{p.manufacturer} {p.model} · {CATEGORIES[p.category].name}</p>
      {p.verified === false && <p className="data-note">⚠︎ {p.dataNote ?? 'Specs not verified.'}</p>}
      {p.category === 'patchBay'
        ? <p className="muted small">Edit this bay’s labels on the Patch Labels page.</p>
        : <div className="edit-device-row">
            <button onClick={() => useStore.getState().set(p.plate ? { editingPlate: { product: structuredClone(p), instanceId: eq.id } } : { editingProduct: structuredClone(p), editingInstance: eq.id })}>Edit Device…</button>
            {p.key.includes('@') && <span className="badge" title="This device has its own edited specs">Edited</span>}
          </div>}
      <Field label="Tag"><TextInput value={eq.tag} onCommit={(v) => upd('Rename Device', (e) => { e.tag = v })} /></Field>
      <Field label="Room"><TextInput value={eq.room} placeholder="e.g. Main Hall" onCommit={(v) => upd('Set Room', (e) => { e.room = v })} /></Field>
      <Field label="Group">
        <Select value={eq.groupId ?? ''} onChange={(v: string) => {
          if (v === '__new') { useStore.getState().select([eq.id]); groupSelection(); return }
          apply(v ? 'Move to Group' : 'Remove from Group', (d) => { if (v) addToGroup(d, [eq.id], v); else removeFromGroup(d, [eq.id]) })
        }} options={[{ value: '', label: 'None' }, ...groupsOf(project).map((g) => ({ value: g.id, label: g.name })), { value: '__new', label: '+ New group…' }]} />
      </Field>

      {isPowerSource(eq) ? <PowerSourceSection eq={eq} /> : <FedFrom eq={eq} />}

      {!isPowerSource(eq) && <>
      <h4>Physical & power</h4>
      <dl className="kv">
        <dt>Size</dt><dd>{p.physical.rackUnits ? `${p.physical.rackUnits}U${p.physical.halfWidth ? ' (half)' : ''}` : p.physical.mounting}</dd>
        <dt>Depth</dt><dd>{p.physical.depthMM} mm</dd>
        <dt>Weight</dt><dd>{p.physical.weightKG} kg</dd>
        <dt>Power</dt><dd>{p.power.poweredByPoE ? 'PoE' : `${p.power.typicalWatts} W typ / ${p.power.maxWatts} W max`}</dd>
        <dt>Heat</dt><dd>{heatBTU(p.power).toFixed(0)} BTU/hr</dd>
        {eq.rackPlacement && <><dt>Rack</dt><dd>{findRack(project, eq.rackPlacement.rack)?.name} · U{eq.rackPlacement.startUnit} {eq.rackPlacement.face}</dd></>}
      </dl>
      </>}

      <h4>Ports ({p.ports.length})</h4>
      <ul className="port-list">
        {p.ports.map((port) => {
          const addr = { equipment: eq.id, port: port.id }
          const c = cablesAt(project, addr)[0]
          const other = c && resolve(project, c.from.equipment === eq.id && c.from.port === port.id ? c.to : c.from)
          const d = portDomain(port)
          return (
            <li key={port.id} onClick={() => c && select([], c.id)} className={c ? 'linked' : ''}>
              <Dot color={d ? DOMAINS[d].color : '#888'} square={port.direction === 'bidirectional'} />
              <span className="ellipsis">{port.label}</span>
              <span className="muted ellipsis right">{other ? `→ ${other.equipment.tag} · ${other.port.label}` : connectorIsPower(port.connector) ? '' : connectorName(port.connector)}</span>
              {connectorIsPower(port.connector) && (
                <select className="port-conn" value={port.connector} title="Connector on this device (change it to match the real outlet/inlet)"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => upd('Change Connector', (x) => { const q = x.product.ports.find((pp) => pp.id === port.id); if (q) q.connector = e.target.value as typeof q.connector })}>
                  {POWER_CONNECTORS.map((t) => <option key={t} value={t}>{connectorName(t)}</option>)}
                </select>
              )}
            </li>
          )
        })}
      </ul>
      <Field label="Notes"><TextInput multiline value={eq.notes} onCommit={(v) => upd('Edit Notes', (e) => { e.notes = v })} /></Field>
    </div>
  )
}

const POWER_CONNECTORS = CONNECTOR_TYPES.filter(connectorIsPower)
const CATALOG_KEYS = new Set(CABLE_CATALOG.map((c) => c.key))

function CableInspector({ cable }: { cable: Cable }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const v = validateCable(project, cable)
  const from = resolve(project, cable.from), to = resolve(project, cable.to)
  const upd = (label: string, fn: (c: Cable) => void) => apply(label, (d) => { const x = d.cables.find((c) => c.id === cable.id); if (x) fn(x) })
  // Only offer cables that physically fit both ends, plus one made to fit exactly.
  const current = cableSpec(cable.specKey)
  const fitting = from && to ? fittingCables(from.port, to.port) : []
  const exact = from && to ? exactFitCable(from.port, to.port) : null
  const options = fitting
  const currentFits = !current || (from && to && orientation(current, from.port, to.port) != null)
  const best = v.suggestedCables[0] ?? fitting[0]

  return (
    <div className="form">
      <h3>Cable {cable.label}</h3>
      <Field label="Label"><TextInput value={cable.label} onCommit={(val) => upd('Rename Cable', (c) => { c.label = val })} /></Field>
      <dl className="kv">
        <dt>From</dt><dd>{from ? `${from.equipment.tag} · ${from.port.label}` : '?'}</dd>
        <dt>To</dt><dd>{to ? `${to.equipment.tag} · ${to.port.label}` : '?'}</dd>
        <dt>Signal</dt><dd>{v.signal ? SIGNALS[v.signal].name : '—'}</dd>
      </dl>
      <Field label="Cable type">
        <Select value={cable.specKey ?? ''} onChange={(k) => upd('Set Cable Type', (c) => { c.specKey = k || null })}
          options={[
            { value: '', label: 'TBD' },
            ...(current && !options.some((o) => o.key === current.key) ? [{ value: current.key, label: `${current.name} (doesn’t fit)` }] : []),
            ...options.map((s) => ({ value: s.key, label: s.key === exact?.key && !CATALOG_KEYS.has(s.key) ? `${s.name} (made to fit)` : s.name })),
          ]} />
      </Field>
      {!currentFits && best && (
        <button className="primary fix-cable" onClick={() => upd('Set Cable Type', (c) => { c.specKey = best.key })}>Use {best.name}</button>
      )}
      <Field label="Length"><NumberInput value={cable.lengthMeters} allowEmpty step={0.5} min={0} unit="m" onCommit={(n) => upd('Set Length', (c) => { c.lengthMeters = n })} /></Field>
      <Field label="Notes"><TextInput multiline value={cable.notes} onCommit={(val) => upd('Cable Notes', (c) => { c.notes = val })} /></Field>
      <h4>Checks</h4>
      {v.issues.length === 0 ? <p className="ok-line">✓ Connection is valid</p> : (
        <ul className="issues">{v.issues.map((i, n) => <li key={n}><SeverityIcon s={i.severity} /><div>{i.message}{i.suggestion && <small>{i.suggestion}</small>}</div></li>)}</ul>
      )}
      <button className="danger" onClick={() => { apply('Delete Cable', (d) => { d.cables = d.cables.filter((c) => c.id !== cable.id) }); select([], null) }}>Delete Cable</button>
    </div>
  )
}

function IssuesList() {
  const issues = useStore((s) => s.issues)
  const focus = useStore((s) => s.focusIssue)
  const project = useStore((s) => s.project)
  return (
    <div className="form">
      <h3>Design rule check</h3>
      <p className="muted">{project.equipment.length} devices · {project.cables.length} cables · {project.racks.length} racks</p>
      {issues.length === 0 ? <p className="ok-line">✓ No issues found</p> : (
        <ul className="issues clickable">
          {issues.map((i, n) => (
            <li key={n} onClick={() => focus(i.subject)}>
              <SeverityIcon s={i.severity} />
              <div>{i.message}{i.suggestion && <small>{i.suggestion}</small>}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Building power: circuit details and the load rolled up from everything it feeds. */
function PowerSourceSection({ eq }: { eq: EquipmentInstance }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const r = sourceRating(eq)
  const load = circuitLoads(project).find((l) => l.source.id === eq.id)
  const upd = (label: string, fn: (c: NonNullable<EquipmentInstance['circuit']>) => void) =>
    apply(label, (d) => { const x = d.equipment.find((e) => e.id === eq.id); if (x) { x.circuit ??= { panel: '', circuit: '' }; fn(x.circuit) } })
  if (!r) return null
  const pctCont = load ? Math.round((load.maxWatts / r.continuousWatts) * 100) : 0
  const pctRated = load ? Math.round((load.maxWatts / r.ratedWatts) * 100) : 0
  const level = !load ? 'ok' : load.maxWatts > r.ratedWatts ? 'bad' : load.maxWatts > r.continuousWatts ? 'warn' : 'ok'
  return (
    <>
      <h4>Building circuit</h4>
      <Field label="Panel"><TextInput value={eq.circuit?.panel ?? ''} placeholder="e.g. LP-1" onCommit={(v) => upd('Set Panel', (c) => { c.panel = v })} /></Field>
      <Field label="Circuit"><TextInput value={eq.circuit?.circuit ?? ''} placeholder="e.g. 12 or 12,14" onCommit={(v) => upd('Set Circuit', (c) => { c.circuit = v })} /></Field>
      <Field label="Breaker"><NumberInput value={r.amps} min={1} step={5} unit="A" onCommit={(n) => upd('Set Breaker', (c) => { c.breakerAmps = n ?? undefined })} /></Field>
      <Field label="Voltage"><NumberInput value={r.volts} min={12} step={1} unit="V" onCommit={(n) => upd('Set Voltage', (c) => { c.volts = n ?? undefined })} /></Field>
      <Field label="Continuous limit"><NumberInput value={Math.round(r.factor * 100)} min={10} max={100} step={5} unit="%" onCommit={(n) => upd('Set Continuous Limit', (c) => { c.continuousFactor = n == null ? undefined : n / 100 })} /></Field>
      <div className={`load-meter ${level}`}>
        <div className="load-bar"><div style={{ width: `${Math.min(100, pctRated)}%` }} /><span className="load-limit" style={{ left: `${r.factor * 100}%` }} /></div>
        <div className="load-text">
          <strong>{(load?.maxWatts ?? 0).toLocaleString()} W</strong> max · {(load?.typicalWatts ?? 0).toLocaleString()} W typical
          <br /><span className="muted">{r.phases === 3 ? '3-phase · ' : ''}{r.ratedWatts.toLocaleString()} W rated · {r.continuousWatts.toLocaleString()} W continuous ({pctCont}% used)</span>
        </div>
      </div>
      {load && load.devices.length > 0 && (
        <ul className="fed-list">
          {load.devices.map((d) => (
            <li key={d.id} onClick={() => select([d.id], null)}><span>{d.tag}</span><span className="muted">{d.product.power.maxWatts} W</span></li>
          ))}
        </ul>
      )}
      {load && load.devices.length === 0 && <p className="muted small">Nothing plugged in yet. Wire a device's power inlet (or a PDU/UPS) to an outlet on this source.</p>}
    </>
  )
}

function FedFrom({ eq }: { eq: EquipmentInstance }) {
  const project = useStore((s) => s.project)
  const select = useStore((s) => s.select)
  const hasInlet = eq.product.ports.some((x) => connectorIsPower(x.connector) && x.direction === 'input')
  if (!hasInlet || !project.equipment.some(isPowerSource)) return null
  const srcs = sourcesFor(project, eq.id)
  return (
    <p className="fed-from">
      {srcs.length === 0 ? <span className="muted">⚡ Not traced to building power</span> : <>⚡ Fed from {srcs.map((s, i) => (
        <span key={s.id}>{i > 0 && ', '}<button className="link" onClick={() => select([s.id], null)}>{s.tag}{circuitName(s) ? ` (${circuitName(s)})` : ''}</button></span>
      ))}</>}
    </p>
  )
}

/** Several devices selected: group them, move them to a group, or set their room in one go. */
function MultiInspector({ ids }: { ids: EquipmentId[] }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const [name, setName] = useState('')
  const [system, setSystem] = useState<string>('auto')
  const devices = project.equipment.filter((e) => ids.includes(e.id))
  const rooms = [...new Set(devices.map((d) => d.room))]
  const groups = groupsOf(project)
  return (
    <div className="form">
      <h3>{devices.length} devices selected</h3>
      <p className="muted small">{devices.map((d) => d.tag).join(', ')}</p>
      <h4>Group</h4>
      <Field label="Name"><TextInput value={name} placeholder="e.g. FOH Audio" onCommit={setName} /></Field>
      <Field label="System"><Select value={system} onChange={setSystem} options={[{ value: 'auto', label: 'Detect from devices' }, ...SYSTEM_OPTIONS]} /></Field>
      <button className="primary" onClick={() => groupSelection(name || undefined, system === 'auto' ? undefined : system as never)}>Group {devices.length} devices (⌘G)</button>
      {groups.length > 0 && (
        <Field label="Or add to">
          <Select value="" onChange={(v: string) => { if (v) apply('Move to Group', (d) => addToGroup(d, ids, v)) }}
            options={[{ value: '', label: 'Choose a group…' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        </Field>
      )}
      {devices.some((d) => d.groupId) && <button onClick={() => apply('Remove from Group', (d) => removeFromGroup(d, ids))}>Remove from their groups</button>}
      <h4>Location</h4>
      <Field label="Room"><TextInput value={rooms.length === 1 ? rooms[0] : ''} placeholder={rooms.length > 1 ? 'Mixed – type to set all' : 'e.g. Main Hall'}
        onCommit={(v) => apply('Set Room', (d) => { for (const e of d.equipment) if (ids.includes(e.id)) e.room = v })} /></Field>
      <div className="multi-groups">{groups.filter((g) => devices.some((d) => d.groupId === g.id)).map((g) => <span key={g.id} className="chip" style={{ background: groupColor(g) }}>{g.name}</span>)}</div>
    </div>
  )
}

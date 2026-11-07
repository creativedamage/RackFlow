import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { produce } from 'immer'
import {
  BUILT_IN_KEYS, CATEGORIES, CATEGORY_KEYS, CONNECTOR_TYPES, guessMakerCategories, connectorName, DOMAINS, GENDERS, heatBTU, MOUNT_TYPES, port as mkPort, portDomain,
  productProblems, RACK_UNIT_MM, series, SIGNAL_TYPES, SIGNALS, suggestedSignals, typicalPanelGender,
  type ConnectorType, type Gender, type PortDirection, type PortTemplate, type ProductDefinition, type SignalDomain, type SignalType,
  refreshBoxPorts, keepInViews, applyCards, renameSeries } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Dot, Field, Modal, NumberInput, Select, TextInput, Toggle, LenInput, WtInput } from '../components/ui'
import { ManufacturerPicker } from '../components/ManufacturerPicker'
import { removeUserProduct } from './productActions'

const DIRS: { value: PortDirection; label: string }[] = [{ value: 'input', label: 'Input' }, { value: 'output', label: 'Output' }, { value: 'bidirectional', label: 'Bidirectional' }]
const newPortId = () => `p.${Math.random().toString(36).slice(2, 10)}`

const PRESETS: { name: string; make: () => PortTemplate }[] = [
  { name: 'HDMI In', make: () => mkPort(newPortId(), 'HDMI In', 'hdmi', 'female', 'input', ['hdmi20'], 'Video') },
  { name: 'HDMI Out', make: () => mkPort(newPortId(), 'HDMI Out', 'hdmi', 'female', 'output', ['hdmi20'], 'Video') },
  { name: '12G-SDI In', make: () => mkPort(newPortId(), 'SDI In', 'bnc', 'female', 'input', ['sdi12G'], 'Video') },
  { name: '12G-SDI Out', make: () => mkPort(newPortId(), 'SDI Out', 'bnc', 'female', 'output', ['sdi12G'], 'Video') },
  { name: 'XLR Mic/Line In', make: () => mkPort(newPortId(), 'XLR In', 'xlr3', 'female', 'input', ['analogMic', 'analogLine'], 'Audio') },
  { name: 'XLR Line Out', make: () => mkPort(newPortId(), 'XLR Out', 'xlr3', 'male', 'output', ['analogLine'], 'Audio') },
  { name: 'Dante (RJ45)', make: () => mkPort(newPortId(), 'Dante', 'rj45', 'female', 'bidirectional', ['dante', 'aes67', 'ethernet1G'], 'Network') },
  { name: 'LAN (RJ45)', make: () => mkPort(newPortId(), 'LAN', 'rj45', 'female', 'bidirectional', ['ethernet1G', 'ipControl'], 'Network') },
  { name: 'RS-232 (DB9)', make: () => mkPort(newPortId(), 'RS-232', 'db9', 'female', 'bidirectional', ['rs232'], 'Control') },
  { name: 'DMX In (XLR-5)', make: () => mkPort(newPortId(), 'DMX In', 'xlr5', 'male', 'input', ['dmx512'], 'DMX') },
  { name: 'DMX Thru (XLR-5)', make: () => mkPort(newPortId(), 'DMX Thru', 'xlr5', 'female', 'output', ['dmx512'], 'DMX') },
  { name: 'IEC C14 Power In', make: () => mkPort(newPortId(), 'Power In', 'iecC13C14', 'male', 'input', ['ac120V', 'ac230V'], 'Power') },
  { name: 'powerCON TRUE1 In', make: () => mkPort(newPortId(), 'Power In', 'powerCONTrue1', 'male', 'input', ['ac120V', 'ac230V'], 'Power') },
]

/** The custom product builder. Edits a local copy; Save writes it to the user library. */
export function ProductEditor({ initial }: { initial: ProductDefinition }) {
  const [p, setP] = useState(initial)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [showSeries, setShowSeries] = useState(false)
  const [saving, setSaving] = useState(false)
  const close = () => useStore.getState().set({ editingProduct: null, editingInstance: null })
  const instanceId = useStore((s) => s.editingInstance)
  const instance = useStore((s) => (instanceId ? s.project.equipment.find((e) => e.id === instanceId) : undefined))
  const isBuiltIn = BUILT_IN_KEYS.has(initial.key.split('@')[0])
  /** The saved user copy of this product, if any (enables Delete / Revert). */
  const stored = useStore((s) => s.userProducts.find((x) => x.key === initial.key))

  /** Applies the edited product to just the selected placed device. */
  const saveInstance = () => {
    if (!instance) return
    const baseKey = initial.key.split('@')[0]
    const local: ProductDefinition = { ...p, key: `${baseKey}@${instance.id}`, source: 'user', revision: p.revision + 1 }
    useStore.getState().apply(`Edit ${instance.tag}`, (d) => {
      const e = d.equipment.find((x) => x.id === instance.id)
      if (!e) return
      keepInViews(d, e.id, () => { e.product = structuredClone(local); applyCards(e); refreshBoxPorts(d, e) })
      const ids = new Set(local.ports.map((x) => x.id))
      d.cables = d.cables.filter((c) => !((c.from.equipment === e.id && !ids.has(c.from.port)) || (c.to.equipment === e.id && !ids.has(c.to.port))))
    })
    useStore.getState().notify(`Updated ${instance.tag} only`)
    close()
  }
  const edit = (fn: (d: ProductDefinition) => void) => setP((cur) => produce(cur, fn))
  const problems = productProblems(p)

  const save = async () => {
    setSaving(true)
    try {
      // A manufacturer that isn't listed yet is added to the user's directory.
      const makers = useStore.getState().makers
      if (!makers.get(p.manufacturer)) {
        await api.saveUserManufacturer({ name: p.manufacturer.trim(), categories: guessMakerCategories(p.category), aliases: [], source: 'user' })
      }
      const libKey = p.key.split('@')[0]
      const saved: ProductDefinition = { ...p, key: libKey, manufacturer: makers.get(p.manufacturer)?.name ?? p.manufacturer.trim(), source: 'user', revision: p.revision + 1 }
      await api.saveUserProduct(saved)
      await useStore.getState().reloadLibrary()
      // Devices already placed from this product pick up the edit; cables on removed ports are dropped.
      const st = useStore.getState()
      const placed = st.project.equipment.filter((e) => e.product.key === saved.key || e.id === instanceId).length
      if (placed) {
        st.apply(`Update ${saved.model}`, (d) => {
          for (const e of d.equipment) if (e.product.key === saved.key || (instanceId && e.id === instanceId)) keepInViews(d, e.id, () => { e.product = structuredClone(saved); applyCards(e); refreshBoxPorts(d, e) })
          const ids = new Map(d.equipment.map((e) => [e.id, new Set(e.product.ports.map((x) => x.id))]))
          d.cables = d.cables.filter((c) => ids.get(c.from.equipment)?.has(c.from.port) && ids.get(c.to.equipment)?.has(c.to.port))
        })
      }
      st.notify(placed ? `Saved “${p.model}” and updated ${placed} placed device${placed === 1 ? '' : 's'}` : `Saved “${p.model}” to your library`)
      close()
    } finally { setSaving(false) }
  }

  const editPort = (id: string, fn: (x: PortTemplate) => void) => edit((d) => { const x = d.ports.find((q) => q.id === id); if (x) fn(x) })
  /** A change on a ticked row applies to every ticked row (connector, gender, direction, signals, group, face). */
  const editPorts = (id: string, fn: (x: PortTemplate) => void) => edit((d) => { const ids = sel.has(id) && sel.size > 1 ? sel : new Set([id]); for (const x of d.ports) if (ids.has(x.id)) fn(x) })
  /** Renaming a ticked row renames every ticked row, numbered in order (see renameSeries). */
  const renamePorts = (id: string, text: string) => {
    if (!(sel.has(id) && sel.size > 1)) { editPort(id, (q) => { q.label = text }); return }
    const order = p.ports.filter((x) => sel.has(x.id)).map((x) => x.id)
    const names = renameSeries(text, order.length, order.indexOf(id))
    edit((d) => { order.forEach((pid, i) => { const q = d.ports.find((x) => x.id === pid); if (q && names[i]) q.label = names[i] }) })
  }
  const lastTick = useRef<number | null>(null)
  const tick = (i: number, id: string, on: boolean, shift: boolean) => setSel((s0) => {
    const n = new Set(s0)
    // Shift-click ticks (or unticks) the whole range from the last row clicked.
    const range = shift && lastTick.current != null ? p.ports.slice(Math.min(lastTick.current, i), Math.max(lastTick.current, i) + 1).map((x) => x.id) : [id]
    for (const r of range) { if (on) n.add(r); else n.delete(r) }
    lastTick.current = i
    return n
  })
  const allOn = p.ports.length > 0 && p.ports.every((x) => sel.has(x.id)), someOn = !allOn && p.ports.some((x) => sel.has(x.id))

  return (
    <Modal title={instance ? `Edit ${instance.tag} · ${initial.manufacturer} ${initial.model}` : (initial.source === 'user' || isBuiltIn) && initial.model !== 'New Product' ? `Edit ${initial.manufacturer} ${initial.model}` : 'Custom Product Builder'} onClose={close} wide
      footer={<>
        <span className="muted">{p.ports.length} ports · {heatBTU(p.power).toFixed(0)} BTU/hr</span>
        {stored && !instance && <button className="danger" onClick={async () => { if (await removeUserProduct(stored)) close() }}
          title={isBuiltIn ? 'Throw away your edits and go back to the built-in version' : 'Delete this custom product from your library'}>{isBuiltIn ? 'Revert to Built-in' : 'Delete Product…'}</button>}
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        {instance && <button disabled={problems.length > 0 || saving} onClick={saveInstance} title="Change only this placed device; the library and other copies stay as they are">Save to This Device Only</button>}
        <button className="primary" disabled={problems.length > 0 || saving} onClick={() => void save()}
          title={isBuiltIn ? 'Saves your edited version to the library (it replaces the built-in one; you can revert later) and updates every placed copy' : 'Saves to your library and updates every placed copy'}>
          {instance || isBuiltIn ? 'Save to Library & Update All' : 'Save to Library'}
        </button>
      </>}>
      <div className="product-editor">
        <div className="pe-left form">
          <h4>Identity</h4>
          {p.verified === false && (
            <div className="data-note">
              {p.dataNote ?? 'Specs not verified.'}
              <label className="check" style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" onChange={(e) => edit((d) => { if (e.target.checked) { d.verified = true; d.dataNote = undefined } })} />
                I’ve checked these specs against the manufacturer’s sheet
              </label>
            </div>
          )}
          <Field label="Manufacturer"><ManufacturerPicker value={p.manufacturer} onChange={(v) => edit((d) => { d.manufacturer = v })} /></Field>
          <Field label="Model"><TextInput value={p.model} onCommit={(v) => edit((d) => { d.model = v })} /></Field>
          <Field label="Category"><Select value={p.category} onChange={(v) => edit((d) => { d.category = v })} options={CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORIES[c].name }))} /></Field>
          <Field label="Description"><TextInput multiline value={p.summary} onCommit={(v) => edit((d) => { d.summary = v })} /></Field>
          <Field label="Tags"><TextInput value={p.tags.join(', ')} placeholder="comma separated" onCommit={(v) => edit((d) => { d.tags = v.split(',').map((t) => t.trim()).filter(Boolean) })} /></Field>

          <h4>Physical</h4>
          <Toggle label="Rack-mountable" checked={p.physical.rackUnits != null} onChange={(on) => edit((d) => { d.physical.rackUnits = on ? 1 : null; d.physical.mounting = on ? 'rack' : 'shelf'; if (on) d.physical.heightMM = RACK_UNIT_MM })} />
          {p.physical.rackUnits != null ? (<>
            <Field label="Height"><NumberInput value={p.physical.rackUnits} min={1} max={20} unit="U" onCommit={(v) => edit((d) => { d.physical.rackUnits = v ?? 1; d.physical.heightMM = (v ?? 1) * RACK_UNIT_MM })} /></Field>
            <Toggle label="Half-rack width" checked={p.physical.halfWidth} onChange={(v) => edit((d) => { d.physical.halfWidth = v })} />
          </>) : (<>
            <Field label="Mounting"><Select value={p.physical.mounting} onChange={(v) => edit((d) => { d.physical.mounting = v })} options={MOUNT_TYPES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} /></Field>
            <Field label="Height"><LenInput value={p.physical.heightMM} min={0} onCommit={(v) => edit((d) => { d.physical.heightMM = v ?? 0 })} /></Field>
          </>)}
          <Field label="Width"><LenInput value={p.physical.widthMM} min={0} onCommit={(v) => edit((d) => { d.physical.widthMM = v ?? 0 })} /></Field>
          <Field label="Depth"><LenInput value={p.physical.depthMM} min={0} onCommit={(v) => edit((d) => { d.physical.depthMM = v ?? 0 })} /></Field>
          <Field label="Weight"><WtInput value={p.physical.weightKG} min={0} step={0.1} onCommit={(v) => edit((d) => { d.physical.weightKG = v ?? 0 })} /></Field>

          <h4>Power</h4>
          <Toggle label="Powered by PoE" checked={p.power.poweredByPoE} onChange={(v) => edit((d) => { d.power.poweredByPoE = v })} />
          {!p.power.poweredByPoE && (
            <Field label="Voltages">
              <span className="chips">
                {(['ac120V', 'ac230V', 'dc12V', 'dc24V', 'dc48V'] as SignalType[]).map((v) => (
                  <button key={v} className={`chip ${p.power.acceptedVoltages.includes(v) ? 'on' : ''}`}
                    onClick={() => edit((d) => { d.power.acceptedVoltages = d.power.acceptedVoltages.includes(v) ? d.power.acceptedVoltages.filter((x) => x !== v) : [...d.power.acceptedVoltages, v] })}>
                    {SIGNALS[v].name.replace('AC ', '')}
                  </button>
                ))}
              </span>
            </Field>
          )}
          <Field label="Typical draw"><NumberInput value={p.power.typicalWatts} min={0} unit="W" onCommit={(v) => edit((d) => { d.power.typicalWatts = v ?? 0 })} /></Field>
          <Field label="Maximum draw"><NumberInput value={p.power.maxWatts} min={0} unit="W" onCommit={(v) => edit((d) => { d.power.maxWatts = v ?? 0 })} /></Field>
          <Field label="Efficiency" hint="Amplifiers: share of input power delivered to loudspeakers, not dissipated in the rack.">
            <NumberInput value={p.power.efficiency == null ? null : p.power.efficiency * 100} allowEmpty min={0} max={100} unit="%" onCommit={(v) => edit((d) => { d.power.efficiency = v == null || v === 0 ? null : v / 100 })} />
          </Field>
          <Field label="Heat" hint="Leave empty to calculate from typical draw × (1 − efficiency) × 3.412">
            <NumberInput value={p.power.publishedBTU} allowEmpty min={0} unit="BTU/hr" onCommit={(v) => edit((d) => { d.power.publishedBTU = v })} />
          </Field>
          {p.power.publishedBTU == null && <p className="muted small">Calculated: {heatBTU(p.power).toFixed(0)} BTU/hr</p>}
        </div>

        <div className="pe-right">
          <div className="ports-bar">
            <h4>Ports</h4>
            <span className="spacer" />
            <select value="" onChange={(e) => { const pr = PRESETS.find((x) => x.name === e.target.value); if (pr) edit((d) => { d.ports.push(pr.make()) }) }}>
              <option value="">+ Add port…</option>
              {PRESETS.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
            <button onClick={() => setShowSeries((v) => !v)}>+ Add series…</button>
            <button onClick={() => setSel(allOn ? new Set() : new Set(p.ports.map((x) => x.id)))}>{allOn ? 'Select None' : 'Select All'}</button>
            <button disabled={!sel.size} onClick={() => edit((d) => { d.ports.push(...d.ports.filter((x) => sel.has(x.id)).map((x) => ({ ...structuredClone(x), id: newPortId(), label: `${x.label} copy` }))) })}>Duplicate</button>
            <button className="danger" disabled={!sel.size} onClick={() => { edit((d) => { d.ports = d.ports.filter((x) => !sel.has(x.id)) }); setSel(new Set()) }}>Delete</button>
          </div>
          {sel.size > 1 && <p className="muted small ports-bulk">{sel.size} ports selected – a change on any ticked row applies to all {sel.size}. Renaming numbers them in order: type “Mic 1” (or “Ch {'{n}'} In”) and they become Mic 1, Mic 2… Shift-click a box to tick a range.</p>}
          {showSeries && <SeriesForm onAdd={(ps) => { edit((d) => { d.ports.push(...ps) }); setShowSeries(false) }} />}
          <div className="ports-table-wrap">
            <table className="ports-table">
              <thead><tr><th><input type="checkbox" title="Select all ports" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn }} onChange={() => setSel(allOn ? new Set() : new Set(p.ports.map((x) => x.id)))} /></th><th>Label</th><th>Connector</th><th>Gender</th><th>Direction</th><th>Signals</th><th>Group</th><th>Face</th><th /></tr></thead>
              <tbody>
                {p.ports.map((x, i) => (
                  <tr key={x.id} className={sel.has(x.id) ? 'sel' : ''}>
                    <td><input type="checkbox" checked={sel.has(x.id)} onClick={(e) => tick(i, x.id, (e.target as HTMLInputElement).checked, e.shiftKey)} onChange={() => {}} /></td>
                    <td><TextInput value={x.label} onCommit={(v) => renamePorts(x.id, v)} /></td>
                    <td><Select value={x.connector} width={130} onChange={(v: ConnectorType) => editPorts(x.id, (q) => { q.connector = v; q.gender = typicalPanelGender(v); if (!q.signals.length) q.signals = suggestedSignals(v) })} options={CONNECTOR_TYPES.map((c) => ({ value: c, label: connectorName(c) }))} /></td>
                    <td><Select value={x.gender} onChange={(v: Gender) => editPorts(x.id, (q) => { q.gender = v })} options={GENDERS.map((g) => ({ value: g, label: g }))} /></td>
                    <td><Select value={x.direction} onChange={(v) => editPorts(x.id, (q) => { q.direction = v })} options={DIRS} /></td>
                    <td><SignalPicker value={x.signals} connector={x.connector} onChange={(v) => editPorts(x.id, (q) => { q.signals = v })} /></td>
                    <td><TextInput value={x.group ?? ''} onCommit={(v) => editPorts(x.id, (q) => { q.group = v || undefined })} /></td>
                    <td><Select value={x.face} onChange={(v) => editPorts(x.id, (q) => { q.face = v })} options={[{ value: 'rear', label: 'Rear' }, { value: 'front', label: 'Front' }]} /></td>
                    <td className="reorder">
                      <button className="mini" disabled={i === 0} onClick={() => edit((d) => { [d.ports[i - 1], d.ports[i]] = [d.ports[i], d.ports[i - 1]] })} title="Move up">↑</button>
                      <button className="mini" disabled={i === p.ports.length - 1} onClick={() => edit((d) => { [d.ports[i + 1], d.ports[i]] = [d.ports[i], d.ports[i + 1]] })} title="Move down">↓</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pe-bottom">
            <NodePreview p={p} />
            <div className="checks">
              <h4>Checks</h4>
              {problems.length === 0 ? <p className="ok-line">✓ Ready to save</p> : <ul className="issues">{problems.map((m) => <li key={m}><span className="sev sev-error">✕</span><div>{m}</div></li>)}</ul>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function SignalPicker({ value, connector, onChange }: { value: SignalType[]; connector: ConnectorType; onChange: (v: SignalType[]) => void }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; maxH: number } | null>(null)
  const toggle = (s: SignalType) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
  const domains = Object.keys(DOMAINS) as SignalDomain[]
  // The list floats above the dialog (not clipped by it), kept on screen: flips up / left when there's no room.
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = () => {
      const r = btn.current!.getBoundingClientRect(), W = Math.min(560, window.innerWidth - 16)
      const ph = pop.current?.offsetHeight ?? 360
      const below = window.innerHeight - r.bottom - 8, above = r.top - 8
      const up = below < Math.min(ph, 300) && above > below
      const maxH = Math.max(160, Math.min(420, up ? above : below))
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
      setAt({ left, top: up ? Math.max(8, r.top - Math.min(ph, maxH) - 4) : r.bottom + 4, maxH })
    }
    place()
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc, true) }
  }, [open])
  return (
    <div className="signal-picker">
      <button ref={btn} className={`sp-button ${value.length ? '' : 'bad'}`} onClick={() => setOpen((o) => !o)}>
        {value.length ? value.map((s) => SIGNALS[s].name).join(', ') : 'None'}
      </button>
      {open && createPortal(
        <div ref={pop} className="sp-pop floating" style={{ left: at?.left ?? -9999, top: at?.top ?? -9999, maxHeight: at?.maxH }}>
          <div className="sp-section"><b>Typical for {connectorName(connector)}</b>
            {suggestedSignals(connector).map((s) => <label key={s}><input type="checkbox" checked={value.includes(s)} onChange={() => toggle(s)} />{SIGNALS[s].name}</label>)}
          </div>
          {domains.map((d) => (
            <div key={d} className="sp-section"><b style={{ color: DOMAINS[d].color }}>{DOMAINS[d].name}</b>
              {SIGNAL_TYPES.filter((s) => SIGNALS[s].domain === d).map((s) => <label key={s}><input type="checkbox" checked={value.includes(s)} onChange={() => toggle(s)} />{SIGNALS[s].name}</label>)}
            </div>
          ))}
        </div>, document.body)}
    </div>
  )
}

function SeriesForm({ onAdd }: { onAdd: (p: PortTemplate[]) => void }) {
  const [pattern, setPattern] = useState('Input {n}')
  const [count, setCount] = useState(8)
  const [start, setStart] = useState(1)
  const [connector, setConnector] = useState<ConnectorType>('euroblock')
  const [gender, setGender] = useState<Gender>('male')
  const [direction, setDirection] = useState<PortDirection>('input')
  const [signals, setSignals] = useState<SignalType[]>(['analogLine'])
  const [group, setGroup] = useState('')
  return (
    <div className="series-form">
      <Field label="Label pattern" hint="{n} becomes the channel number"><TextInput value={pattern} onCommit={setPattern} /></Field>
      <Field label="Count"><NumberInput value={count} min={1} max={256} onCommit={(v) => setCount(v ?? 1)} width={60} /></Field>
      <Field label="Start at"><NumberInput value={start} min={0} onCommit={(v) => setStart(v ?? 1)} width={60} /></Field>
      <Field label="Connector"><Select value={connector} onChange={(c: ConnectorType) => { setConnector(c); setSignals(suggestedSignals(c)); setGender(typicalPanelGender(c)) }} options={CONNECTOR_TYPES.map((c) => ({ value: c, label: connectorName(c) }))} /></Field>
      <Field label="Gender"><Select value={gender} onChange={setGender} options={GENDERS.map((g) => ({ value: g, label: g }))} /></Field>
      <Field label="Direction"><Select value={direction} onChange={setDirection} options={DIRS} /></Field>
      <Field label="Signals"><SignalPicker value={signals} connector={connector} onChange={setSignals} /></Field>
      <Field label="Group"><TextInput value={group} onCommit={setGroup} /></Field>
      <div className="series-preview muted">{pattern.replaceAll('{n}', String(start))} … {pattern.replaceAll('{n}', String(start + count - 1))}</div>
      <button className="primary" disabled={!signals.length} onClick={() => onAdd(series(`p.${Math.random().toString(36).slice(2, 7)}`, pattern, count, connector, gender, direction, signals, group || undefined, start))}>Add {count} ports</button>
    </div>
  )
}

/** Live preview of the product as a diagram node. */
function NodePreview({ p }: { p: ProductDefinition }) {
  const left = p.ports.filter((x) => x.direction === 'input')
  const right = p.ports.filter((x) => x.direction !== 'input')
  const row = (x: PortTemplate, side: 'l' | 'r') => {
    const d = portDomain(x)
    return <div key={x.id} className={`pv-port ${side}`}><Dot color={d ? DOMAINS[d].color : '#888'} square={x.direction === 'bidirectional'} /><span>{x.label}</span></div>
  }
  return (
    <div className="node-preview">
      <div className="pv-head"><b>TAG-01</b><span className="muted">{p.manufacturer} {p.model}</span></div>
      <div className="pv-cols"><div>{left.map((x) => row(x, 'l'))}</div><div>{right.map((x) => row(x, 'r'))}</div></div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { produce } from 'immer'
import {
  BUILT_IN_KEYS, makePlateProduct, PLATE_MODULE_KEYS, PLATE_MODULES, PLATE_STYLES,
  type PlateInsert, type PlateKind, type PlateSpec, type ProductDefinition,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { addProductToDiagram } from '../diagram/placement'
import { Field, Modal, NumberInput, Segmented, Select, TextInput } from '../components/ui'

const REAR_OPTIONS: { value: PlateInsert['rear']; label: string }[] = [
  { value: 'same', label: 'Pass-through (same jack)' },
  { value: 'idcPunchdown', label: 'Punch-down / solder' },
  { value: 'euroblock', label: 'Euroblock (screw terminal)' },
  { value: 'none', label: 'No tie line' },
]

const MODULE_OPTIONS = PLATE_MODULE_KEYS.map((k) => ({ value: k, label: PLATE_MODULES[k].name }))

/** Short label shown on the faceplate preview. */
const ICON: Record<string, string> = {
  xlrF: 'XLR F', xlrM: 'XLR M', trs: '¼"', mini: '3.5', rca: 'RCA', nl4: 'NL4', binding: 'POST', dmx: 'DMX', hdmi: 'HDMI', usbc: 'USB-C',
  usbA: 'USB-A', usbB: 'USB-B', dp: 'DP', vga: 'VGA', bnc: 'BNC', rj45: 'RJ45', ethercon: 'eCON', fiber: 'LC', opticalcon: 'oCON', db9: 'DB9',
  euro: 'EURO', pwr515: '5-15', pwr520: '5-20', pwrL530: 'L5-30', pwrTrue1: 'TRUE1', pwrSchuko: 'SCHUKO',
}

/**
 * Builder for custom wall plates, floor boxes and stage pockets. Pick a style,
 * add inserts (each one gives a room-side jack and a rear tie line), and save to
 * the library, place it, or update a device already on the drawing.
 */
export function PlateBuilder({ initial, instanceId }: { initial: ProductDefinition; instanceId: string | null }) {
  const [name, setName] = useState(initial.model)
  const [maker, setMaker] = useState(initial.manufacturer)
  const [spec, setSpec] = useState<PlateSpec>(initial.plate ?? { kind: 'wallPlate', style: '1-Gang', inserts: [] })
  const [saving, setSaving] = useState(false)
  const instance = useStore((s) => (instanceId ? s.project.equipment.find((e) => e.id === instanceId) : undefined))
  const isNew = !useStore.getState().library.get(initial.key) && !instance
  const isBuiltIn = BUILT_IN_KEYS.has(initial.key.split('@')[0])
  const close = () => useStore.getState().set({ editingPlate: null })
  const edit = (fn: (d: PlateSpec) => void) => setSpec((cur) => produce(cur, fn))
  const editInsert = (i: number, fn: (x: PlateInsert) => void) => edit((d) => fn(d.inserts[i]))

  const product = useMemo(() => makePlateProduct(spec, { key: initial.key.split('@')[0], manufacturer: maker, model: name }), [spec, maker, name, initial.key])
  const hasPower = spec.inserts.some((x) => PLATE_MODULES[x.module]?.power)
  const jacks = spec.inserts.reduce((a, x) => a + x.count, 0)
  const problems = [!name.trim() && 'Give it a name.', jacks === 0 && 'Add at least one insert.'].filter(Boolean) as string[]

  const applyToPlaced = (p: ProductDefinition, only?: string) => {
    const st = useStore.getState()
    const hits = st.project.equipment.filter((e) => (only ? e.id === only : e.product.key === p.key || e.id === instanceId))
    if (!hits.length) return 0
    st.apply(`Update ${p.model}`, (d) => {
      for (const e of d.equipment) if (hits.some((h) => h.id === e.id)) e.product = structuredClone(p)
      const ids = new Map(d.equipment.map((e) => [e.id, new Set(e.product.ports.map((x) => x.id))]))
      d.cables = d.cables.filter((c) => ids.get(c.from.equipment)?.has(c.from.port) && ids.get(c.to.equipment)?.has(c.to.port))
    })
    return hits.length
  }

  const saveLibrary = async (place: boolean) => {
    setSaving(true)
    try {
      const p = { ...product, source: 'user' as const, revision: initial.revision + 1 }
      await api.saveUserProduct(p)
      await useStore.getState().reloadLibrary()
      const n = applyToPlaced(p)
      if (place) addProductToDiagram(p)
      else useStore.getState().notify(n ? `Saved “${p.model}” and updated ${n} placed` : `Saved “${p.model}” to your library`)
      close()
    } finally { setSaving(false) }
  }

  const saveInstance = () => {
    if (!instance) return
    const p = { ...product, key: `${product.key}@${instance.id}`, source: 'user' as const, revision: initial.revision + 1 }
    applyToPlaced(p, instance.id)
    useStore.getState().notify(`Updated ${instance.tag} only`)
    close()
  }

  const kindName = spec.kind === 'floorBox' ? 'Floor Box' : 'Wall Plate'
  return (
    <Modal title={instance ? `Edit ${instance.tag} · ${initial.model}` : isNew ? `New ${kindName}` : `Edit ${initial.model}`} onClose={close} wide
      footer={<>
        <span className="muted">{jacks} insert{jacks === 1 ? '' : 's'} · {product.ports.length} ports{problems.length ? ` · ${problems[0]}` : ''}</span>
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        {instance && <button disabled={!!problems.length || saving} onClick={saveInstance}>Save to This Device Only</button>}
        {isNew && <button disabled={!!problems.length || saving} onClick={() => void saveLibrary(false)}>Save to Library</button>}
        <button className="primary" disabled={!!problems.length || saving} onClick={() => void saveLibrary(isNew)}>
          {isNew ? 'Save & Add to Diagram' : instance || isBuiltIn ? 'Save to Library & Update All' : 'Save to Library'}
        </button>
      </>}>
      <div className="plate-builder">
        <div className="pb-left form">
          <Field label="Type">
            <Segmented<PlateKind> value={spec.kind} onChange={(k) => edit((d) => { d.kind = k; d.style = PLATE_STYLES[k][k === 'floorBox' ? 1 : 0] })}
              options={[{ value: 'wallPlate', label: 'Wall Plate' }, { value: 'floorBox', label: 'Floor Box / Pocket' }]} />
          </Field>
          <Field label="Style"><Select value={spec.style} onChange={(v) => edit((d) => { d.style = v })} options={PLATE_STYLES[spec.kind].map((s) => ({ value: s, label: s }))} /></Field>
          <Field label="Name"><TextInput value={name} placeholder="e.g. Podium Plate" onCommit={setName} /></Field>
          <Field label="Manufacturer"><TextInput value={maker} placeholder="Custom" onCommit={setMaker} /></Field>
          {hasPower && <>
            <Field label="Circuit"><NumberInput value={spec.power?.amps ?? 20} min={5} step={5} unit="A" onCommit={(n) => edit((d) => { d.power = { volts: d.power?.volts ?? 120, amps: n ?? 20 } })} /></Field>
            <Field label="Voltage"><NumberInput value={spec.power?.volts ?? 120} min={12} step={1} unit="V" onCommit={(n) => edit((d) => { d.power = { amps: d.power?.amps ?? 20, volts: n ?? 120 } })} /></Field>
            <p className="muted small">Receptacles act as building power: set the panel and circuit on the placed device.</p>
          </>}
          <h4>Preview</h4>
          <div className={`plate-preview ${spec.kind}`}>
            {spec.inserts.flatMap((x, i) => Array.from({ length: Math.max(1, x.count) }, (_, n) => (
              <div key={`${i}.${n}`} className={`plate-jack ${PLATE_MODULES[x.module]?.power ? 'power' : PLATE_MODULES[x.module]?.group.toLowerCase()}`} title={PLATE_MODULES[x.module]?.name}>
                <span>{ICON[x.module] ?? x.module}</span>
                <small>{x.label ? `${x.label}${x.count > 1 ? ` ${n + 1}` : ''}` : x.count > 1 ? n + 1 : ''}</small>
              </div>
            )))}
            {jacks === 0 && <p className="muted small">Add inserts →</p>}
          </div>
        </div>
        <div className="pb-right">
          <h4>Inserts</h4>
          <table className="insert-table">
            <thead><tr><th>Insert</th><th>Qty</th><th>Label</th><th>Back of plate</th><th /></tr></thead>
            <tbody>
              {spec.inserts.map((x, i) => {
                const m = PLATE_MODULES[x.module]
                return (
                  <tr key={i}>
                    <td><Select value={x.module} onChange={(v) => editInsert(i, (y) => { y.module = v; y.rear = PLATE_MODULES[v].rear })} options={MODULE_OPTIONS} /></td>
                    <td><NumberInput value={x.count} min={1} max={48} width={56} onCommit={(n) => editInsert(i, (y) => { y.count = Math.max(1, Math.min(48, n ?? 1)) })} /></td>
                    <td><TextInput value={x.label ?? ''} placeholder={m?.name.replace(/\s*\(.*\)$/, '')} onCommit={(v) => editInsert(i, (y) => { y.label = v || undefined })} /></td>
                    <td>{m?.power ? <span className="muted small">Outlet on this box’s circuit</span>
                      : <Select value={x.rear} onChange={(v) => editInsert(i, (y) => { y.rear = v })} options={REAR_OPTIONS} />}</td>
                    <td className="row-actions">
                      <button className="mini" title="Move up" disabled={i === 0} onClick={() => edit((d) => { [d.inserts[i - 1], d.inserts[i]] = [d.inserts[i], d.inserts[i - 1]] })}>↑</button>
                      <button className="mini danger" title="Remove" onClick={() => edit((d) => { d.inserts.splice(i, 1) })}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="insert-add">
            {['xlrF', 'xlrM', 'rj45', 'hdmi', 'usbc', 'bnc', 'nl4', 'dmx', 'ethercon', 'pwr520'].map((k) => (
              <button key={k} className="mini" onClick={() => edit((d) => {
                const last = d.inserts[d.inserts.length - 1]
                if (last && last.module === k && !last.label) last.count += 1
                else d.inserts.push({ module: k, count: 1, rear: PLATE_MODULES[k].rear })
                if (PLATE_MODULES[k].power && !d.power) d.power = { volts: 120, amps: 20 }
              })}>+ {ICON[k]}</button>
            ))}
            <Select value="" onChange={(k: string) => k && edit((d) => { d.inserts.push({ module: k, count: 1, rear: PLATE_MODULES[k].rear }); if (PLATE_MODULES[k].power && !d.power) d.power = { volts: 120, amps: 20 } })}
              options={[{ value: '', label: 'More inserts…' }, ...MODULE_OPTIONS]} />
          </div>
          <p className="muted small">Each insert gives a jack in the room (left side of the diagram card) and a tie line on the back (right side) to cable back to the rack.
            Plates are passive: anything compatible can plug into either side.</p>
        </div>
      </div>
    </Modal>
  )
}

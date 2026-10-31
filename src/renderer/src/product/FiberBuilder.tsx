import { useMemo, useState } from 'react'
import {
  BUILT_IN_KEYS, FIBER_ENCLOSURES, FIBER_MODULES, FIBER_TYPES, fiberEnclosure, fiberModule, fiberSVG, makeFiberProduct,
  type FiberSpec, type FiberType, type ProductDefinition,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { addProductToDiagram } from '../diagram/placement'
import { Modal, Select } from '../components/ui'

/**
 * Modular fiber enclosure builder (FS.com FHD-style): pick the enclosure, the
 * fiber type, and a cassette or adapter panel for each slot, with a custom
 * engraving across the top of every module. Front adapters are the ports on
 * the left of the diagram card, MTP trunks / rear adapters on the right.
 */
export function FiberBuilder({ initial, instanceId }: { initial: ProductDefinition; instanceId: string | null }) {
  const [name, setName] = useState(initial.model)
  const [maker, setMaker] = useState(initial.manufacturer)
  const [spec, setSpec] = useState<FiberSpec>(() => structuredClone(initial.fiber!))
  const [saving, setSaving] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const instance = useStore((s) => (instanceId ? s.project.equipment.find((e) => e.id === instanceId) : undefined))
  const isNew = !useStore.getState().library.get(initial.key) && !instance
  const isBuiltIn = BUILT_IN_KEYS.has(initial.key.split('@')[0])
  const close = () => useStore.getState().set({ editingPlate: null })
  const enc = fiberEnclosure(spec.enclosure)
  const product = useMemo(() => makeFiberProduct(spec, { key: initial.key.split('@')[0], manufacturer: maker, model: name }), [spec, maker, name, initial.key])
  const preview = useMemo(() => fiberSVG(spec), [spec])
  const used = spec.slots.filter((s) => fiberModule(s.module))
  const fibers = used.reduce((t, s) => t + (fiberModule(s.module)?.fibers ?? 0), 0)
  const problems = [!name.trim() && 'Give it a name.', !used.length && 'Put a module in at least one slot.'].filter(Boolean) as string[]
  const setSlot = (i: number, patch: Partial<FiberSpec['slots'][number]>) => setSpec({ ...spec, slots: spec.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const setEnclosure = (key: string) => {
    const e = fiberEnclosure(key)
    const n = e.cols * e.rows
    setSpec({ ...spec, enclosure: key, slots: Array.from({ length: n }, (_, i) => spec.slots[i] ?? { module: null }) })
    if (!name.trim() || name === fiberEnclosure(spec.enclosure).name) setName(e.name)
    if (!maker.trim() || maker === fiberEnclosure(spec.enclosure).maker) setMaker(e.maker)
  }

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

  return (
    <Modal title={instance ? `Fiber Enclosure ${instance.tag} · ${initial.model}` : isNew ? 'New Fiber Enclosure' : `Fiber Enclosure · ${initial.model}`} onClose={close} wide
      footer={<>
        <span className="muted">{used.length} of {spec.slots.length} slots · {fibers} fibers · {product.ports.length} ports{problems.length ? ` · ${problems[0]}` : ''}</span>
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        {instance && <button disabled={!!problems.length || saving} onClick={saveInstance}>Save to This Device Only</button>}
        {isNew && <button disabled={!!problems.length || saving} onClick={() => void saveLibrary(false)}>Save to Library</button>}
        <button className="primary" disabled={!!problems.length || saving} onClick={() => void saveLibrary(isNew)}>
          {isNew ? 'Save & Add to Diagram' : instance || isBuiltIn ? 'Save to Library & Update All' : 'Save to Library'}
        </button>
      </>}>
      <div className="fb">
        <div className="fb-top row-gap">
          <label className="small">Enclosure <Select value={spec.enclosure} onChange={setEnclosure} options={FIBER_ENCLOSURES.map((e) => ({ value: e.key, label: `${e.maker} ${e.name}` }))} /></label>
          <label className="small">Fiber <Select value={spec.fiberType} onChange={(v) => setSpec({ ...spec, fiberType: v as FiberType })} options={FIBER_TYPES} /></label>
          <span className="spacer" />
          <input className="pd-name" value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />
          <input className="pd-maker" value={maker} placeholder="Manufacturer" onChange={(e) => setMaker(e.target.value)} />
        </div>
        <div className="fb-preview" style={{ aspectRatio: `${482.6} / ${44.45 * enc.ru}` }}
          onClick={(e) => {
            // Click a slot in the drawing to edit it.
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
            const c = Math.floor(((fx * 482.6) - 24) / ((482.6 - 48) / enc.cols)), row = Math.floor(fy * enc.rows)
            if (c >= 0 && c < enc.cols && row >= 0 && row < enc.rows) setFocus(row * enc.cols + c)
          }}
          dangerouslySetInnerHTML={{ __html: preview }} />
        <table className="fb-slots">
          <thead><tr><th>Slot</th><th>Module</th><th>Engraving (top of module)</th><th>Ports</th></tr></thead>
          <tbody>
            {spec.slots.map((s, i) => {
              const m = fiberModule(s.module)
              return (
                <tr key={i} className={focus === i ? 'on' : ''} onClick={() => setFocus(i)}>
                  <td className="mono">{i + 1}</td>
                  <td>
                    <Select value={s.module ?? ''} onChange={(v) => setSlot(i, { module: v || null })}
                      options={[{ value: '', label: '— Blank (empty slot)' }, ...FIBER_MODULES.map((x) => ({ value: x.key, label: x.name }))]} />
                  </td>
                  <td><input value={s.engraving ?? ''} placeholder={m ? `e.g. STAGE LEFT ${i + 1}` : ''} disabled={!m} maxLength={40}
                    onChange={(e) => setSlot(i, { engraving: e.target.value.toUpperCase() || undefined })} autoFocus={focus === i} /></td>
                  <td className="muted small">{m ? `${m.front.count}× ${m.front.name} front${m.rear ? ` · ${m.rear.count}× ${m.rear.name} trunk` : ' · same at rear'}` : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted small">The engraving prints across the top of each module on the diagram card, the rack elevation and drawings, and names its ports (e.g. “STAGE LEFT LC 3”). Cassettes give LC / SC / MTP-8 / MDC adapters at the front (left side of the card) and MTP trunk connectors at the back (right side); adapter panels have the same adapter front and back. Cables between {spec.fiberType === 'OS2' ? 'single-mode' : 'multimode'} panels default to {spec.fiberType} patch cords and trunks. Module types follow FS.com’s FHD range – check part numbers against the current datasheet.</p>
      </div>
    </Modal>
  )
}

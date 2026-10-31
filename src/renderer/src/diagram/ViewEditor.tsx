import { useMemo, useState } from 'react'
import {
  CATEGORIES, createView, DOMAINS, layoutView, nodeGeom, portInView, viewCandidates, viewMembers, viewsOf,
  type EquipmentCategory, type SignalDomain,
} from '@core/index'
import { useStore } from '../store'
import { Modal, TextInput, Toggle } from '../components/ui'
import { openView } from './GroupsPanel'

const INFRA: EquipmentCategory[] = ['wallPlate', 'floorBox', 'patchBay']

/**
 * Create / edit a signal view: name, which signal types it shows, and which
 * devices are on it (starts with everything that has a matching port).
 */
export function ViewEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const existing = id === 'new' ? undefined : viewsOf(project).find((v) => v.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [domains, setDomains] = useState<SignalDomain[]>(existing?.domains ?? ['audio'])
  const [auto, setAuto] = useState(existing?.auto ?? true)
  const [hideUnused, setHideUnused] = useState(existing?.hideUnused ?? false)
  // Device choice: null = "everything matching" until the user ticks something.
  const [picked, setPicked] = useState<Set<string> | null>(() => (existing ? new Set(viewMembers(project, existing).map((e) => e.id as string)) : null))
  const cands = useMemo(() => new Set(viewCandidates(project, { domains }).map((e) => e.id as string)), [project, domains])
  const checked = picked ?? cands
  const sorted = useMemo(() => [...project.equipment].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true })), [project.equipment])
  const matching = sorted.filter((e) => cands.has(e.id)), others = sorted.filter((e) => !cands.has(e.id))
  const toggle = (eid: string) => { const n = new Set(checked); if (n.has(eid)) n.delete(eid); else n.add(eid); setPicked(n) }
  const defaultName = domains.map((d) => DOMAINS[d].name).join(' + ') || 'View'

  const save = () => {
    let vid = ''
    apply(existing ? 'Edit View' : 'New View', (d) => {
      const v = existing ? viewsOf(d).find((x) => x.id === existing.id)! : createView(d, { name: name.trim() || defaultName, domains })
      v.name = name.trim() || defaultName
      v.domains = domains
      v.auto = auto
      v.hideUnused = hideUnused || undefined
      const c = new Set(viewCandidates(d, v).map((e) => e.id as string))
      v.include = [...checked].filter((x) => !auto || !c.has(x))
      v.exclude = auto ? [...c].filter((x) => !checked.has(x)) : []
      for (const k of Object.keys(v.positions)) if (!checked.has(k)) delete v.positions[k]
      // Port set changed → block sizes changed, so lay the whole view out again.
      const reshaped = !existing || existing.hideUnused !== v.hideUnused || existing.domains.join() !== domains.join()
      layoutView(d, v.id, nodeGeom, { onlyNew: !reshaped })
      vid = v.id
    })
    onClose()
    if (vid) { openView(vid); setTimeout(() => useStore.getState().set({ fitRequest: useStore.getState().fitRequest + 1 }), 80) }
  }

  const row = (e: (typeof sorted)[number]) => {
    const n = e.product.ports.filter((x) => portInView(x, domains)).length
    return (
      <label key={e.id} className={`ve-row ${checked.has(e.id) ? '' : 'off'}`}>
        <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggle(e.id)} />
        <b>{e.tag}</b>
        <span className="ellipsis">{e.product.model} <span className="muted">· {CATEGORIES[e.product.category]?.name}</span></span>
        <span className="muted small">{n ? `${n} port${n === 1 ? '' : 's'}` : 'no matching ports'}</span>
      </label>
    )
  }

  return (
    <Modal title={existing ? `Edit View – ${existing.name}` : 'New Signal View'} onClose={onClose} wide footer={<>
      <span className="muted">{checked.size} device{checked.size === 1 ? '' : 's'} · only {domains.map((d) => DOMAINS[d].name).join(', ') || '–'} ports</span>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!domains.length} onClick={save}>{existing ? 'Save View' : 'Create View'}</button>
    </>}>
      <div className="view-editor">
        <div className="ve-left form">
          <p className="muted small" style={{ margin: 0 }}>A view is an extra page that shows devices from your diagram with <b>only the ports and wires</b> of the signal types you choose – e.g. the audio tie lines from wall plates and floor boxes to the patch bay. It has its own layout; the main diagram keeps every port.</p>
          <label className="field-label">Name</label>
          <TextInput value={name} placeholder={defaultName} onCommit={setName} />
          <label className="field-label">Show these signals</label>
          <div className="ve-chips">
            {(Object.keys(DOMAINS) as SignalDomain[]).map((d) => (
              <button key={d} className={domains.includes(d) ? 'on' : ''} onClick={() => setDomains(domains.includes(d) ? domains.filter((x) => x !== d) : [...domains, d])}>
                <span className="dot" style={{ background: DOMAINS[d].color }} />{DOMAINS[d].name}
              </button>
            ))}
          </div>
          <Toggle label="Only show ports that are wired" checked={hideUnused} onChange={setHideUnused} />
          <p className="muted small" style={{ margin: 0 }}>Keeps big patch bays short. Leave it off if you want to wire new connections in this view.</p>
          <Toggle label="Add new matching devices automatically" checked={auto} onChange={setAuto} />
          <p className="muted small" style={{ margin: 0 }}>{auto ? 'Devices you add to the project later that have these signals join this view by themselves (untick any you don’t want).' : 'Only the devices ticked here – add more later by right-clicking a device → Add to View.'}</p>
        </div>
        <div className="ve-right">
          <div className="row-gap">
            <b>Devices</b>
            <span className="spacer" />
            <button className="mini" onClick={() => setPicked(new Set(cands))}>All matching</button>
            <button className="mini" onClick={() => setPicked(new Set(matching.filter((e) => INFRA.includes(e.product.category)).map((e) => e.id as string)))} title="Just the wall plates, floor boxes and patch bays">Plates, boxes &amp; patch bays</button>
            <button className="mini" onClick={() => setPicked(new Set())}>None</button>
          </div>
          <div className="ve-list">
            <div className="ve-sec">With {domains.map((d) => DOMAINS[d].name).join(' / ') || 'matching'} ports ({matching.length})</div>
            {matching.map(row)}
            {!matching.length && <p className="muted small" style={{ padding: '6px 10px' }}>No devices have these signals yet.</p>}
            {others.length > 0 && <div className="ve-sec">Other devices ({others.length})</div>}
            {others.map(row)}
          </div>
        </div>
      </div>
    </Modal>
  )
}

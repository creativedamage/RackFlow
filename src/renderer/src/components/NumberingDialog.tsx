import { useEffect, useState } from 'react'
import {
  clearBoxPortNumbers, formatPortNumber, isBox, numberBoxPorts, PORT_CLASSES, portClass, portRule, type PortClass, type PortRule,
  CABLE_PREFIXES, CATEGORIES, CATEGORY_KEYS, DOMAINS, cableRule, defaultNumberingStandard, formatNumber, numberingOf, renumberCables, renumberDevices, tagRule,
  type CableSystem, type EquipmentCategory, type NumberingStandard, type NumberRule, type Project, type SignalDomain,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Modal, Segmented } from './ui'

const SYSTEMS: CableSystem[] = [...(Object.keys(DOMAINS) as SignalDomain[]), 'other']
const loadStandards = async () => ((await api.storeGet<NumberingStandard[]>('NumberingStandards')) ?? []).filter((s) => s && s.tags && s.cables)

/**
 * Numbering standards: device tag and cable label formats (prefix, separator,
 * digits, start) per category / signal system. New devices and cables follow
 * it; Renumber applies it to what's already drawn. Standards can be saved and
 * loaded in other projects.
 */
export function NumberingDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [std, setStd] = useState<NumberingStandard>(() => structuredClone(numberingOf(project)))
  const [tab, setTab] = useState<'tags' | 'cables' | 'ports'>('tags')
  const [saved, setSaved] = useState<NumberingStandard[]>([])
  const [onlyUsed, setOnlyUsed] = useState(true)
  useEffect(() => { void loadStandards().then(setSaved) }, [])
  const draft: Project = { ...project, numbering: std }
  const used = new Set(project.equipment.map((e) => e.product.category))
  const cats = CATEGORY_KEYS.filter((c) => !onlyUsed || used.has(c) || std.tags[c])

  const setTag = (c: EquipmentCategory, patch: Partial<NumberRule>) => setStd({ ...std, tags: { ...std.tags, [c]: { ...std.tags[c], ...patch } } })
  const setCable = (c: CableSystem, patch: Partial<NumberRule>) => setStd({ ...std, cables: { ...std.cables, [c]: { ...std.cables[c], ...patch } } })
  const save = (then?: (d: Project) => number, what?: string) => {
    let n = 0
    const wasOn = !!numberingOf(project).boxPorts?.on
    apply(what ? `Renumber ${what}` : 'Numbering Standard', (d) => {
      d.numbering = structuredClone(std)
      // Box port numbers: switching on numbers the jacks that have none; switching off takes them away.
      if (std.boxPorts?.on) numberBoxPorts(d)
      else if (wasOn) clearBoxPortNumbers(d)
      if (then) n = then(d)
    })
    notify(what ? `Renumbered ${n} ${what.toLowerCase()} to “${std.name}”` : `Numbering standard “${std.name}” – new devices and cables follow it`, { kind: 'success', undo: true })
    onClose()
  }
  const num = (v: string, fallback: number) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback }

  const ruleRow = (key: string, name: string, rule: NumberRule, own: Partial<NumberRule> | undefined, set: (p: Partial<NumberRule>) => void, count?: number) => (
    <tr key={key}>
      <td>{name}{count ? <span className="muted small"> · {count}</span> : null}</td>
      <td><input className="mono" value={own?.prefix ?? ''} placeholder={rule.prefix} onChange={(e) => set({ prefix: e.target.value.toUpperCase() || undefined })} style={{ width: 70 }} /></td>
      <td><input className="mono" value={own?.separator ?? ''} placeholder={rule.separator || 'none'} onChange={(e) => set({ separator: e.target.value === '' ? undefined : e.target.value })} style={{ width: 44 }} maxLength={3} /></td>
      <td><input className="mono" type="number" min={1} max={6} value={own?.digits ?? ''} placeholder={String(rule.digits)} onChange={(e) => set({ digits: e.target.value ? num(e.target.value, rule.digits) : undefined })} style={{ width: 56 }} /></td>
      <td><input className="mono" type="number" min={0} value={own?.start ?? ''} placeholder={String(rule.start)} onChange={(e) => set({ start: e.target.value ? num(e.target.value, rule.start) : undefined })} style={{ width: 70 }} /></td>
      <td className="mono nb-ex">{formatNumber(rule, rule.start)}, {formatNumber(rule, rule.start + 1)}…</td>
    </tr>
  )
  const defaults = (d: Omit<NumberRule, 'prefix'>, set: (d: Omit<NumberRule, 'prefix'>) => void) => (
    <div className="row-gap nb-defaults">
      <span className="small">Defaults:</span>
      <label>Separator <input className="mono" value={d.separator} onChange={(e) => set({ ...d, separator: e.target.value })} style={{ width: 44 }} maxLength={3} /></label>
      <label>Digits <input className="mono" type="number" min={1} max={6} value={d.digits} onChange={(e) => set({ ...d, digits: num(e.target.value, d.digits) })} style={{ width: 56 }} /></label>
      <label>Start at <input className="mono" type="number" min={0} value={d.start} onChange={(e) => set({ ...d, start: num(e.target.value, d.start) })} style={{ width: 70 }} /></label>
    </div>
  )

  return (
    <Modal title="Numbering Standards" onClose={onClose} wide footer={<>
      <button onClick={async () => {
        const next = [...saved.filter((s) => s.name !== std.name), structuredClone(std)]
        await api.storeSet('NumberingStandards', next); setSaved(next)
        notify(`Saved standard “${std.name}” – load it in any project`, { kind: 'success' })
      }}>Save as Standard</button>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      {tab === 'ports'
        ? <button disabled={!std.boxPorts?.on} onClick={() => save((d) => numberBoxPorts(d, { all: true }), 'Box Ports')} title="Save, then number every box port again from the start, box by box in tag order">Save &amp; Renumber Box Ports</button>
        : tab === 'tags'
        ? <button onClick={() => save((d) => renumberDevices(d), 'Devices')} title="Save, then re-tag every device with this standard">Save &amp; Renumber Devices</button>
        : <button onClick={() => save((d) => renumberCables(d, { schemes: Object.fromEntries((Object.keys(DOMAINS) as SignalDomain[]).map((s) => { const r = cableRule(d, s); return [s, r] })), other: cableRule(d, 'other'), separator: std.cableDefaults.separator }), 'Cables')} title="Save, then relabel every cable with this standard">Save &amp; Renumber Cables</button>}
      <button className="primary" onClick={() => save()}>Save</button>
    </>}>
      <div className="numbering form">
        <div className="row-gap">
          <label className="small">Standard name <input value={std.name} onChange={(e) => setStd({ ...std, name: e.target.value })} style={{ width: 200 }} /></label>
          <span className="spacer" />
          <select value="" onChange={(e) => { const s = saved.find((x) => x.name === e.target.value); if (s) setStd(structuredClone(s)); if (e.target.value === '__default') setStd(defaultNumberingStandard()) }}>
            <option value="">Load a standard…</option>
            <option value="__default">RackFlow default</option>
            {saved.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          {saved.some((s) => s.name === std.name) && <button className="mini danger" onClick={async () => { const next = saved.filter((s) => s.name !== std.name); await api.storeSet('NumberingStandards', next); setSaved(next) }}>Delete saved</button>}
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'tags', label: 'Device tags' }, { value: 'cables', label: 'Cable labels' }, { value: 'ports', label: 'Box ports' }]} />
        {tab === 'ports' ? <BoxPortsTab std={std} setStd={setStd} project={draft} /> : tab === 'tags' ? (<>
          {defaults(std.tagDefaults, (d) => setStd({ ...std, tagDefaults: d }))}
          <label className="toggle small"><input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} /> Only categories in this project</label>
          <div className="nb-table-wrap">
            <table className="nb-table">
              <thead><tr><th>Category</th><th>Prefix</th><th>Sep.</th><th>Digits</th><th>Start</th><th>Example</th></tr></thead>
              <tbody>{cats.map((c) => ruleRow(c, CATEGORIES[c].name, tagRule(draft, c), std.tags[c], (patch) => setTag(c, patch), project.equipment.filter((e) => e.product.category === c).length))}</tbody>
            </table>
          </div>
          <p className="muted small">Empty boxes use the default (grey). New devices get the next free tag; <b>Save &amp; Renumber Devices</b> re-tags everything top-to-bottom, left-to-right per category.</p>
        </>) : (<>
          {defaults(std.cableDefaults, (d) => setStd({ ...std, cableDefaults: d }))}
          <div className="nb-table-wrap">
            <table className="nb-table">
              <thead><tr><th>System</th><th>Prefix</th><th>Sep.</th><th>Digits</th><th>Start</th><th>Example</th></tr></thead>
              <tbody>{SYSTEMS.map((c) => ruleRow(c, c === 'other' ? 'Other' : DOMAINS[c].name, cableRule(draft, c, CABLE_PREFIXES[c]), std.cables[c], (patch) => setCable(c, patch)))}</tbody>
            </table>
          </div>
          <p className="muted small">New cables get the next free label for their system. <b>Save &amp; Renumber Cables</b> relabels all of them (Schedule → Renumber… does selections and other orders).</p>
        </>)}
      </div>
    </Modal>
  )
}

/** Box ports: unique numbers across every wall box / plate / floor box / connector panel. */
function BoxPortsTab({ std, setStd, project }: { std: NumberingStandard; setStd: (s: NumberingStandard) => void; project: Project }) {
  const bp = std.boxPorts ?? { on: false, rules: {} }
  const setBp = (patch: Partial<typeof bp>) => setStd({ ...std, boxPorts: { ...bp, ...patch } })
  const setRule = (c: PortClass, patch: Partial<PortRule>) => setBp({ rules: { ...bp.rules, [c]: { ...bp.rules[c], ...patch } } })
  const boxes = project.equipment.filter(isBox)
  const counts = new Map<PortClass, number>()
  for (const e of boxes) for (const p of e.product.ports) { const c = portClass(p); if (c) counts.set(c, (counts.get(c) ?? 0) + 1) }
  const num = (v: string, f: number) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : f }
  // Shared prefixes share a sequence – show which.
  const seq = new Map<string, string[]>()
  for (const c of PORT_CLASSES) { const r = portRule(project, c.key); if (!r.off) seq.set(r.prefix + r.separator, [...(seq.get(r.prefix + r.separator) ?? []), c.key]) }
  return (<>
    <label className="toggle"><input type="checkbox" checked={bp.on} onChange={(e) => setBp({ on: e.target.checked })} /> <b>Number box ports across the project</b></label>
    <p className="muted small" style={{ margin: 0 }}>Every jack on wall boxes, gang plates, floor boxes and rack connector panels gets a number no other box uses – e.g. WP-001 has M1–M10, WP-002 carries on at M11–M20. The number becomes the port name everywhere (cards, drawings, schedule, labels); the rear tie line follows it. Types with the same prefix share one sequence.</p>
    <div className="nb-table-wrap" style={{ opacity: bp.on ? 1 : 0.5 }}>
      <table className="nb-table">
        <thead><tr><th>Jack type</th><th>On</th><th>Prefix</th><th>Sep.</th><th>Digits</th><th>Start</th><th>Example</th></tr></thead>
        <tbody>{PORT_CLASSES.map((c) => {
          const r = portRule(project, c.key), own = bp.rules[c.key]
          const shared = (seq.get(r.prefix + r.separator)?.length ?? 0) > 1
          return (
            <tr key={c.key}>
              <td>{c.name}{counts.get(c.key) ? <span className="muted small"> · {counts.get(c.key)}</span> : null}</td>
              <td><input type="checkbox" disabled={!bp.on} checked={!r.off} onChange={(e) => setRule(c.key, { off: !e.target.checked })} /></td>
              <td><input className="mono" disabled={!bp.on} value={own?.prefix ?? ''} placeholder={c.prefix} onChange={(e) => setRule(c.key, { prefix: e.target.value.toUpperCase() || undefined })} style={{ width: 64 }} /></td>
              <td><input className="mono" disabled={!bp.on} value={own?.separator ?? ''} placeholder="none" onChange={(e) => setRule(c.key, { separator: e.target.value === '' ? undefined : e.target.value })} style={{ width: 44 }} maxLength={3} /></td>
              <td><input className="mono" disabled={!bp.on} type="number" min={1} max={5} value={own?.digits ?? ''} placeholder={String(r.digits)} onChange={(e) => setRule(c.key, { digits: e.target.value ? num(e.target.value, r.digits) : undefined })} style={{ width: 52 }} /></td>
              <td><input className="mono" disabled={!bp.on} type="number" min={0} value={own?.start ?? ''} placeholder={String(r.start)} onChange={(e) => setRule(c.key, { start: e.target.value ? num(e.target.value, r.start) : undefined })} style={{ width: 60 }} /></td>
              <td className="mono nb-ex">{r.off ? '–' : `${formatPortNumber(r, r.start)}, ${formatPortNumber(r, r.start + 1)}…`}{shared && !r.off ? <span className="muted small"> (shared)</span> : null}</td>
            </tr>
          )
        })}</tbody>
      </table>
    </div>
    <p className="muted small" style={{ margin: 0 }}>{boxes.length} box{boxes.length === 1 ? '' : 'es'} in this project. <b>Save</b> numbers jacks that don’t have one yet (new boxes get theirs as you add them); <b>Save &amp; Renumber Box Ports</b> starts again from the first box by tag. A clash shows in ⚠︎ Design checks.</p>
  </>)
}

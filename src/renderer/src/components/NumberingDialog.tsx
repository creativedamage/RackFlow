import { useEffect, useState } from 'react'
import {
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
  const [tab, setTab] = useState<'tags' | 'cables'>('tags')
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
    apply(what ? `Renumber ${what}` : 'Numbering Standard', (d) => { d.numbering = structuredClone(std); if (then) n = then(d) })
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
      {tab === 'tags'
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
        <Segmented value={tab} onChange={setTab} options={[{ value: 'tags', label: 'Device tags' }, { value: 'cables', label: 'Cable labels' }]} />
        {tab === 'tags' ? (<>
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

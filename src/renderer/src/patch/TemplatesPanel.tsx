import { useMemo, useState } from 'react'
import { FORMAT_KEYS, FORMATS, isTwoSided, newCustomTemplate, panelDescription, TERMINATIONS, totalChannels, type PatchBayTemplate, type PatchFormat } from '@core/index'
import { useStore } from '../store'
import { api } from '../platform'
import { Select } from '../components/ui'
import { addBayToProject } from './addBay'

type SortKey = 'make' | 'model' | 'type' | 'rows' | 'holes'

/** PatchCAD-style template browser: Make / Model / Type / Rows / Holes. */
export function TemplatesPanel({ peek = false }: { peek?: boolean } = {}) {
  const templates = useStore((s) => s.templates)
  const set = useStore((s) => s.set)
  const [q, setQ] = useState('')
  const [type, setType] = useState<PatchFormat | ''>('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'make', dir: 1 })
  const [picked, setPicked] = useState<string | null>(null)

  const val = (t: PatchBayTemplate, k: SortKey): string | number =>
    k === 'make' ? t.manufacturer : k === 'model' ? t.series : k === 'type' ? FORMATS[t.format].name : k === 'rows' ? t.rows.length : totalChannels(t)

  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return templates
      .filter((t) => !type || t.format === type)
      .filter((t) => { const hay = `${t.manufacturer} ${t.series} ${FORMATS[t.format].name} ${t.cableCategory ?? ''} ${t.termination ?? ''}`.toLowerCase(); return !s || s.split(/\s+/).every((w) => hay.includes(w)) })
      .sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
      })
  }, [templates, q, type, sort])

  const add = (t: PatchBayTemplate) => { addBayToProject(t) }

  const head = (k: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : 1 }))} className={sort.key === k ? 'sorted' : ''}>
      {label}{sort.key === k ? (sort.dir === 1 ? ' ▴' : ' ▾') : ''}
    </th>
  )
  const current = templates.find((t) => t.key === picked)

  return (
    <aside className={`inspector templates-panel ${peek ? 'peek' : ''}`}>
      <div className="tp-head"><h3>Add a patch bay</h3><p className="muted small">Click <b>Add</b> (or double-click a row). Each bay also appears on the Wiring Diagram.</p></div>
      <div className="tp-filters">
        <input type="search" placeholder="Search Templates" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onChange={setType} options={[{ value: '', label: 'Type' }, ...FORMAT_KEYS.map((f) => ({ value: f, label: FORMATS[f].name }))]} />
        <button onClick={() => { setQ(''); setType('') }}>Clear</button>
      </div>
      <div className="tp-table-wrap">
        <table className="tp-table">
          <thead><tr>{head('make', 'Make')}{head('model', 'Model / Type')}{head('holes', 'Ports')}<th /></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.key} className={picked === t.key ? 'sel' : ''} onClick={() => setPicked(t.key)} onDoubleClick={() => add(t)} title="Double-click to add to the project">
                <td className="tp-make">{t.manufacturer}{!t.dimensionsVerified && <span className="nominal" title="Nominal dimensions">*</span>}</td>
                <td className="tp-model">
                  <div className="tp-series">{t.series}</div>
                  <div className="tp-type">{FORMATS[t.format].name}{panelDescription(t) ? ` · ${panelDescription(t)}` : ''} · {t.rackUnits}RU · {t.rows.length} row{t.rows.length === 1 ? '' : 's'}</div>
                </td>
                <td className="num">{totalChannels(t)}</td>
                <td><button className="mini tp-add" title="Add to project" onClick={(e) => { e.stopPropagation(); add(t) }}>Add</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {current && (
        <div className="tp-detail">
          <b>{current.manufacturer} {current.series}</b>
          <span>{FORMATS[current.format].name} · {totalChannels(current)} {isTwoSided(current) ? 'ports' : 'points'} · {current.rows.length} × {current.rows[0]?.strip.channelCount} · {current.rackUnits}RU</span>
          {isTwoSided(current) && <span>{TERMINATIONS[current.termination!].name}{current.cableCategory ? ` · ${current.cableCategory.replace('cat', 'Cat').replace('6a', '6A')}${current.shielded ? ' shielded' : ''}` : ''} · wired front and rear</span>}
          {current.notes && <span className="muted">{current.notes}</span>}
        </div>
      )}
      <div className="tp-foot">
        <button className="primary" disabled={!current} onClick={() => current && add(current)}>Add to Project</button>
        <button disabled={!current} onClick={() => current && set({ editingTemplate: { ...structuredClone(current), key: current.source === 'user' ? current.key : `user.${current.key}.${Date.now().toString(36)}`, source: 'user', manufacturer: current.manufacturer === 'Generic' ? 'Custom' : current.manufacturer } })}>
          {current?.source === 'user' ? 'Edit…' : 'Customize…'}
        </button>
        <button onClick={() => set({ editingTemplate: newCustomTemplate() })}>New…</button>
        <label className="button-like" title="Import a shared .rftemplate.json">Import…
          <input type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            try {
              const j = JSON.parse(await f.text())
              const tpl = (j.template ?? j) as PatchBayTemplate
              if (!tpl?.rows?.length || !tpl.format) throw new Error('not a template')
              await api.saveUserTemplate({ ...tpl, key: `user.${Date.now().toString(36)}`, source: 'user' })
              await useStore.getState().reloadLibrary()
              useStore.getState().notify(`Imported “${tpl.manufacturer} ${tpl.series}”`)
            } catch { useStore.getState().notify('That file isn’t a RackFlow patch bay template.') }
          }} />
        </label>
      </div>
      <p className="muted small tp-note">* nominal strip dimensions: verify against the panel before printing.</p>
    </aside>
  )
}

import { useMemo, useState } from 'react'
import {
  BUILT_IN_KEYS, makePlateProduct, newPlateSpec, CATEGORIES, CATEGORY_KEYS, DOMAINS, FORMATS, newCustomProduct, newCustomTemplate, productDomains, templateName, totalChannels,
  type EquipmentCategory, type ProductDefinition, type SignalDomain,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Dot, Segmented, Select } from './ui'
import { MakersBrowser } from './MakersBrowser'
import { addBayToProject } from '../patch/addBay'
import { addProductToDiagram } from '../diagram/placement'
import { showContextMenu } from './ContextMenu'
import { openProductEditor } from '../product/openEditor'
import { duplicateProduct, productMenu, removeUserProduct } from '../product/productActions'

export const DRAG_MIME = 'application/x-rackflow'
export type DragPayload = { kind: 'product'; key: string } | { kind: 'patch'; key: string } | { kind: 'rack-eq'; id: string }

export function Sidebar() {
  const [tab, setTab] = useState<'gear' | 'makers' | 'patch'>('gear')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<EquipmentCategory | '' | 'mine'>('')
  const [domain, setDomain] = useState<SignalDomain | ''>('')
  const library = useStore((s) => s.library)
  const templates = useStore((s) => s.templates)
  const set = useStore((s) => s.set)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const cap = query || category ? 40 : 8
  const toggle = (set_: Set<string>, k: string) => { const n = new Set(set_); if (n.has(k)) n.delete(k); else n.add(k); return n }

  const results = useMemo(() => {
    const hits = library.search({ text: query, category: category === 'mine' ? null : category || null, domain: domain || null })
    return category === 'mine' ? hits.filter((p) => p.source === 'user') : hits
  }, [library, query, category, domain])
  const grouped = useMemo(() => {
    const m = new Map<EquipmentCategory, ProductDefinition[]>()
    for (const p of results) { const a = m.get(p.category); if (a) a.push(p); else m.set(p.category, [p]) }
    return [...m.entries()].sort((a, b) => CATEGORIES[a[0]].name.localeCompare(CATEGORIES[b[0]].name))
  }, [results])

  const tmplGroups = useMemo(() => {
    const q = query.toLowerCase()
    const m = new Map<string, typeof templates>()
    for (const t of templates) {
      if (q && !`${templateName(t)} ${FORMATS[t.format].name}`.toLowerCase().includes(q)) continue
      m.set(t.manufacturer, [...(m.get(t.manufacturer) ?? []), t])
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'Generic' ? -1 : b[0] === 'Generic' ? 1 : a[0].localeCompare(b[0])))
  }, [templates, query])

  const drag = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }



  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'gear', label: 'Equipment' }, { value: 'makers', label: 'Makers' }, { value: 'patch', label: 'Patch Bays' }]} />
        <input className="search" type="search" placeholder={tab === 'gear' ? 'Search gear or manufacturer…' : tab === 'makers' ? 'Search manufacturers or product lines…' : 'Search patch bays…'} value={query} onChange={(e) => setQuery(e.target.value)} />
        {tab === 'gear' && (
          <div className="filters">
            <Select value={category} onChange={setCategory} options={[{ value: '', label: 'All categories' }, { value: 'mine', label: '★ My custom & edited' }, ...CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORIES[c].name }))]} />
            <Select value={domain} onChange={setDomain} options={[{ value: '', label: 'All signals' }, ...(Object.keys(DOMAINS) as SignalDomain[]).map((d) => ({ value: d, label: DOMAINS[d].name }))]} />
          </div>
        )}
      </div>

      {tab === 'makers' ? <MakersBrowser query={query} /> : <>
      <div className="sidebar-list">
        {tab === 'gear' ? (
          grouped.length === 0 ? <p className="muted pad">No products match.</p> :
          <>
          <p className="muted lib-count">{results.length.toLocaleString()} products</p>
          {grouped.map(([cat, items]) => {
            const isCollapsed = collapsed.has(cat)
            const shown = expanded.has(cat) ? items : items.slice(0, cap)
            return (
            <section key={cat}>
              <h4 className="lib-cat" onClick={() => setCollapsed(toggle(collapsed, cat))}>
                <span className={`disclosure ${isCollapsed ? '' : 'open'}`}>▸</span>{CATEGORIES[cat].name} <span className="muted">{items.length}</span>
              </h4>
              {!isCollapsed && shown.map((p) => (
                <div key={p.key} className="lib-item" draggable onDragStart={(e) => drag(e, { kind: 'product', key: p.key })} onDoubleClick={() => addProductToDiagram(p)} onContextMenu={(e) => showContextMenu(e, productMenu(p))} title="Double-click to add to the Wiring Diagram, or drag it where you want it. Right-click to edit.">
                  <div className="lib-main">
                    <div className="lib-title">{p.model}{p.source === 'user' && <span className="badge">{BUILT_IN_KEYS.has(p.key) ? 'Edited' : 'Custom'}</span>}</div>
                    <div className="lib-sub">{p.manufacturer}{p.physical.rackUnits ? ` · ${p.physical.rackUnits}U` : ''} · {p.ports.length} {p.ports.length === 1 ? "port" : "ports"}</div>
                  </div>
                  <div className="lib-dots">{[...productDomains(p)].map((d) => <Dot key={d} color={DOMAINS[d].color} />)}</div>
                  <div className="lib-actions">
                    <button className="mini" onClick={(e) => { e.stopPropagation(); openProductEditor(p) }} title={p.source === 'builtIn' ? 'Edit this product (saved as your version; revert any time)' : 'Edit product'}>Edit</button>
                    {p.source === 'builtIn' && <button className="mini" onClick={(e) => { e.stopPropagation(); duplicateProduct(p) }} title="Duplicate as a new custom product">Duplicate</button>}
                    {p.source === 'user' && <button className="mini danger" onClick={(e) => { e.stopPropagation(); void removeUserProduct(p) }} title={BUILT_IN_KEYS.has(p.key) ? 'Discard your edits and go back to the built-in version' : 'Delete custom product'}>{BUILT_IN_KEYS.has(p.key) ? 'Revert' : 'Delete'}</button>}
                  </div>
                </div>
              ))}
              {!isCollapsed && items.length > shown.length && (
                <button className="link show-all" onClick={() => setExpanded(toggle(expanded, cat))}>Show all {items.length}</button>
              )}
              {!isCollapsed && expanded.has(cat) && items.length > cap && (
                <button className="link show-all" onClick={() => setExpanded(toggle(expanded, cat))}>Show fewer</button>
              )}
            </section>
          )})}
          </>
        ) : (
          tmplGroups.map(([mfr, items]) => (
            <section key={mfr}>
              <h4>{mfr}</h4>
              {items.map((t) => (
                <div key={t.key} className="lib-item" draggable onDragStart={(e) => drag(e, { kind: 'patch', key: t.key })} onDoubleClick={() => addBayToProject(t)} title="Double-click to add to the project, or drag onto the diagram">
                  <div className="lib-main">
                    <div className="lib-title">{t.series}{!t.dimensionsVerified && <span className="badge warn" title="Nominal dimensions – verify before printing">nominal</span>}</div>
                    <div className="lib-sub">{totalChannels(t)} pts · {FORMATS[t.format].name} · {t.rackUnits}RU</div>
                  </div>
                  <div className="lib-actions">
                    <button className="mini primary" onClick={() => addBayToProject(t)}>Add</button>
                    <button className="mini" onClick={() => set({ editingTemplate: { ...structuredClone(t), key: t.source === 'user' ? t.key : `user.${t.key}.${Date.now().toString(36)}`, source: 'user', manufacturer: t.manufacturer === 'Generic' ? 'Custom' : t.manufacturer } })}>
                      {t.source === 'user' ? 'Edit' : 'Customize'}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <button className="primary" onClick={() => (tab === 'gear' ? set({ editingProduct: newCustomProduct() }) : set({ editingTemplate: newCustomTemplate() }))}>
          + {tab === 'gear' ? 'New Custom Product' : 'New Patch Bay Template'}
        </button>
        {tab === 'gear' && (
          <div className="foot-row">
            <button onClick={() => set({ editingPlate: { product: makePlateProduct(newPlateSpec('wallPlate'), { model: 'Wall Plate' }), instanceId: null } })}>+ Wall Plate</button>
            <button onClick={() => set({ editingPlate: { product: makePlateProduct(newPlateSpec('floorBox'), { model: 'Floor Box' }), instanceId: null } })}>+ Floor Box</button>
          </div>
        )}
      </div>
      </>}
    </aside>
  )
}

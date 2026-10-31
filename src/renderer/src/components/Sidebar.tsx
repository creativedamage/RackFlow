import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AccessoryKind, EquipmentId, EquipmentInstance } from '@core/index'
import {
  BUILT_IN_KEYS, viewMembers, viewsOf, makePlateProduct, newPlateSpec, CATEGORIES, CATEGORY_KEYS, DOMAINS, FORMATS, addRack, groupsOf, newCustomProduct, newCustomTemplate, productDomains, templateName, totalChannels,
  type EquipmentCategory, type ProductDefinition, type SignalDomain, panelDescription } from '@core/index'
import { useStore } from '../store'
import { Select } from './ui'
import { MakersBrowser } from './MakersBrowser'
import { addBayToProject } from '../patch/addBay'
import { addProductToDiagram } from '../diagram/placement'
import { showContextMenu } from './ContextMenu'
import { openProductEditor } from '../product/openEditor'
import { duplicateProduct, productMenu, removeUserProduct } from '../product/productActions'

export const DRAG_MIME = 'application/x-rackflow'
export type DragPayload = { kind: 'product'; key: string } | { kind: 'patch'; key: string } | { kind: 'rack-eq'; id: string }
  | { kind: 'rack-acc'; acc: AccessoryKind; height: number } | { kind: 'rack-acc-move'; rack: string; id: string }

type Tab = 'catalog' | 'inventory' | 'makers' | 'patch'
const TITLES: Record<Tab, string> = { catalog: 'Device catalog', inventory: 'Inventory', makers: 'Manufacturers', patch: 'Patch bays' }
const CHIPS: SignalDomain[] = ['audio', 'video', 'lighting', 'network', 'control', 'power']
const PAGE = 120

const primaryColor = (p: ProductDefinition) => { const d = [...productDomains(p)][0]; return d ? DOMAINS[d].color : '#9aa0a6' }
const drag = (e: React.DragEvent, payload: DragPayload) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy' }

/**
 * Library: Device catalog (search, signal chips, builder cards, flat list),
 * Inventory (what's in this project), Makers and Patch Bays.
 */
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('catalog')
  const [query, setQuery] = useState('')
  const placeholder = { catalog: 'Search devices, makers, models…', inventory: 'Search tags, models, rooms…', makers: 'Search manufacturers or product lines…', patch: 'Search patch bays…' }[tab]
  const count = useStore((s) => s.project.equipment.length)
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="lib-heading"><span className="eyebrow">Library</span><h2>{TITLES[tab]}</h2></div>
        <div className="lib-tabs" role="tablist">
          {([['catalog', 'Catalog'], ['inventory', `Inventory${count ? ` ${count}` : ''}`], ['makers', 'Makers'], ['patch', 'Patch Bays']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <input className="search" type="search" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {tab === 'catalog' && <Catalog query={query} onPatch={() => setTab('patch')} />}
      {tab === 'inventory' && <Inventory query={query} />}
      {tab === 'makers' && <MakersBrowser query={query} />}
      {tab === 'patch' && <PatchBays query={query} />}
    </aside>
  )
}

function Builder({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="builder-card" onClick={onClick} title={sub}>
      <span className="builder-icon">{icon}</span>
      <span className="builder-text"><b>{title}</b><span>{sub}</span></span>
    </button>
  )
}

function Catalog({ query, onPatch }: { query: string; onPatch: () => void }) {
  const library = useStore((s) => s.library)
  const set = useStore((s) => s.set)
  const apply = useStore((s) => s.apply)
  const [domain, setDomain] = useState<SignalDomain | ''>('')
  const [category, setCategory] = useState<EquipmentCategory | '' | 'mine'>('')
  const [limit, setLimit] = useState(PAGE)
  const [showBuilders, setShowBuilders] = useState(true)
  const results = useMemo(() => {
    const hits = library.search({ text: query, category: category === 'mine' ? null : category || null, domain: domain || null })
    const list = category === 'mine' ? hits.filter((p) => p.source === 'user') : hits
    // Search results keep their relevance order; browsing is alphabetical by maker, then model.
    return query.trim() ? list : [...list].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model))
  }, [library, query, category, domain])
  useEffect(() => setLimit(PAGE), [query, category, domain])
  // Load more as the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) setLimit((l) => l + PAGE) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [results, limit])
  const shown = results.slice(0, limit)

  return (<>
    <div className="lib-chips">
      <button className={domain === '' && category !== 'mine' ? 'on' : ''} onClick={() => { setDomain(''); if (category === 'mine') setCategory('') }}>All</button>
      {CHIPS.map((d) => (
        <button key={d} className={domain === d ? 'on' : ''} onClick={() => setDomain(domain === d ? '' : d)}>
          <span className="dot" style={{ background: DOMAINS[d].color }} />{DOMAINS[d].name}
        </button>
      ))}
      <button className={category === 'mine' ? 'on' : ''} onClick={() => setCategory(category === 'mine' ? '' : 'mine')} title="Your custom and edited devices">★ Mine</button>
    </div>
    <div className="sidebar-list">
      {!query.trim() && (
        <section className="builders">
          <h4 className="lib-cat" onClick={() => setShowBuilders(!showBuilders)}><span className={`disclosure ${showBuilders ? 'open' : ''}`}>▸</span>Build</h4>
          {showBuilders && (<>
            <div className="builder-grid">
              <Builder icon="＋" title="Custom device" sub="Blank device – add ports" onClick={() => set({ editingProduct: newCustomProduct() })} />
              <Builder icon="🔍" title="Find device" sub="From maker site or specs" onClick={() => set({ finding: { query } })} />
              <Builder icon={<span className="led-icon" />} title="LED wall" sub="Panels, data & power map" onClick={() => set({ mode: 'led', ledPicking: true })} />
              <Builder icon="▭" title="Wall plate" sub="Custom connector plate" onClick={() => set({ editingPlate: { product: makePlateProduct(newPlateSpec('wallPlate'), { model: 'Wall Plate' }), instanceId: null } })} />
              <Builder icon="▣" title="Floor box" sub="Floor pocket / stage box" onClick={() => set({ editingPlate: { product: makePlateProduct(newPlateSpec('floorBox'), { model: 'Floor Box' }), instanceId: null } })} />
            </div>
            <h5 className="builder-sub">Utilities</h5>
            <div className="builder-grid">
              <Builder icon="▤" title="Rack" sub="Add a 42U rack" onClick={() => { apply('Add Rack', (d) => { addRack(d) }); set({ mode: 'rack' }) }} />
              <Builder icon="⋮⋮" title="Patch bay" sub="Audio, video, RJ45" onClick={onPatch} />
            </div>
          </>)}
        </section>
      )}
      <div className="lib-count-row">
        <span className="muted">{results.length.toLocaleString()} device{results.length === 1 ? '' : 's'}</span>
        <Select value={category === 'mine' ? '' : category} width={130} onChange={setCategory}
          options={[{ value: '', label: 'All categories' }, ...CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORIES[c].name }))]} />
      </div>
      {results.length === 0 && (
        <div className="pad"><p className="muted">No devices match.</p>
          {query.trim() && <button className="primary" onClick={() => set({ finding: { query } })}>Build “{query.trim()}” from its specs…</button>}
        </div>
      )}
      {shown.map((p) => (
        <div key={p.key} className="lib-row" draggable onDragStart={(e) => drag(e, { kind: 'product', key: p.key })} onDoubleClick={() => addProductToDiagram(p)}
          onContextMenu={(e) => showContextMenu(e, productMenu(p))} title={`${p.manufacturer} ${p.model}\n${p.summary ?? ''}\nDouble-click to add to the Wiring Diagram, or drag it where you want it. Right-click for more.`}>
          <span className="dot" style={{ background: primaryColor(p) }} />
          <div className="lib-main">
            <div className="lib-title">{p.model}{p.source === 'user' && <span className="badge">{BUILT_IN_KEYS.has(p.key) ? 'Edited' : 'Custom'}</span>}</div>
            <div className="lib-sub">{p.manufacturer} · {CATEGORIES[p.category]?.name ?? p.category}{p.physical.rackUnits ? ` · ${p.physical.rackUnits}U` : ''}</div>
          </div>
          <div className="lib-actions">
            <button className="mini" onClick={(e) => { e.stopPropagation(); openProductEditor(p) }} title={p.source === 'builtIn' ? 'Edit this product (saved as your version; revert any time)' : 'Edit product'}>Edit</button>
            {p.source === 'builtIn' && <button className="mini" onClick={(e) => { e.stopPropagation(); duplicateProduct(p) }} title="Duplicate as a new custom product">Dup</button>}
            {p.source === 'user' && <button className="mini danger" onClick={(e) => { e.stopPropagation(); void removeUserProduct(p) }} title={BUILT_IN_KEYS.has(p.key) ? 'Discard your edits and go back to the built-in version' : 'Delete custom product'}>{BUILT_IN_KEYS.has(p.key) ? 'Revert' : 'Delete'}</button>}
          </div>
        </div>
      ))}
      {results.length > shown.length && <div ref={sentinel} className="lib-more"><button className="link" onClick={() => setLimit((l) => l + PAGE)}>Show more ({(results.length - shown.length).toLocaleString()})</button></div>}
    </div>
  </>)
}

/** Everything placed in this project – click to find it on the diagram. */
function Inventory({ query }: { query: string }) {
  const equipment = useStore((s) => s.project.equipment)
  const groups = useStore((s) => s.project.groups)
  const selection = useStore((s) => s.selection)
  const pages = useMemo(() => new Map(groupsOf({ groups } as never).map((g) => [g.id, g.name])), [groups])
  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return equipment
      .filter((e) => { const hay = `${e.tag} ${e.product.manufacturer} ${e.product.model} ${e.room} ${CATEGORIES[e.product.category]?.name ?? ''} ${e.groupId ? pages.get(e.groupId) ?? '' : ''}`.toLowerCase(); return words.every((w) => hay.includes(w)) })
      .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
  }, [equipment, query, pages])
  const locate = (e: EquipmentInstance) => {
    const s = useStore.getState()
    const patch: Partial<typeof s> = { selection: [e.id as EquipmentId], selectedCable: null, selectedAccessory: null }
    if (s.mode === 'diagram' && s.diagramPage && s.diagramPage !== e.groupId) patch.diagramPage = e.groupId ?? null
    const view = s.diagramView ? viewsOf(s.project).find((v) => v.id === s.diagramView) : undefined
    if (view && !viewMembers(s.project, view).some((x) => x.id === e.id)) patch.diagramView = null
    s.set(patch)
    if (s.mode === 'diagram') window.dispatchEvent(new CustomEvent('diagram:locate', { detail: e.id }))
  }
  if (!equipment.length) return <div className="sidebar-list"><div className="pad"><p className="muted">Nothing in this project yet. Add devices from the Catalog.</p></div></div>
  return (
    <div className="sidebar-list">
      <div className="lib-count-row"><span className="muted">{list.length} of {equipment.length} device{equipment.length === 1 ? '' : 's'} in this project</span></div>
      {list.map((e) => (
        <div key={e.id} className={`lib-row clickable ${selection.includes(e.id) ? 'on' : ''}`} onClick={() => locate(e)} draggable={!e.rackPlacement}
          onDragStart={(ev) => drag(ev, { kind: 'rack-eq', id: e.id })} title="Click to select and show it on the Wiring Diagram">
          <span className="dot" style={{ background: primaryColor(e.product) }} />
          <div className="lib-main">
            <div className="lib-title"><span className="inv-tag">{e.tag}</span>{e.product.model}</div>
            <div className="lib-sub">{e.product.manufacturer} · {CATEGORIES[e.product.category]?.name ?? e.product.category}{e.room ? ` · ${e.room}` : ''}{e.groupId && pages.get(e.groupId) ? ` · ${pages.get(e.groupId)}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PatchBays({ query }: { query: string }) {
  const templates = useStore((s) => s.templates)
  const set = useStore((s) => s.set)
  const groups = useMemo(() => {
    const q = query.toLowerCase()
    const m = new Map<string, typeof templates>()
    for (const t of templates) {
      const hay = `${templateName(t)} ${FORMATS[t.format].name} ${t.cableCategory ?? ''} ${t.termination ?? ''} ${t.termination ? 'patch panel network ethernet' : ''}`.toLowerCase()
      if (q && !q.split(/\s+/).every((w) => hay.includes(w))) continue
      m.set(t.manufacturer, [...(m.get(t.manufacturer) ?? []), t])
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'Generic' ? -1 : b[0] === 'Generic' ? 1 : a[0].localeCompare(b[0])))
  }, [templates, query])
  return (<>
    <div className="sidebar-list">
      {groups.map(([mfr, items]) => (
        <section key={mfr}>
          <h4>{mfr}</h4>
          {items.map((t) => (
            <div key={t.key} className="lib-item" draggable onDragStart={(e) => drag(e, { kind: 'patch', key: t.key })} onDoubleClick={() => addBayToProject(t)} title="Double-click to add to the project, or drag onto the diagram">
              <div className="lib-main">
                <div className="lib-title">{t.series}{!t.dimensionsVerified && <span className="badge warn" title="Nominal dimensions – verify before printing">nominal</span>}</div>
                <div className="lib-sub">{totalChannels(t)} {t.termination && t.termination !== 'rearOnly' ? 'ports' : 'pts'} · {panelDescription(t) || FORMATS[t.format].name} · {t.rackUnits}RU</div>
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
      ))}
    </div>
    <div className="sidebar-foot">
      <button className="primary" onClick={() => set({ editingTemplate: newCustomTemplate() })}>+ New Patch Bay Template</button>
    </div>
  </>)
}

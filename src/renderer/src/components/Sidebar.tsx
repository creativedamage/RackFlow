import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccessoryKind, EquipmentId, EquipmentInstance, PatchBayTemplate } from '@core/index'
import {
  BUILT_IN_KEYS, viewMembers, viewsOf, makeFiberProduct, newFiberSpec, makePlateProduct, newPlateSpec, CATEGORIES, CATEGORY_KEYS, DOMAINS, FORMATS, addRack, groupsOf, newCustomProduct, newCustomTemplate, productDomains, templateName, totalChannels,
  type EquipmentCategory, type PlateKind, type ProductDefinition, type SignalDomain, panelDescription } from '@core/index'
import { useStore } from '../store'
import { SidebarButton } from '../panels'
import { addBayToProject } from '../patch/addBay'
import { addProductToDiagram } from '../diagram/placement'
import { showContextMenu } from './ContextMenu'
import { openProductEditor } from '../product/openEditor'
import { duplicateProduct, productMenu, removeUserProduct } from '../product/productActions'

export const DRAG_MIME = 'application/x-rackflow'
export type DragPayload = { kind: 'product'; key: string } | { kind: 'patch'; key: string } | { kind: 'rack-eq'; id: string } | { kind: 'rack-eq-multi'; ids: string[]; anchor: string }
  | { kind: 'rack-acc'; acc: AccessoryKind; height: number } | { kind: 'rack-acc-move'; rack: string; id: string }

/** What the list shows. */
type Show = 'devices' | 'patch' | 'plates' | 'project' | 'mine'
const SHOW: { value: Show; label: string }[] = [
  { value: 'devices', label: 'All devices' },
  { value: 'project', label: 'In this project' },
  { value: 'patch', label: 'Patch bays & panels' },
  { value: 'plates', label: 'Wall boxes, plates, panels & fiber' },
  { value: 'mine', label: '★ My custom & edited' },
]
const PLATE_CATS = new Set<EquipmentCategory>(['wallBox', 'wallPlate', 'floorBox', 'connectorPanel', 'fiberEnclosure'])
const PAGE = 120

const primaryColor = (p: ProductDefinition) => { const d = [...productDomains(p)][0]; return d ? DOMAINS[d].color : '#9aa0a6' }
const drag = (e: React.DragEvent, payload: DragPayload) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'copy' }
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const plate = (kind: PlateKind, model: string) => useStore.getState().set({ editingPlate: { product: makePlateProduct(newPlateSpec(kind), { model }), instanceId: null } })

/**
 * The Library – one place for everything: search, then narrow with the
 * dropdowns (what to show, maker, category, signal). ＋ New makes custom
 * devices, plates, panels, LED walls, patch bays and racks.
 */
export function Sidebar({ peek = false }: { peek?: boolean } = {}) {
  const library = useStore((s) => s.library)
  const templates = useStore((s) => s.templates)
  const equipment = useStore((s) => s.project.equipment)
  const set = useStore((s) => s.set)
  const apply = useStore((s) => s.apply)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('devices')
  const [maker, setMaker] = useState('')
  const [category, setCategory] = useState<EquipmentCategory | ''>('')
  const [domain, setDomain] = useState<SignalDomain | ''>('')
  const [limit, setLimit] = useState(PAGE)

  const makers = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of library.products) m.set(p.manufacturer, (m.get(p.manufacturer) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [library])

  // Products (all / mine / plates)
  const products = useMemo(() => {
    if (show === 'project' || show === 'patch') return []
    let hits = library.search({ text: query, category: category || null, domain: domain || null })
    if (maker) hits = hits.filter((p) => p.manufacturer === maker)
    if (show === 'mine') hits = hits.filter((p) => p.source === 'user')
    if (show === 'plates') hits = hits.filter((p) => PLATE_CATS.has(p.category))
    return query.trim() ? hits : [...hits].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model))
  }, [library, query, category, domain, maker, show])

  // Patch bay templates
  const bays = useMemo(() => {
    if (show !== 'patch') return []
    const words = fold(query).split(/\s+/).filter(Boolean)
    return templates.filter((t) => {
      if (maker && t.manufacturer !== maker) return false
      const hay = fold(`${t.manufacturer} ${templateName(t)} ${FORMATS[t.format].name} ${t.cableCategory ?? ''} ${t.termination ?? ''} ${t.termination ? 'patch panel network ethernet rj45' : ''}`)
      return words.every((w) => hay.includes(w))
    }).sort((a, b) => (a.manufacturer === 'Generic' ? -1 : b.manufacturer === 'Generic' ? 1 : a.manufacturer.localeCompare(b.manufacturer)) || a.series.localeCompare(b.series))
  }, [templates, query, maker, show])

  // In this project
  const groups = useStore((s) => s.project.groups)
  const pages = useMemo(() => new Map(groupsOf({ groups } as never).map((g) => [g.id, g.name])), [groups])
  const placed = useMemo(() => {
    if (show !== 'project') return []
    const words = fold(query).split(/\s+/).filter(Boolean)
    return equipment.filter((e) => {
      if (maker && e.product.manufacturer !== maker) return false
      if (category && e.product.category !== category) return false
      if (domain && !productDomains(e.product).has(domain)) return false
      const hay = fold(`${e.tag} ${e.product.manufacturer} ${e.product.model} ${e.room} ${CATEGORIES[e.product.category]?.name ?? ''} ${e.groupId ? pages.get(e.groupId) ?? '' : ''}`)
      return words.every((w) => hay.includes(w))
    }).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
  }, [equipment, query, maker, category, domain, show, pages])

  useEffect(() => setLimit(PAGE), [query, category, domain, maker, show])
  const total = show === 'project' ? placed.length : show === 'patch' ? bays.length : products.length
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) setLimit((l) => l + PAGE) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [total, limit])

  const newMenu = (e: React.MouseEvent) => showContextMenu(e, [
    { label: 'Custom Device…', hint: 'blank, add ports', onClick: () => set({ editingProduct: newCustomProduct() }) },
    { label: 'Find Device…', hint: '⇧⌘F', onClick: () => set({ finding: { query } }) },
    'sep',
    { label: 'Wall Box…', hint: 'Redco-style panels', onClick: () => plate('wallBox', 'Wall Box') },
    { label: 'Wall Plate (gang)…', onClick: () => plate('wallPlate', 'Wall Plate') },
    { label: 'Floor Box / Stage Pocket…', onClick: () => plate('floorBox', 'Floor Box') },
    { label: 'Rack Connector Panel…', onClick: () => plate('rackPanel', 'Connector Panel') },
    { label: 'Fiber Enclosure (modular)…', hint: 'cassettes + engraving', onClick: () => useStore.getState().set({ editingPlate: { product: makeFiberProduct(newFiberSpec('fhd-1u'), { model: '' }), instanceId: null } }) },
    'sep',
    { label: 'Patch Bay Template…', onClick: () => set({ editingTemplate: newCustomTemplate() }) },
    { label: 'LED Wall…', onClick: () => set({ mode: 'led', ledPicking: true }) },
    { label: 'Rack (42U)', onClick: () => { apply('Add Rack', (d) => { addRack(d) }); set({ mode: 'rack' }) } },
  ])
  const filtered = !!(maker || category || domain || query.trim())

  return (
    <aside className={`sidebar ${peek ? 'peek' : ''}`}>
      <div className="sb-drag"><SidebarButton /></div>
      <div className="sidebar-head">
        <div className="lib-heading-row">
          <h2>Library</h2>
          <button className="primary mini" onClick={newMenu} title="Custom device, wall plate, floor box, rack panel, patch bay, LED wall, rack">＋ New ▾</button>
        </div>
        <input className="search" type="search" placeholder="Search devices, makers, models, tags…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="lib-filters">
          <select value={show} onChange={(e) => setShow(e.target.value as Show)} title="What to list">
            {SHOW.map((s) => <option key={s.value} value={s.value}>{s.label}{s.value === 'project' ? ` (${equipment.length})` : ''}</option>)}
          </select>
          <select value={maker} onChange={(e) => setMaker(e.target.value)} title="Manufacturer">
            <option value="">All makers</option>
            {(show === 'patch' ? [...new Set(templates.map((t) => t.manufacturer))].sort().map((m) => [m, templates.filter((t) => t.manufacturer === m).length] as const) : makers).map(([m, n]) => <option key={m} value={m}>{m} ({n})</option>)}
          </select>
          {show !== 'patch' && (<>
            <select value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory | '')} title="Category">
              <option value="">All categories</option>
              {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORIES[c].name}</option>)}
            </select>
            <select value={domain} onChange={(e) => setDomain(e.target.value as SignalDomain | '')} title="Signal type">
              <option value="">All signals</option>
              {(Object.keys(DOMAINS) as SignalDomain[]).map((d) => <option key={d} value={d}>{DOMAINS[d].name}</option>)}
            </select>
          </>)}
        </div>
      </div>
      <div className="sidebar-list">
        <div className="lib-count-row">
          <span className="muted">{total.toLocaleString()} {show === 'patch' ? `patch bay${total === 1 ? '' : 's'}` : show === 'project' ? `in this project` : `device${total === 1 ? '' : 's'}`}</span>
          {filtered && <button className="link small" onClick={() => { setQuery(''); setMaker(''); setCategory(''); setDomain('') }}>Clear filters</button>}
        </div>
        {total === 0 && (
          <div className="pad"><p className="muted">{show === 'project' ? 'Nothing in this project matches.' : 'Nothing matches.'}</p>
            {query.trim() && show !== 'project' && <button className="primary" onClick={() => set({ finding: { query } })}>Build “{query.trim()}” from its specs…</button>}
          </div>
        )}
        {show === 'project' ? placed.slice(0, limit).map((e) => <PlacedRow key={e.id} e={e} page={e.groupId ? pages.get(e.groupId) : undefined} />)
          : show === 'patch' ? bays.slice(0, limit).map((t) => <BayRow key={t.key} t={t} />)
          : products.slice(0, limit).map((p) => <ProductRow key={p.key} p={p} />)}
        {total > limit && <div ref={sentinel} className="lib-more"><button className="link" onClick={() => setLimit((l) => l + PAGE)}>Show more ({(total - limit).toLocaleString()})</button></div>}
      </div>
    </aside>
  )
}

function ProductRow({ p }: { p: ProductDefinition }) {
  return (
    <div className="lib-row" draggable onDragStart={(e) => drag(e, { kind: 'product', key: p.key })} onDoubleClick={() => addProductToDiagram(p)}
      onContextMenu={(e) => showContextMenu(e, productMenu(p))} title={`${p.manufacturer} ${p.model}\n${p.summary ?? ''}\nDouble-click to add to the Wiring Diagram, or drag it where you want it. Right-click for more.`}>
      <span className="dot" style={{ background: primaryColor(p) }} />
      <div className="lib-main">
        <div className="lib-title">{p.model}{p.source === 'user' && <span className="badge">{BUILT_IN_KEYS.has(p.key) ? 'Edited' : 'Custom'}</span>}</div>
        <div className="lib-sub">{p.manufacturer} · {CATEGORIES[p.category]?.name ?? p.category}{p.physical.rackUnits ? ` · ${p.physical.rackUnits}U` : ''}</div>
      </div>
      <div className="lib-actions">
        <button className="mini" onClick={(e) => { e.stopPropagation(); openProductEditor(p) }} title={p.plate ? 'Open in the plate designer' : p.source === 'builtIn' ? 'Edit this product (saved as your version; revert any time)' : 'Edit product'}>{p.plate ? 'Design' : 'Edit'}</button>
        {p.source === 'builtIn' && <button className="mini" onClick={(e) => { e.stopPropagation(); duplicateProduct(p) }} title="Duplicate as a new custom product">Dup</button>}
        {p.source === 'user' && <button className="mini danger" onClick={(e) => { e.stopPropagation(); void removeUserProduct(p) }} title={BUILT_IN_KEYS.has(p.key) ? 'Discard your edits and go back to the built-in version' : 'Delete custom product'}>{BUILT_IN_KEYS.has(p.key) ? 'Revert' : 'Delete'}</button>}
      </div>
    </div>
  )
}

function BayRow({ t }: { t: PatchBayTemplate }) {
  const set = useStore((s) => s.set)
  return (
    <div className="lib-row" draggable onDragStart={(e) => drag(e, { kind: 'patch', key: t.key })} onDoubleClick={() => addBayToProject(t)} title="Double-click to add to the project, or drag onto the diagram">
      <span className="dot" style={{ background: t.termination ? DOMAINS.network.color : t.format.startsWith('bnc') || /video|sdi/i.test(t.format) ? DOMAINS.video.color : DOMAINS.audio.color }} />
      <div className="lib-main">
        <div className="lib-title">{t.series}{!t.dimensionsVerified && <span className="badge warn" title="Nominal dimensions – verify before printing">nominal</span>}</div>
        <div className="lib-sub">{t.manufacturer} · {totalChannels(t)} {t.termination && t.termination !== 'rearOnly' ? 'ports' : 'pts'} · {panelDescription(t) || FORMATS[t.format].name} · {t.rackUnits}RU</div>
      </div>
      <div className="lib-actions">
        <button className="mini primary" onClick={(e) => { e.stopPropagation(); addBayToProject(t) }}>Add</button>
        <button className="mini" onClick={(e) => { e.stopPropagation(); set({ editingTemplate: { ...structuredClone(t), key: t.source === 'user' ? t.key : `user.${t.key}.${Date.now().toString(36)}`, source: 'user', manufacturer: t.manufacturer === 'Generic' ? 'Custom' : t.manufacturer } }) }}>
          {t.source === 'user' ? 'Edit' : 'Customize'}
        </button>
      </div>
    </div>
  )
}

/** A device already in the project – click to find it on the diagram. */
function PlacedRow({ e, page }: { e: EquipmentInstance; page?: string }) {
  const selected = useStore((s) => s.selection.includes(e.id))
  const locate = () => {
    const s = useStore.getState()
    const patch: Partial<typeof s> = { selection: [e.id as EquipmentId], selectedCable: null, selectedAccessory: null }
    if (s.mode === 'diagram' && s.diagramPage && s.diagramPage !== e.groupId) patch.diagramPage = e.groupId ?? null
    const view = s.diagramView ? viewsOf(s.project).find((v) => v.id === s.diagramView) : undefined
    if (view && !viewMembers(s.project, view).some((x) => x.id === e.id)) patch.diagramView = null
    s.set(patch)
    if (s.mode === 'diagram') window.dispatchEvent(new CustomEvent('diagram:locate', { detail: e.id }))
  }
  return (
    <div className={`lib-row clickable ${selected ? 'on' : ''}`} onClick={locate} draggable={!e.rackPlacement}
      onDragStart={(ev) => drag(ev, { kind: 'rack-eq', id: e.id })} title="Click to select and show it on the Wiring Diagram">
      <span className="dot" style={{ background: primaryColor(e.product) }} />
      <div className="lib-main">
        <div className="lib-title"><span className="inv-tag">{e.tag}</span>{e.product.model}</div>
        <div className="lib-sub">{e.product.manufacturer} · {CATEGORIES[e.product.category]?.name ?? e.product.category}{e.room ? ` · ${e.room}` : ''}{page ? ` · ${page}` : ''}</div>
      </div>
    </div>
  )
}

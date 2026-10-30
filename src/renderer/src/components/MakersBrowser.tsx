import { useMemo, useState } from 'react'
import {
  BUILT_IN_KEYS, CATEGORIES, DOMAINS, MAKER_CATEGORIES, newCustomProduct, productDomains,
  type EquipmentCategory, type MakerCategory, type ProductDefinition,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Dot, Select } from './ui'
import { DRAG_MIME } from './Sidebar'
import { addProductToDiagram } from '../diagram/placement'
import { showContextMenu } from './ContextMenu'
import { openProductEditor } from '../product/openEditor'
import { productMenu, removeUserProduct } from '../product/productActions'

/** Sidebar "Makers" tab: browse 350+ manufacturers, see their products, add products or new makers. */
export function MakersBrowser({ query }: { query: string }) {
  const makers = useStore((s) => s.makers)
  const library = useStore((s) => s.library)
  const set = useStore((s) => s.set)
  const notify = useStore((s) => s.notify)
  const [cat, setCat] = useState<MakerCategory | ''>('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ name: string; cat: MakerCategory } | null>(null)

  const byMaker = useMemo(() => {
    const m = new Map<string, ProductDefinition[]>()
    for (const p of library.products) {
      const k = makers.resolve(p.manufacturer)?.maker.name ?? p.manufacturer
      const a = m.get(k); if (a) a.push(p); else m.set(k, [p])
    }
    return m
  }, [library, makers])

  const results = useMemo(() => makers.search(query, cat || null), [makers, query, cat])

  const newProduct = (maker: string, categories: MakerCategory[]) => {
    const p = newCustomProduct()
    p.manufacturer = maker
    const guess: Record<string, ProductDefinition['category']> = { audio: 'mixer', video: 'videoSwitcher', broadcast: 'videoSwitcher', lighting: 'lightingFixture', display: 'display', network: 'networkSwitch', control: 'controlProcessor', power: 'pdu', conferencing: 'controlProcessor' }
    const c = categories[0]
    if (c && guess[c]) p.category = guess[c]
    set({ editingProduct: p })
  }

  const saveMaker = async () => {
    if (!adding) return
    const name = adding.name.trim()
    if (!name) return
    const existing = makers.get(name) ?? makers.resolve(name)?.maker
    if (existing) { notify(`${existing.name} is already listed`); setOpen(existing.name); setAdding(null); return }
    await api.saveUserManufacturer({ name, categories: [adding.cat], aliases: [], source: 'user' })
    await useStore.getState().reloadLibrary()
    notify(`Added ${name}`)
    setOpen(name)
    setAdding(null)
  }

  return (
    <>
      <div className="makers-filter">
        <Select value={cat} onChange={setCat} options={[{ value: '', label: `All categories (${makers.all.length})` }, ...(Object.keys(MAKER_CATEGORIES) as MakerCategory[]).map((c) => ({ value: c, label: MAKER_CATEGORIES[c] }))]} />
      </div>
      <div className="sidebar-list">
        {results.length === 0 && (
          <div className="pad">
            <p className="muted">No manufacturer matches “{query}”.</p>
            {query.trim() && <button className="primary" onClick={() => setAdding({ name: query.trim(), cat: cat || 'audio' })}>+ Add “{query.trim()}”</button>}
          </div>
        )}
        {results.map(({ maker, via }) => {
          const products = byMaker.get(maker.name) ?? []
          const isOpen = open === maker.name
          return (
            <div key={maker.name} className={`maker-row ${isOpen ? 'open' : ''}`}>
              <button className="maker-head" onClick={() => setOpen(isOpen ? null : maker.name)}>
                <span className="caret">{isOpen ? '▾' : '▸'}</span>
                <span className="maker-name">{maker.name}{maker.source === 'user' && <span className="badge">Yours</span>}</span>
                {products.length > 0 && <span className="count-pill">{products.length}</span>}
              </button>
              {(via || !isOpen) && (
                <div className="maker-sub">{via ? `${via} · ` : ''}{maker.categories.map((c) => MAKER_CATEGORIES[c]).slice(0, 3).join(' · ')}</div>
              )}
              {isOpen && (
                <div className="maker-body">
                  {maker.aliases.length > 0 && <div className="maker-lines">{maker.aliases.slice(0, 8).join(' · ')}</div>}
                  {products.length === 0 && <p className="muted small">No {maker.name} products in your library yet.</p>}
                  <button className="mini primary" onClick={() => newProduct(maker.name, maker.categories)}>+ New {maker.name} product</button>
                  {groupByCategory(products).map(([c, items]) => (
                    <div key={c} className="maker-group">
                      <div className="maker-group-head">{CATEGORIES[c].name} <span className="muted">{items.length}</span></div>
                      {items.map((p) => (
                        <div key={p.key} className="lib-item compact clickable" draggable title={`${p.summary}\nClick to add to the Wiring Diagram (or drag it where you want it). Right-click for more.`}
                          onClick={() => addProductToDiagram(p)} onContextMenu={(e) => showContextMenu(e, productMenu(p))}
                          onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'product', key: p.key })); e.dataTransfer.effectAllowed = 'copy' }}>
                          <div className="lib-main"><div className="lib-title">{p.model}{p.source === 'user' && <span className="badge">{BUILT_IN_KEYS.has(p.key) ? 'Edited' : 'Custom'}</span>}</div><div className="lib-sub">{p.summary}</div></div>
                          <div className="lib-dots">{[...productDomains(p)].map((d) => <Dot key={d} color={DOMAINS[d].color} />)}</div>
                          <div className="lib-actions">
                            <button className="mini" onClick={(e) => { e.stopPropagation(); openProductEditor(p) }} title={p.source === 'builtIn' ? 'Edit this product (saved as your version; revert any time)' : 'Edit product'}>Edit</button>
                            {p.source === 'user' && <button className="mini danger" onClick={(e) => { e.stopPropagation(); void removeUserProduct(p) }} title={BUILT_IN_KEYS.has(p.key) ? 'Discard your edits and go back to the built-in version' : 'Delete custom product'}>{BUILT_IN_KEYS.has(p.key) ? 'Revert' : 'Delete'}</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="sidebar-foot">
        {adding ? (
          <div className="add-maker">
            <input autoFocus placeholder="Manufacturer name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveMaker(); if (e.key === 'Escape') setAdding(null) }} />
            <Select value={adding.cat} onChange={(c) => setAdding({ ...adding, cat: c })} options={(Object.keys(MAKER_CATEGORIES) as MakerCategory[]).map((c) => ({ value: c, label: MAKER_CATEGORIES[c] }))} />
            <div className="row"><button onClick={() => setAdding(null)}>Cancel</button><button className="primary" disabled={!adding.name.trim()} onClick={() => void saveMaker()}>Add Manufacturer</button></div>
          </div>
        ) : (
          <button className="primary" onClick={() => setAdding({ name: query.trim(), cat: cat || 'audio' })}>+ Add Manufacturer</button>
        )}
      </div>
    </>
  )
}


function groupByCategory(products: ProductDefinition[]): [EquipmentCategory, ProductDefinition[]][] {
  const m = new Map<EquipmentCategory, ProductDefinition[]>()
  for (const p of products) { const a = m.get(p.category); if (a) a.push(p); else m.set(p.category, [p]) }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

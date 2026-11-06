import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addEquipment, buildInventory, cell, COLUMN_LABELS, matchInventory, money, newCustomProduct, nodeGeom, norm, notCsvReason, placeInFreeSpace,
  rowPrice, rowQty, rowTitle, sheetCsvUrl, type ColumnKey, type InventoryLine, type InventorySheet, type ProductDefinition,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { useSettings, saveSettings } from '../settings'
import { viewCenterNow } from '../diagram/placement'

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Reads the sheet and stores a snapshot in the project (one undo step). */
export async function refreshInventory(link?: string): Promise<boolean> {
  const s = useStore.getState()
  const url = (link ?? s.project.inventory?.url ?? useSettings.getState().inventoryUrl).trim()
  if (!url) { s.set({ mode: 'inventory' }); s.notify('Paste your Google Sheet link on the Inventory page first.', { kind: 'info' }); return false }
  try {
    const text = await api.fetchSheet(sheetCsvUrl(url))
    const bad = notCsvReason(text)
    if (bad) throw new Error(bad)
    const old = s.project.inventory
    const inv = buildInventory(url, text, old && old.url === url ? old : undefined)
    if (!inv.rows.length) throw new Error('The sheet is empty (or the first tab has no rows). Copy the link while the right tab is open.')
    useStore.getState().apply('Refresh Inventory', (d) => { d.inventory = inv })
    useStore.getState().notify(`Read ${inv.rows.length.toLocaleString()} rows from the sheet`, { kind: 'success' })
    return true
  } catch (e) {
    useStore.getState().notify((e as Error).message || String(e), { kind: 'warning', ms: 9000 })
    return false
  }
}

type Scope = 'diagram' | 'review' | 'sheet'

/**
 * Inventory: what's on the diagram checked against your Google Sheet – found
 * or missing, stock and price – and sheet items you can add to the project.
 */
export function InventoryView() {
  const project = useStore((s) => s.project)
  const inv = project.inventory
  const globalUrl = useSettings((s) => s.inventoryUrl)
  const [busy, setBusy] = useState(false)
  const [scope, setScope] = useState<Scope>('diagram')
  const [q, setQ] = useState('')
  const [showCols, setShowCols] = useState(false)
  const [picked, setPicked] = useState<Map<number, number>>(new Map())

  const report = useMemo(() => matchInventory(project, inv), [project.equipment, inv])
  const review = report.lines.filter((l) => l.row == null || l.match === 'close')

  const load = async (u: string) => {
    setBusy(true)
    const ok = await refreshInventory(u)
    setBusy(false)
    // The first sheet anyone loads becomes the default for every project.
    if (ok && !useSettings.getState().inventoryUrl) saveSettings({ inventoryUrl: u.trim() })
  }
  // Opening the page with a sheet set (in Settings) but no snapshot yet: read it.
  const tried = useRef(false)
  useEffect(() => { if (!inv && globalUrl && !tried.current) { tried.current = true; void load(globalUrl) } }, [inv, globalUrl])

  const exportCsv = () => {
    const qq = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [['Status', 'Manufacturer', 'Model', 'Qty', 'In stock', 'Unit price', 'Extended'].map(qq).join(',')]
    for (const l of report.lines) lines.push([l.row == null ? 'Not in sheet' : 'In sheet', l.make, l.model, l.qty, l.stock ?? '', l.price ?? '', l.price != null ? l.price * l.qty : ''].map(qq).join(','))
    lines.push(['', '', 'Total', '', '', '', report.total].map(qq).join(','))
    void api.exportAll([{ name: `${project.info.name || 'Project'} – Inventory.csv`, kind: 'text', content: lines.join('\n') }], `${project.info.name || 'Project'} Inventory`)
  }

  if (!inv) return <Onboard busy={busy} initial={globalUrl} onLoad={(u) => void load(u)} />

  const pieces = report.lines.reduce((s, l) => s + l.qty, 0)
  return (
    <div className="inventory">
      <div className="inv-head">
        <div className="inv-src" title={inv.url}>
          <span className="inv-src-ico"><SheetIcon /></span>
          <span><b>Inventory Sheet</b><small>{inv.rows.length.toLocaleString()} rows · updated {new Date(inv.fetchedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</small></span>
        </div>
        <div className="inv-scope segmented">
          {([['diagram', 'On Diagram', report.lines.length], ['review', 'Needs Review', review.length], ['sheet', 'Sheet Only', report.unused.length]] as [Scope, string, number][]).map(([v, l, n]) => (
            <button key={v} className={scope === v ? 'on' : ''} onClick={() => setScope(v)}>{l} <span className="inv-n">{n.toLocaleString()}</span></button>
          ))}
        </div>
        <div className="inv-tools">
          <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="icon-btn" title="Columns – choose which sheet column is which" onClick={() => setShowCols(!showCols)}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3.5" width="14" height="13" rx="2" /><path d="M7.7 3.5v13M12.3 3.5v13" /></svg>
          </button>
          <button className="icon-btn" title="Read the sheet again" disabled={busy} onClick={() => void load(inv.url)}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={busy ? 'spin' : ''}><path d="M16 10a6 6 0 11-1.8-4.3" /><path d="M16 3.5V7h-3.5" /></svg>
          </button>
          <button className="icon-btn" title="Export the list with prices as CSV" disabled={!report.lines.length} onClick={exportCsv}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12.5V3" /><path d="M6.5 6.5L10 3l3.5 3.5" /><path d="M4 10.5v4.5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-4.5" /></svg>
          </button>
        </div>
      </div>
      {showCols && <ColumnPicker inv={inv} onClose={() => setShowCols(false)} />}
      <div className="inv-scroll">
        {scope !== 'sheet'
          ? <OnDiagram inv={inv} lines={scope === 'review' ? review : report.lines} q={q} empty={scope === 'review' ? 'Everything on the diagram is in your sheet.' : 'Nothing on the Wiring Diagram yet.'} />
          : <SheetOnly inv={inv} rows={report.unused} q={q} picked={picked} setPicked={setPicked} />}
      </div>
      <div className="inv-status">
        {scope === 'sheet'
          ? <><span>{picked.size ? `${picked.size} selected` : 'Select items to add them to the project'}</span><span className="spacer" />
            <button className="primary" disabled={!picked.size} onClick={() => { addFromSheet(inv, picked); setPicked(new Map()) }}>Add to Project</button></>
          : <><span>{report.lines.length} items · {pieces} pieces · <b className="ok">{report.found} in sheet</b>{report.missing > 0 && <> · <b className="warn">{report.missing} not in sheet</b></>}</span><span className="spacer" />
            <span className="inv-total">{report.priced < report.lines.length && <small>{report.priced} of {report.lines.length} priced · </small>}Total <b>{money(report.total)}</b></span></>}
      </div>
    </div>
  )
}

const SheetIcon = () => <svg viewBox="0 0 20 20" width="18" height="18"><rect x="3" y="2" width="14" height="16" rx="2" fill="#1fa463" /><path d="M6 7h8M6 10h8M6 13h8M10 7v7" stroke="#fff" strokeWidth="1.2" /></svg>

function Onboard({ busy, initial, onLoad }: { busy: boolean; initial: string; onLoad: (u: string) => void }) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => setDraft(initial), [initial])
  return (
    <div className="inventory inv-onboard">
      <div className="inv-ob">
        <div className="inv-ob-ico"><svg viewBox="0 0 20 20" width="44" height="44"><rect x="3" y="2" width="14" height="16" rx="2" fill="#1fa463" /><path d="M6 7h8M6 10h8M6 13h8M10 7v7" stroke="#fff" strokeWidth="1.1" /></svg></div>
        <h2>Connect Your Inventory</h2>
        <p>See which gear on the diagram is in your Google Sheet, what it costs and what’s in stock – and add sheet items to the project.</p>
        <form className="inv-ob-field" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onLoad(draft) }}>
          <input value={draft} autoFocus placeholder="Paste the Google Sheet link" onChange={(e) => setDraft(e.target.value)} />
          <button className="primary" type="submit" disabled={busy || !draft.trim()}>{busy ? 'Reading…' : 'Connect'}</button>
        </form>
        <p className="inv-ob-help">In Google Sheets choose <b>Share</b>, set General access to <b>Anyone with the link</b>, then <b>Copy link</b>. No sign-in or API key – RackFlow reads it like a CSV, and finds Manufacturer, Model, Price and Qty columns on its own.</p>
      </div>
    </div>
  )
}

function ColumnPicker({ inv, onClose }: { inv: InventorySheet; onClose: () => void }) {
  const apply = useStore((s) => s.apply)
  return (
    <div className="inv-cols">
      <span className="inv-cols-label">Sheet columns</span>
      {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((k) => (
        <label key={k}><span>{COLUMN_LABELS[k]}</span>
          <select value={inv.map[k] ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); apply('Inventory Columns', (d) => { if (d.inventory) d.inventory.map[k] = v }) }}>
            <option value="">None</option>
            {inv.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
          </select>
        </label>
      ))}
      <span className="spacer" />
      <button onClick={onClose}>Done</button>
    </div>
  )
}

const MATCH_LABEL: Record<InventoryLine['match'], string> = { exact: 'In sheet', model: 'In sheet', close: 'Close match', manual: 'Linked', none: 'Not in sheet' }

function OnDiagram({ inv, lines, q, empty }: { inv: InventorySheet; lines: InventoryLine[]; q: string; empty: string }) {
  const [linking, setLinking] = useState<string | null>(null)
  const words = fold(q).split(/\s+/).filter(Boolean)
  const shown = words.length ? lines.filter((l) => { const h = fold(`${l.make} ${l.model}`); return words.every((w) => h.includes(w)) }) : lines
  const locate = (l: InventoryLine) => { useStore.getState().set({ mode: 'diagram', selection: l.ids as never, selectedCable: null }); setTimeout(() => window.dispatchEvent(new CustomEvent('diagram:locate', { detail: l.ids[0] })), 60) }
  if (!lines.length) return <div className="inv-empty">{empty}</div>
  return (
    <table className="inv-table">
      <thead><tr><th style={{ width: 22 }}></th><th>Manufacturer</th><th>Model</th><th className="num">Qty</th><th className="num">In Stock</th><th className="num">Unit Price</th><th className="num">Extended</th><th>Sheet Item</th></tr></thead>
      <tbody>
        {shown.map((l) => {
          const over = l.stock != null && l.qty > l.stock
          const st = l.row == null ? 'no' : l.match === 'close' ? 'close' : 'yes'
          return (
            <tr key={l.key} onDoubleClick={() => locate(l)}>
              <td><span className={`inv-dot ${st}`} title={MATCH_LABEL[l.match]} /></td>
              <td>{l.make || <span className="muted">—</span>}</td>
              <td className="strong">{l.model}</td>
              <td className="num">{l.qty}</td>
              <td className={`num ${over ? 'inv-over' : ''}`} title={over ? `You need ${l.qty}; the sheet lists ${l.stock}` : undefined}>{l.stock ?? '—'}</td>
              <td className="num">{money(l.price)}</td>
              <td className="num">{l.price != null ? money(l.price * l.qty) : '—'}</td>
              <td className="inv-linkcell">
                <span className={l.row == null ? 'muted' : ''} title={l.row != null ? inv.rows[l.row].join(' · ') : undefined}>
                  {l.row != null ? [cell(inv, l.row, 'make'), rowTitle(inv, l.row).model].filter(Boolean).join(' ') : MATCH_LABEL[l.match]}
                  {l.match === 'close' && <em> · close match</em>}
                </span>
                <button className="link small" onClick={() => setLinking(linking === l.key ? null : l.key)}>{l.row == null ? 'Find…' : 'Change…'}</button>
                {linking === l.key && <RowPicker inv={inv} line={l} onClose={() => setLinking(null)} />}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Search the sheet and link a diagram item to a row (or say it isn't there). */
function RowPicker({ inv, line, onClose }: { inv: InventorySheet; line: InventoryLine; onClose: () => void }) {
  const [q, setQ] = useState(line.model)
  const apply = useStore((s) => s.apply)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [onClose])
  const hits = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    const out: number[] = []
    for (let i = 0; i < inv.rows.length && out.length < 30; i++) {
      const hay = fold(inv.rows[i].join(' '))
      if (words.every((w) => hay.includes(w) || norm(hay).includes(norm(w)))) out.push(i)
    }
    return out
  }, [q, inv])
  const link = (row: number | null | undefined) => {
    apply('Link Inventory Item', (d) => {
      if (!d.inventory) return
      const links = { ...(d.inventory.links ?? {}) }
      if (row === undefined) delete links[line.key]; else links[line.key] = row
      d.inventory.links = links
    })
    onClose()
  }
  return (
    <div className="inv-picker" ref={ref}>
      <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the sheet…" />
      <ul>
        {hits.map((i) => { const t = rowTitle(inv, i); return (
          <li key={i}><button onClick={() => link(i)}><b>{[t.make, t.model].filter(Boolean).join(' ')}</b><span className="muted small">{money(rowPrice(inv, i))}{rowQty(inv, i) != null ? ` · ${rowQty(inv, i)} in stock` : ''}</span></button></li>
        ) })}
        {!hits.length && <li className="muted small pad">No rows match.</li>}
      </ul>
      <div className="inv-picker-foot">
        <button className="link small" onClick={() => link(null)}>Not in the sheet</button>
        {inv.links?.[line.key] !== undefined && <button className="link small" onClick={() => link(undefined)}>Match automatically</button>}
      </div>
    </div>
  )
}

/** A library product for a sheet row, or a simple custom device made from it. */
function productFor(inv: InventorySheet, row: number): ProductDefinition {
  const { make, model } = rowTitle(inv, row)
  const lib = useStore.getState().library.products
  const md = norm(model), mk = norm(make)
  const hit = lib.find((p) => norm(p.model) === md && (!mk || norm(p.manufacturer).includes(mk) || mk.includes(norm(p.manufacturer))))
    ?? (mk ? undefined : lib.find((p) => norm(p.model) === md))
  if (hit) return hit
  const p = newCustomProduct()
  p.manufacturer = make || 'Generic'
  p.model = model
  p.summary = cell(inv, row, 'desc')
  p.ports = []
  p.physical = { ...p.physical, rackUnits: null, mounting: 'shelf' }
  return p
}

function addFromSheet(inv: InventorySheet, picked: Map<number, number>) {
  const s = useStore.getState()
  const base = viewCenterNow() ?? (() => { const xs = s.project.equipment.map((e) => e.position); return xs.length ? { x: Math.max(...xs.map((p) => p.x)) + 320, y: Math.min(...xs.map((p) => p.y)) } : { x: 0, y: 0 } })()
  let n = 0, custom = 0
  s.apply('Add from Inventory', (d) => {
    for (const [row, qty] of picked) {
      const prod = productFor(inv, row)
      if (!s.library.products.some((p) => p.key === prod.key)) custom++
      for (let k = 0; k < Math.max(1, qty); k++) {
        const e = addEquipment(d, prod, { x: base.x + n * 30, y: base.y + n * 30 })
        placeInFreeSpace(d, e.id, nodeGeom)
        n++
      }
    }
  })
  s.notify(`Added ${n} device${n === 1 ? '' : 's'} to the Wiring Diagram${custom ? ` – ${custom} not in the library, added as simple devices (add their ports with Edit)` : ''}`, { kind: 'success', undo: true, ms: 7000 })
}

function SheetOnly({ inv, rows, q, picked, setPicked }: { inv: InventorySheet; rows: number[]; q: string; picked: Map<number, number>; setPicked: (f: (m: Map<number, number>) => Map<number, number>) => void }) {
  const [limit, setLimit] = useState(300)
  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean)
    return words.length ? rows.filter((i) => { const hay = fold(inv.rows[i].join(' ')); return words.every((w) => hay.includes(w)) }) : rows
  }, [q, rows, inv])
  useEffect(() => setLimit(300), [q])
  const toggle = (i: number) => setPicked((m) => { const n = new Map(m); if (n.has(i)) n.delete(i); else n.set(i, 1); return n })
  if (!shown.length) return <div className="inv-empty">{rows.length ? 'Nothing matches.' : 'Everything in the sheet is on the diagram.'}</div>
  return (
    <>
      <table className="inv-table">
        <thead><tr><th style={{ width: 22 }}></th><th>Manufacturer</th><th>Model</th><th>Description</th><th className="num">In Stock</th><th className="num">Unit Price</th><th className="num" style={{ width: 64 }}>Add</th></tr></thead>
        <tbody>
          {shown.slice(0, limit).map((i) => {
            const t = rowTitle(inv, i)
            const on = picked.has(i)
            return (
              <tr key={i} className={on ? 'sel' : ''} onClick={(e) => { if (!(e.target as HTMLElement).closest('input')) toggle(i) }}>
                <td><input type="checkbox" checked={on} onChange={() => toggle(i)} /></td>
                <td>{t.make || <span className="muted">—</span>}</td>
                <td className="strong">{t.model}</td>
                <td className="muted inv-desc">{cell(inv, i, 'desc')}</td>
                <td className="num">{rowQty(inv, i) ?? '—'}</td>
                <td className="num">{money(rowPrice(inv, i))}</td>
                <td className="num">{on && <input type="number" min={1} value={picked.get(i)} className="inv-qty" onChange={(e) => { const v = Math.max(1, Math.round(Number(e.target.value) || 1)); setPicked((m) => new Map(m).set(i, v)) }} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown.length > limit && <div className="inv-more"><button className="link" onClick={() => setLimit((l) => l + 500)}>Show {Math.min(500, shown.length - limit).toLocaleString()} more</button></div>}
    </>
  )
}

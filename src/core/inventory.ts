// Inventory & pricing from a shared Google Sheet – no Google API or sign-in.
// A sheet shared "Anyone with the link" (or published to the web) can be read
// as CSV from docs.google.com/…/export?format=csv&gid=<tab>. The project keeps
// a snapshot, so prices show offline and print with the project.

import type { EquipmentInstance, Project } from './model'

export interface ColumnMap {
  make: number | null
  model: number | null
  price: number | null
  qty: number | null
  desc: number | null
  sku: number | null
  category: number | null
}
export type ColumnKey = keyof ColumnMap

export interface InventorySheet {
  /** The link as pasted (shown and refreshed). */
  url: string
  fetchedAt: number
  headers: string[]
  rows: string[][]
  map: ColumnMap
  /** Manual links: product key → sheet row index (null = "not in the sheet", stop guessing). */
  links?: Record<string, number | null>
}

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  make: 'Manufacturer', model: 'Model', price: 'Price', qty: 'Qty in stock', desc: 'Description', sku: 'SKU / Part #', category: 'Category',
}

// MARK: Link → CSV

/**
 * The CSV address for a Google Sheets link. Accepts the normal share link
 * (…/spreadsheets/d/<id>/edit#gid=<tab>), a published link (…/d/e/<id>/pubhtml)
 * or any direct CSV URL. Throws with a friendly message for anything else.
 */
export function sheetCsvUrl(link: string): string {
  const s = link.trim()
  if (!s) throw new Error('Paste the link to your Google Sheet.')
  let u: URL
  try { u = new URL(s) } catch { throw new Error('That isn’t a link – copy it from Share › Copy link in Google Sheets.') }
  const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get('gid') ?? null
  if (/docs\.google\.com$/.test(u.hostname) && u.pathname.includes('/spreadsheets/')) {
    // Published to the web: /spreadsheets/d/e/<pubId>/pubhtml → /pub?output=csv
    const pub = u.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/)
    if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}` : ''}&single=true`
    const id = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1]
    if (!id) throw new Error('That Google Sheets link has no sheet id in it.')
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
  }
  if (/\.csv($|\?)/i.test(u.pathname + u.search) || u.searchParams.get('output') === 'csv' || u.searchParams.get('format') === 'csv') return s
  throw new Error('Use a Google Sheets link (docs.google.com/spreadsheets/…) or a link to a .csv file.')
}

/** What a fetch that came back as a web page (not CSV) means. */
export function notCsvReason(text: string): string | null {
  const head = text.slice(0, 600).toLowerCase()
  if (!head.includes('<html') && !head.includes('<!doctype')) return null
  if (head.includes('accounts.google') || head.includes('sign in') || head.includes('servicelogin'))
    return 'Google asked to sign in – the sheet isn’t shared. In Google Sheets: Share › General access › “Anyone with the link” (Viewer), then try again.'
  return 'That link returned a web page, not the sheet. In Google Sheets use Share › Copy link (Anyone with the link can view).'
}

// MARK: CSV

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.map((r) => r.map((x) => x.trim()))
}

const HEADER_WORDS: Record<ColumnKey, RegExp> = {
  make: /^(manufacturer|mfr|mfg|make|brand|vendor|maker|manuf)\b/i,
  model: /^(model|model\s*(#|no\.?|number)|product|item|part|part\s*(#|no\.?|number)|equipment|device|name|item\s*name)$/i,
  price: /(price|cost|msrp|rate|sell|unit\s*\$|\$)/i,
  qty: /^(qty|quantity|on\s*hand|in\s*stock|stock|count|available|avail|inventory|#\s*owned|owned)/i,
  desc: /^(description|desc|details|notes?|item\s*description)$/i,
  sku: /^(sku|upc|barcode|asset|asset\s*(#|tag)|part\s*(#|no\.?|number)|p\/n|pn)$/i,
  category: /^(category|type|class|department|dept|group)$/i,
}

/** Finds the header row (the first of the top rows that names at least two known columns) and maps the columns. */
export function detectColumns(rows: string[][]): { headerRow: number; map: ColumnMap } {
  let best = { headerRow: 0, map: emptyMap(), score: -1 }
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const map = emptyMap()
    const used = new Set<number>()
    // Most specific first so "Part #" lands on SKU only when there's another model column.
    for (const key of ['make', 'price', 'qty', 'desc', 'category', 'model', 'sku'] as ColumnKey[]) {
      const i = rows[r].findIndex((h, j) => !used.has(j) && HEADER_WORDS[key].test(h.trim()))
      if (i >= 0) { map[key] = i; used.add(i) }
    }
    // Price columns like "Cost" vs "Sell": prefer one that says price/sell/msrp.
    const priceCols = rows[r].map((h, j) => [h, j] as const).filter(([h]) => HEADER_WORDS.price.test(h))
    const pref = priceCols.find(([h]) => /price|sell|msrp|rate/i.test(h))
    if (pref) map.price = pref[1]
    const score = Object.values(map).filter((x) => x != null).length
    if (score > best.score) best = { headerRow: r, map, score }
    if (score >= 3) break
  }
  // No header at all: guess model = first text column.
  if (best.score < 1) best.map.model = 0
  return { headerRow: best.headerRow, map: best.map }
}
const emptyMap = (): ColumnMap => ({ make: null, model: null, price: null, qty: null, desc: null, sku: null, category: null })

/** A sheet snapshot from CSV text. */
export function buildInventory(url: string, csv: string, keep?: Pick<InventorySheet, 'links' | 'map' | 'headers'>): InventorySheet {
  const all = parseCSV(csv)
  const { headerRow, map } = detectColumns(all)
  const headers = all[headerRow] ?? []
  const rows = all.slice(headerRow + 1).filter((r) => r.some((x) => x !== ''))
  // Keep a column mapping the user changed, if the sheet still has the same columns.
  const same = keep && keep.headers.join('\u0001') === headers.join('\u0001')
  return { url, fetchedAt: Date.now(), headers, rows, map: same ? keep!.map : map, links: keep?.links }
}

// MARK: Reading cells

export const norm = (s: string | undefined | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
export const cell = (inv: InventorySheet, row: number, key: ColumnKey) => { const c = inv.map[key]; return c == null ? '' : inv.rows[row]?.[c] ?? '' }

/** "$1,299.00" → 1299; blank or text → null. */
export function parseMoney(s: string): number | null {
  const t = s.replace(/[^0-9.,-]/g, '')
  if (!t || !/\d/.test(t)) return null
  // 1.299,00 (EU) vs 1,299.00
  const eu = /,\d{2}$/.test(t) && t.includes('.')
  const n = Number(eu ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
export const rowPrice = (inv: InventorySheet, row: number) => parseMoney(cell(inv, row, 'price'))
export function rowQty(inv: InventorySheet, row: number): number | null {
  const s = cell(inv, row, 'qty').replace(/,/g, '')
  if (!s) return null
  const n = Number(s.match(/-?\d+(\.\d+)?/)?.[0])
  return Number.isFinite(n) ? n : null
}
/** Make + model as a short title for a sheet row. */
export function rowTitle(inv: InventorySheet, row: number): { make: string; model: string } {
  const make = cell(inv, row, 'make')
  const model = cell(inv, row, 'model') || cell(inv, row, 'desc') || cell(inv, row, 'sku') || inv.rows[row]?.find((x) => x) || ''
  return { make, model }
}

// MARK: Matching

export type MatchKind = 'exact' | 'model' | 'close' | 'manual' | 'none'

export interface InventoryLine {
  /** Product key (one line per product on the diagram). */
  key: string
  make: string
  model: string
  category: string
  /** How many of it are on the diagram. */
  qty: number
  ids: string[]
  row: number | null
  match: MatchKind
  price: number | null
  stock: number | null
}

export interface InventoryReport {
  lines: InventoryLine[]
  /** Sheet rows not used by anything on the diagram. */
  unused: number[]
  found: number
  missing: number
  total: number
  /** Lines with a price (the total covers only these). */
  priced: number
}

/** Things that aren't purchasable gear (cables are separate; racks/plates are made). */
const skip = (e: EquipmentInstance) => e.product.category === 'wallBox' && !e.product.manufacturer

/** Sheet rows indexed for matching. */
function indexRows(inv: InventorySheet) {
  return inv.rows.map((_, i) => {
    const { make, model } = rowTitle(inv, i)
    return { i, make: norm(make), model: norm(cell(inv, i, 'model')), any: norm(`${make} ${model} ${cell(inv, i, 'desc')}`), sku: norm(cell(inv, i, 'sku')) }
  })
}
const sameMake = (a: string, b: string) => !a || !b || a === b || a.includes(b) || b.includes(a)

/** Best sheet row for a make + model, or null. */
export function findRow(inv: InventorySheet, make: string, model: string, idx = indexRows(inv)): { row: number; match: MatchKind } | null {
  const mk = norm(make), md = norm(model)
  if (!md) return null
  const exactModel = idx.filter((r) => r.model === md || (r.sku && r.sku === md))
  const exact = exactModel.find((r) => sameMake(r.make, mk))
  if (exact) return { row: exact.i, match: r0(exact.make, mk) ? 'exact' : 'model' }
  if (exactModel.length === 1 && !inv.map.make) return { row: exactModel[0].i, match: 'model' }
  if (md.length >= 4) {
    // "QL5" vs "QL5 Digital Mixer", "UMX-HD-TP" vs "Umx Hd Tp Receiver"…
    const close = idx.filter((r) => (r.model && (r.model.includes(md) || (r.model.length >= 4 && md.includes(r.model)))) || r.any.includes(md))
    const pick = close.find((r) => mk && r.make && sameMake(r.make, mk)) ?? (close.length === 1 ? close[0] : undefined)
    if (pick) return { row: pick.i, match: 'close' }
  }
  return null
}
const r0 = (a: string, b: string) => !!a && !!b && sameMake(a, b)

/** Diagram gear vs the sheet: one line per product, plus sheet rows that aren't used. */
export function matchInventory(p: Project, inv: InventorySheet | undefined | null): InventoryReport {
  const groups = new Map<string, InventoryLine>()
  for (const e of p.equipment) {
    if (skip(e)) continue
    const k = e.product.key
    const g = groups.get(k)
    if (g) { g.qty++; g.ids.push(e.id); continue }
    groups.set(k, { key: k, make: e.product.manufacturer, model: e.product.model, category: e.product.category, qty: 1, ids: [e.id], row: null, match: 'none', price: null, stock: null })
  }
  const lines = [...groups.values()].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model, undefined, { numeric: true }))
  const used = new Set<number>()
  if (inv) {
    const idx = indexRows(inv)
    for (const l of lines) {
      const link = inv.links?.[l.key]
      const hit = link !== undefined ? (link == null ? null : { row: link, match: 'manual' as MatchKind }) : findRow(inv, l.make, l.model, idx)
      if (hit && hit.row < inv.rows.length) {
        l.row = hit.row; l.match = hit.match
        l.price = rowPrice(inv, hit.row); l.stock = rowQty(inv, hit.row)
        used.add(hit.row)
      }
    }
  }
  const unused = inv ? inv.rows.map((_, i) => i).filter((i) => !used.has(i) && rowTitle(inv, i).model) : []
  const priced = lines.filter((l) => l.price != null)
  return {
    lines, unused,
    found: lines.filter((l) => l.row != null).length,
    missing: lines.filter((l) => l.row == null).length,
    total: priced.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0),
    priced: priced.length,
  }
}

export const money = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })

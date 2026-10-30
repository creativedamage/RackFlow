import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CATEGORIES, CATEGORY_KEYS, CONNECTOR_TYPES, connectorName, draftFromJSON, draftToProduct, fuzzyFind, guessCategory, guessMakerCategories,
  parseSpecText, productProblems, SIGNAL_TYPES, SIGNALS, splitMakerModel, suggestedSignals,
  type ConnectorType, type EquipmentCategory, type PortDirection, type PortDraft, type ProductDefinition, type SignalType, type SpecDraft,
} from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Field, Modal, Segmented, Select } from '../components/ui'
import { ManufacturerPicker } from '../components/ManufacturerPicker'
import { addProductToDiagram } from '../diagram/placement'
import { openProductEditor } from './openEditor'
import type { AiStatus } from '../../../preload/api'

type Source = 'paste' | 'web' | 'ai'
type Row = PortDraft & { rid: number }
let ridSeq = 1
const toRows = (ports: PortDraft[]): Row[] => ports.map((p) => ({ ...p, rid: ridSeq++ }))

const CONNECTOR_OPTIONS = CONNECTOR_TYPES.map((c) => ({ value: c, label: connectorName(c) }))
const SIGNAL_OPTIONS = SIGNAL_TYPES.map((s) => ({ value: s, label: SIGNALS[s].name }))
const DIR_OPTIONS: { value: PortDirection; label: string }[] = [{ value: 'input', label: 'In' }, { value: 'output', label: 'Out' }, { value: 'bidirectional', label: 'In/Out' }]

/**
 * Find Device: search the library by brand / model / part / type, and if the
 * device isn't there, build it from the manufacturer's spec sheet (pasted text,
 * a web page, or an AI lookup), review every port, then save it.
 */
export function DeviceFinder({ initialQuery }: { initialQuery: string }) {
  const library = useStore((s) => s.library)
  const makers = useStore((s) => s.makers)
  const close = () => useStore.getState().set({ finding: null })

  const [query, setQuery] = useState(initialQuery)
  const hits = useMemo(() => fuzzyFind(library, query, 10), [library, query])

  // Identity – follows the search box until the user edits it.
  const [identityTouched, setIdentityTouched] = useState(false)
  const guess = useMemo(() => splitMakerModel(query, makers), [query, makers])
  const [manufacturer, setManufacturer] = useState(guess.manufacturer)
  const [model, setModel] = useState(guess.model)
  const [category, setCategory] = useState<EquipmentCategory>(guessCategory(query))
  useEffect(() => {
    if (identityTouched) return
    setManufacturer(guess.manufacturer); setModel(guess.model); setCategory(guessCategory(query))
  }, [guess, query, identityTouched])

  const [source, setSource] = useState<Source>('paste')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SpecDraft | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [rowsTouched, setRowsTouched] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const reviewRef = useRef<HTMLDivElement>(null)

  useEffect(() => { void api.aiStatus().then((s) => { setAi(s); setModelDraft(s.model) }) }, [])

  /** New draft from any source: fills identity gaps and replaces the port rows. */
  const useDraft = (d: SpecDraft) => {
    setDraft(d)
    setRows(toRows(d.ports))
    setRowsTouched(false)
    setConfirmed(false)
    if (d.manufacturer || d.model) {
      setIdentityTouched(true)
      if (d.manufacturer) setManufacturer(makers.resolve(d.manufacturer)?.maker.name ?? d.manufacturer)
      if (d.model) setModel(d.model)
    }
    if (d.category) setCategory(d.category)
    setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // Pasted text parses live (until the user starts editing rows).
  useEffect(() => {
    if (source !== 'paste' && source !== 'web') return
    if (!text.trim()) return
    if (rowsTouched) return
    const d = parseSpecText(text, source === 'web' && url ? url : 'pasted specs')
    setDraft(d); setRows(toRows(d.ports)); setConfirmed(false)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)) } finally { setBusy(null) }
  }
  const fetchUrl = () => run('Fetching page…', async () => {
    const page = await api.fetchSpecPage(url.trim())
    setRowsTouched(false)
    setText(page.text)
    if (!page.text.trim()) throw new Error('That page had no readable text (it may need JavaScript). Copy the specs and paste them instead.')
  })
  const aiLookup = (withText: boolean) => run('Looking up specs…', async () => {
    const q = `${manufacturer} ${model}`.trim() || query
    const r = await api.aiLookup({ query: q, url: !withText && url.trim() ? url.trim() : undefined, text: withText ? text : undefined })
    useDraft(draftFromJSON(r.json, r.via))
  })
  const saveAi = () => run('Saving…', async () => {
    await api.aiSettings({ key: keyDraft.trim() || undefined, model: modelDraft })
    setKeyDraft('')
    setAi(await api.aiStatus())
  })

  const editRow = (rid: number, patch: Partial<PortDraft>) => {
    setRowsTouched(true); setConfirmed(false)
    setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...patch } : r)))
  }

  // The product the review builds.
  const product: ProductDefinition | null = useMemo(() => {
    if (!draft && !rows.length) return null
    const p = draftToProduct({ ...(draft ?? { unmatched: [] }), ports: rows, manufacturer, model, category, unmatched: draft?.unmatched ?? [] })
    p.category = category
    return p
  }, [draft, rows, manufacturer, model, category])
  const problems = product ? productProblems(product) : []
  const portTotal = rows.reduce((a, r) => a + Math.max(1, r.count), 0)

  const save = async (place: boolean) => {
    if (!product) return
    const p: ProductDefinition = { ...product, verified: confirmed ? true : false, dataNote: confirmed ? undefined : product.dataNote, revision: 1 }
    if (p.manufacturer.trim() && !makers.get(p.manufacturer)) {
      await api.saveUserManufacturer({ name: p.manufacturer.trim(), categories: guessMakerCategories(p.category), aliases: [], source: 'user' })
    }
    await api.saveUserProduct(p)
    await useStore.getState().reloadLibrary()
    close()
    if (place) addProductToDiagram(p)
    useStore.getState().notify(`Saved “${p.manufacturer} ${p.model}” with ${p.ports.length} ports${place ? ' and added it to the diagram' : ''}`, { kind: 'success' })
  }

  const searchWeb = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(`${manufacturer || ''} ${model || query} tech specs connections`.trim())}`, '_blank')

  return (
    <Modal title="Find Device" onClose={close} wide
      footer={<>
        <span className="muted">{product ? `${portTotal} ports · ${problems.length ? problems[0] : confirmed ? 'Confirmed' : 'Check the ports, then confirm'}` : 'Search the library, or build the device from its spec sheet'}</span>
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        {product && <button disabled={problems.length > 0} onClick={() => { close(); openProductEditor({ ...product, verified: confirmed || product.verified }) }} title="Open in the full product editor to change anything else (size, power, port faces…)">Open in Full Editor…</button>}
        {product && <button disabled={problems.length > 0 || !confirmed} onClick={() => void save(false)}>Save to Library</button>}
        {product && <button className="primary" disabled={problems.length > 0 || !confirmed} onClick={() => void save(true)} title={confirmed ? '' : 'Tick “These ports are correct” first'}>Save & Add to Diagram</button>}
      </>}>
      <div className="finder">
        <input className="finder-search" autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Brand, model, part number or type – e.g. Blackmagic URSA Broadcast G2" />

        <section className="finder-hits">
          <h4>In your library {query.trim() && <span className="muted">{hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : 'no matches'}</span>}</h4>
          {hits.length > 0 ? (
            <div className="finder-list">
              {hits.map(({ product: p }) => (
                <div key={p.key} className="finder-hit">
                  <div className="lib-main">
                    <div className="lib-title">{p.manufacturer} {p.model}{p.source === 'user' && <span className="badge">Yours</span>}</div>
                    <div className="lib-sub">{CATEGORIES[p.category].name} · {p.ports.length} ports{p.summary ? ` · ${p.summary}` : ''}</div>
                  </div>
                  <button className="mini" onClick={() => { close(); openProductEditor(p) }}>Edit…</button>
                  <button className="mini primary" onClick={() => { close(); addProductToDiagram(p) }}>Add</button>
                </div>
              ))}
            </div>
          ) : <p className="muted small">{query.trim() ? 'Not in the library yet – build it from the manufacturer’s specs below.' : 'Start typing to search 2,300+ products.'}</p>}
        </section>

        <section className="finder-build">
          <h4>Build it from the manufacturer’s specs</h4>
          <div className="finder-identity">
            <Field label="Manufacturer"><ManufacturerPicker value={manufacturer} onChange={(v) => { setIdentityTouched(true); setManufacturer(v) }} /></Field>
            <Field label="Model"><input value={model} onChange={(e) => { setIdentityTouched(true); setModel(e.target.value) }} /></Field>
            <Field label="Type"><Select value={category} onChange={(v) => { setIdentityTouched(true); setCategory(v) }} options={CATEGORY_KEYS.map((c) => ({ value: c, label: CATEGORIES[c].name }))} /></Field>
          </div>
          <Segmented value={source} onChange={setSource} options={[
            { value: 'paste', label: 'Paste specs' },
            { value: 'web', label: 'Product page' },
            { value: 'ai', label: 'AI lookup' },
          ]} />
          {source === 'paste' && (<>
            <p className="muted small">On the manufacturer’s site, copy the <b>Connections</b> / tech specs section and paste it here. It’s read as you paste. <button className="link" onClick={searchWeb}>Search the web for the spec sheet ↗</button></p>
            <textarea className="finder-text" value={text} onChange={(e) => { setRowsTouched(false); setText(e.target.value) }}
              placeholder={'SDI Video Outputs: 1 x 12G-SDI, 1 x 3G-SDI\nAnalog Audio Inputs: 2 x XLR\nEthernet: 10G\nPower: 4-pin XLR 12V DC'} />
          </>)}
          {source === 'web' && (<>
            <p className="muted small">Paste the product’s tech specs page address. RackFlow downloads it and reads the connections. <button className="link" onClick={searchWeb}>Find the page ↗</button></p>
            <div className="row">
              <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.blackmagicdesign.com/products/…/techspecs" onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) void fetchUrl() }} />
              <button className="primary" disabled={!url.trim() || !!busy} onClick={() => void fetchUrl()}>Read Page</button>
            </div>
            {text && <p className="muted small">Read {text.length.toLocaleString()} characters.{ai?.hasKey && <> Not right? <button className="link" onClick={() => void aiLookup(true)}>Have AI read this page instead</button></>}</p>}
          </>)}
          {source === 'ai' && (ai?.hasKey ? (
            <div className="finder-ai">
              <p className="muted small">Claude searches the manufacturer’s website for <b>{`${manufacturer} ${model}`.trim() || query || 'the device'}</b> and lists its connectors. Uses your Anthropic API key (a few cents per lookup). You’ll review everything before it’s saved.</p>
              <div className="row">
                <button className="primary" disabled={!!busy || !(model || query).trim()} onClick={() => void aiLookup(false)}>Look Up Online</button>
                {text.trim() && <button disabled={!!busy} onClick={() => void aiLookup(true)}>Read My Pasted Specs with AI</button>}
                <span className="spacer" />
                <details className="finder-ai-settings"><summary className="muted small">Settings</summary>
                  <div className="row"><input value={modelDraft} onChange={(e) => setModelDraft(e.target.value)} title="Anthropic model name" style={{ width: 200 }} />
                    <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="New API key (optional)" />
                    <button onClick={() => void saveAi()}>Save</button>
                    <button className="danger" onClick={() => void api.aiSettings({ key: null }).then(() => api.aiStatus()).then(setAi)}>Remove Key</button></div>
                </details>
              </div>
            </div>
          ) : (
            <div className="finder-ai">
              <p className="muted small">Optional: with your own Anthropic API key, RackFlow can look a device up online by name. The key is stored encrypted in your macOS keychain and only sent to Anthropic. Get one at console.anthropic.com. Paste specs and Product page work without it.</p>
              <div className="row">
                <input type="password" className="grow" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" />
                <button className="primary" disabled={!keyDraft.trim() || !!busy} onClick={() => void saveAi()}>Save Key</button>
              </div>
            </div>
          ))}
          {busy && <p className="finder-busy"><span className="spinner" /> {busy}</p>}
          {error && <p className="data-note">⚠︎ {error}</p>}
        </section>

        {product && (
          <section className="finder-review" ref={reviewRef}>
            <h4>Review ports <span className="muted">{portTotal} total{draft?.via ? ` · from ${draft.via}` : ''}</span></h4>
            <p className="muted small">Check each row against the manufacturer’s sheet. Change anything that’s wrong, delete extras, or add what’s missing.</p>
            <table className="finder-table">
              <thead><tr><th>Qty</th><th>Label</th><th>Connector</th><th>Direction</th><th>Signal</th><th>Group</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rid}>
                    <td><input type="number" min={1} max={256} value={r.count} onChange={(e) => editRow(r.rid, { count: Math.max(1, Math.min(256, Number(e.target.value) || 1)) })} style={{ width: 52 }} /></td>
                    <td><input value={r.label} onChange={(e) => editRow(r.rid, { label: e.target.value })} title={r.source ? `From: ${r.source}` : undefined} /></td>
                    <td><Select<ConnectorType> value={r.connector} options={CONNECTOR_OPTIONS} onChange={(c) => editRow(r.rid, { connector: c, signals: suggestedSignals(c), gender: undefined })} /></td>
                    <td><Select<PortDirection> value={r.direction} options={DIR_OPTIONS} onChange={(d) => editRow(r.rid, { direction: d, gender: undefined })} /></td>
                    <td><Select<SignalType> value={r.signals[0]} options={SIGNAL_OPTIONS} onChange={(s) => editRow(r.rid, { signals: [s, ...r.signals.filter((x) => x !== s && SIGNALS[x].domain === SIGNALS[s].domain)] })} /></td>
                    <td><input value={r.group ?? ''} onChange={(e) => editRow(r.rid, { group: e.target.value || undefined })} style={{ width: 80 }} /></td>
                    <td><button className="mini danger" title="Remove this row" onClick={() => { setRowsTouched(true); setConfirmed(false); setRows((rs) => rs.filter((x) => x.rid !== r.rid)) }}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="mini" onClick={() => { setRowsTouched(true); setConfirmed(false); setRows((rs) => [...rs, { rid: ridSeq++, label: 'New Port', count: 1, connector: 'bnc', direction: 'input', signals: ['sdi12G'], group: 'Video' }]) }}>+ Add Port</button>
              {rowsTouched && text.trim() && source !== 'ai' && <button className="mini" onClick={() => { const d = parseSpecText(text, draft?.via); setDraft(d); setRows(toRows(d.ports)); setRowsTouched(false); setConfirmed(false) }}>Re-read specs (discard my changes)</button>}
            </div>
            {!!draft?.unmatched.length && (
              <div className="data-note">Couldn’t place {draft.unmatched.length === 1 ? 'this line' : 'these lines'} – add a row if it’s a connector:
                <ul>{draft.unmatched.slice(0, 8).map((u, i) => <li key={i}>{u}</li>)}</ul>
              </div>
            )}
            {problems.length > 0 && <div className="data-note">{problems.map((p) => <div key={p}>⚠︎ {p}</div>)}</div>}
            <label className="finder-confirm">
              <input type="checkbox" checked={confirmed} disabled={problems.length > 0} onChange={(e) => setConfirmed(e.target.checked)} />
              These ports are correct – I’ve checked them against the manufacturer’s spec sheet
            </label>
          </section>
        )}
      </div>
    </Modal>
  )
}

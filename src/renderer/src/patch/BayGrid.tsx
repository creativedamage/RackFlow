import { editBayLayout } from '../product/openEditor'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import {
  FORMATS, gapBefore, NORMAL_SYMBOLS, cycleNormal, findCell, titlesIn, totalChannels,
  type CellStyle, type LabelStripGeometry, type LabelSpan, type PatchBay, type PatchRowTemplate, isTwoSided, panelDescription,
} from '@core/index'
import { useStore } from '../store'
import { TextInput } from '../components/ui'
import { editBay, usePatchUI, type PatchSel } from './patchState'

const inRange = (sel: PatchSel | null, bay: string, row: number, ch: number) =>
  !!sel && sel.bay === bay && sel.row === row && ch >= Math.min(sel.a, sel.b) && ch <= Math.max(sel.a, sel.b)

export function cssFor(st: CellStyle | undefined, tint?: string | null): React.CSSProperties {
  return {
    fontWeight: st?.bold === false ? 400 : st?.bold ? 700 : 600,
    fontStyle: st?.italic ? 'italic' : undefined,
    textDecoration: [st?.underline && 'underline', st?.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
    color: st?.color,
    background: st?.fill ?? (tint ? `${tint}33` : undefined),
    fontFamily: st?.fontFamily,
    fontSize: st?.sizePt ? `${Math.max(7, st.sizePt * 1.35)}px` : undefined,
    textAlign: st?.align,
  }
}

let dragging = false
window.addEventListener('mouseup', () => { dragging = false })

/** One patch bay in the stacked editor: header, channel ruler, strips, normalling rows. */
export const BayGrid = memo(function BayGrid({ bay, index, count }: { bay: PatchBay; index: number; count: number }) {
  const sel = usePatchUI((s) => s.sel)
  const title = usePatchUI((s) => s.title)
  const setSel = usePatchUI((s) => s.setSel)
  const setUI = usePatchUI((s) => s.set)
  const selectedBay = useStore((s) => s.selectedBay)
  const colw = usePatchUI((s) => s.colw)
  const active = sel?.bay === bay.id || selectedBay === bay.id
  const t = bay.template
  const maxCh = Math.max(...t.rows.map((r) => r.strip.channelCount))
  const bank = t.rows[0].strip

  const header = (
    <div className={`pb-head ${active ? 'active' : ''}`}>
      <span className="pb-idx">{index + 1}</span>
      <TextInput className="pb-name" value={bay.name} onCommit={(v) => editBay(bay.id, 'Rename Patch Bay', (b) => { b.name = v })} />
      <TextInput className="pb-loc" value={bay.location} placeholder="Location" onCommit={(v) => editBay(bay.id, 'Bay Location', (b) => { b.location = v })} />
      <span className="pb-meta">{t.manufacturer}</span>
      <span className="pb-meta">{t.series}</span>
      <span className="pb-meta">{FORMATS[t.format].name}{isTwoSided(t) || t.cableCategory ? ` · ${panelDescription(t)}` : ''}</span>
      <button className="mini" onClick={() => editBayLayout(bay.id)} title="Rows, sockets, termination (punch-down / feed-through / keystone) and cable category">Layout…</button>
      <span className="pb-meta right">{totalChannels(t)} pts{!t.dimensionsVerified && <span className="badge warn" title="Nominal strip dimensions – verify before printing">nominal</span>}</span>
    </div>
  )

  const ruler = (n: number) => (
    <div className="pb-ruler" style={{ gridTemplateColumns: `repeat(${n}, minmax(var(--colw, 0px), 1fr))` }}>
      {Array.from({ length: n }, (_, i) => <span key={i} className={gapBefore(bank, i) ? 'bank' : ''}>{i + 1}</span>)}
    </div>
  )

  return (
    <section className={`pb ${active ? 'active' : ''}`} style={{ minWidth: colw ? maxCh * colw + 26 : undefined }} onMouseDown={() => useStore.getState().set({ selectedBay: bay.id as never })}>
      <div className="pb-side">
        <span title="Patch bay">☰</span>
        <button className="icon-btn" title="Move up" disabled={index === 0} onClick={() => useStore.getState().apply('Move Patch Bay', (d) => { const i = d.patchBays.findIndex((b) => b.id === bay.id); [d.patchBays[i - 1], d.patchBays[i]] = [d.patchBays[i], d.patchBays[i - 1]] })}>⌃</button>
        <button className="icon-btn" title="Move down" disabled={index === count - 1} onClick={() => useStore.getState().apply('Move Patch Bay', (d) => { const i = d.patchBays.findIndex((b) => b.id === bay.id); [d.patchBays[i + 1], d.patchBays[i]] = [d.patchBays[i], d.patchBays[i + 1]] })}>⌄</button>
        <button className="icon-btn" title="Delete patch bay (and its device in the diagram)" onClick={() => {
          if (!confirm(`Delete ${bay.name}? Its device and cables are removed from the wiring diagram too.`)) return
          useStore.getState().apply('Delete Patch Bay', (d) => {
            d.patchBays = d.patchBays.filter((b) => b.id !== bay.id)
            d.equipment = d.equipment.filter((e) => e.id !== bay.equipment)
            d.cables = d.cables.filter((c) => c.from.equipment !== bay.equipment && c.to.equipment !== bay.equipment)
          })
          setSel(null)
        }}>✕</button>
      </div>
      <div className="pb-main">
        {header}
        {ruler(maxCh)}
        {t.rows.map((row) => (
          <div key={row.id}>
            <Strip bay={bay} row={row} bank={bank} sel={sel} title={title} onSel={setSel} onEdit={(e) => setUI({ editing: e })} />
            {bay.normals.find((n) => n.afterRow === row.id) && <NormalRow bay={bay} afterRow={row.id} bank={bank} />}
          </div>
        ))}
      </div>
    </section>
  )
})

function Strip({ bay, row, bank, sel, title, onSel, onEdit }: {
  bay: PatchBay; row: PatchRowTemplate; bank: LabelStripGeometry; sel: PatchSel | null; title: string | null
  onSel: (s: PatchSel | null, title?: string | null) => void
  onEdit: (e: { bay: string; row: number; channel: number } | { bay: string; title: string }) => void
}) {
  const n = row.strip.channelCount
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(var(--colw, 0px), 1fr))` }
  const titles = titlesIn(bay, row.id)

  const down = (e: React.MouseEvent, ch: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget.closest('.patch-grid') as HTMLElement | null)?.focus()
    if (e.shiftKey && sel && sel.bay === bay.id && sel.row === row.id) onSel({ ...sel, b: ch })
    else onSel({ bay: bay.id, row: row.id, a: ch, b: ch })
    dragging = true
  }
  const enter = (ch: number) => { if (dragging && sel && sel.bay === bay.id && sel.row === row.id) onSel({ ...sel, b: ch }) }

  return (
    <div className="pb-strip" style={{ background: bay.rowFill[String(row.id)] }}>
      <div className="pb-titles" style={cols}>
        {titles.map((s: LabelSpan) => (
          <div key={s.id} className={`pb-title ${title === s.id ? 'sel' : ''}`} style={{ gridColumn: `${s.start} / ${s.end + 1}`, ...cssFor(s.style), background: s.style?.fill }}
            onMouseDown={(e) => { e.stopPropagation(); (e.currentTarget.closest('.patch-grid') as HTMLElement | null)?.focus(); onSel({ bay: bay.id, row: row.id, a: s.start, b: s.end }, s.id) }}
            onDoubleClick={() => onEdit({ bay: bay.id, title: s.id })} title="Double-click to rename · Delete removes the title">
            <span className="bracket" /><span className="title-text">{s.text || ' '}</span><span className="bracket" />
          </div>
        ))}
        {titles.length === 0 && <div className="pb-title-hint" style={{ gridColumn: `1 / ${n + 1}` }}>{row.name} · select channels and press ⌘G to add a title</div>}
      </div>
      <div className="pb-cells" style={cols}>
        {Array.from({ length: n }, (_, i) => {
          const ch = i + 1
          const cell = findCell(bay, row.id, ch)
          const lines = (cell?.text ?? '').split('\n')
          const selected = inRange(sel, bay.id, row.id, ch)
          return (
            <div key={ch}
              className={`pb-cell ${selected ? 'sel' : ''} ${gapBefore(bank, i) ? 'bank' : ''} ${cell?.manual ? 'manual' : ''}`}
              style={cssFor(cell?.style, cell?.fill)}
              onMouseDown={(e) => down(e, ch)} onMouseEnter={() => enter(ch)}
              onDoubleClick={() => onEdit({ bay: bay.id, row: row.id, channel: ch })}
              title={cell?.text ? `${row.name} ${ch}: ${cell.text.replace(/\n/g, ' / ')}${cell.manual ? ' (typed)' : ' (from wiring)'}` : `${row.name} ${ch}`}>
              {cell?.text ? lines.map((l, k) => <span key={k}>{l}</span>) : <span className="ch-num">{ch}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NormalRow({ bay, afterRow, bank }: { bay: PatchBay; afterRow: number; bank: LabelStripGeometry }) {
  const band = bay.normals.find((x) => x.afterRow === afterRow)!
  return (
    <div className="pb-normals" style={{ gridTemplateColumns: `repeat(${band.modes.length}, minmax(var(--colw, 0px), 1fr))` }}>
      {band.modes.map((m, i) => (
        <button key={i} className={`norm ${gapBefore(bank, i) ? 'bank' : ''}`} title={`Ch ${i + 1}: ${NORMAL_SYMBOLS[m].name} (click to change)`}
          onClick={() => editBay(bay.id, 'Change Normalling', (b) => cycleNormal(b, afterRow, i + 1))}>
          {NORMAL_SYMBOLS[m].glyph}
        </button>
      ))}
    </div>
  )
}

/** Floating editor for a cell or a title. Enter = commit, ⇧Enter = new line, Tab = next cell. */
export function CellEditorPopover() {
  const editing = usePatchUI((s) => s.editing)
  const set = usePatchUI((s) => s.set)
  const project = useStore((s) => s.project)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const bay = editing ? project.patchBays.find((b) => b.id === editing.bay) : undefined
  const isTitle = !!editing && 'title' in editing
  const current = !bay || !editing ? '' : 'title' in editing
    ? bay.spans.find((s) => s.id === editing.title)?.text ?? ''
    : findCell(bay, editing.row, editing.channel)?.text ?? ''

  const seeded = !!editing && 'seed' in editing && editing.seed != null
  useLayoutEffect(() => {
    if (!editing) return
    const t = seeded ? (editing as { seed: string }).seed : current
    setText(t)
    const el = ref.current
    if (el) { el.focus(); if (seeded) el.setSelectionRange(t.length, t.length); else el.select() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (!editing || !bay) return null
  const close = () => { set({ editing: null }); requestAnimationFrame(() => (document.querySelector('.patch-grid') as HTMLElement | null)?.focus()) }
  const commit = (move: 0 | 1 | -1 = 0) => {
    if ('title' in editing) {
      editBay(bay.id, 'Rename Title', (b) => { const s = b.spans.find((x) => x.id === editing.title); if (s) s.text = text })
      close()
      return
    }
    if (text !== current) editBay(bay.id, 'Edit Label', (b) => {
      const c = findCell(b, editing.row, editing.channel)
      if (c) { c.text = text; c.manual = text !== '' } else b.cells.push({ row: editing.row, channel: editing.channel, text, manual: true, fill: null })
    })
    const n = bay.template.rows.find((r) => r.id === editing.row)?.strip.channelCount ?? 0
    const next = editing.channel + move
    if (move && next >= 1 && next <= n) {
      usePatchUI.getState().setSel({ bay: bay.id, row: editing.row, a: next, b: next })
      set({ editing: { bay: bay.id, row: editing.row, channel: next } })
    } else {
      if (move === 0) usePatchUI.getState().setSel({ bay: bay.id, row: editing.row, a: editing.channel, b: editing.channel })
      close()
    }
  }
  const where = 'title' in editing ? 'Group title' : `${bay.name} · ${bay.template.rows.find((r) => r.id === editing.row)?.name} ${editing.channel}`
  return (
    <div className="cell-pop">
      <div className="muted small">{where}</div>
      <textarea ref={ref} value={text} rows={isTitle ? 1 : 3} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(0) }
          else if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? -1 : 1) }
          else if (e.key === 'Escape') { e.preventDefault(); close() }
        }} />
      <div className="muted small">Enter to save · ⇧Enter new line · Tab next · Esc cancel</div>
    </div>
  )
}

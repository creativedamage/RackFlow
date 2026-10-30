import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** One column of the sheet. Rows are whatever the caller passes. */
export interface SheetColumn<R> {
  key: string
  title: string
  width: number
  /** Display / copy text. */
  get: (r: R) => string
  /** Present when editable. Receives the typed or pasted text. */
  set?: (r: R, value: string) => void
  /** Editable as a dropdown with these choices (value, label). */
  options?: (r: R) => { value: string; label: string }[]
  /** Current option value (for dropdown columns; get() is the display label). */
  value?: (r: R) => string
  numeric?: boolean
  render?: (r: R) => ReactNode
  align?: 'left' | 'right' | 'center'
}

interface Sel { r0: number; c0: number; r1: number; c1: number }
const norm = (s: Sel) => ({ top: Math.min(s.r0, s.r1), bottom: Math.max(s.r0, s.r1), left: Math.min(s.c0, s.c1), right: Math.max(s.c0, s.c1) })

/**
 * A small spreadsheet: click / shift-click / drag to select, arrows to move,
 * type or Enter to edit, Tab to move right, Delete to clear, ⌘C / ⌘V with
 * Excel / Numbers / Google Sheets (tab-separated), ⌘D fill down, sort by header.
 * `commit` receives every change from one action at once (one undo step).
 */
export function Sheet<R>({ rows, columns, rowKey, commit, onSelectionChange, rowClass, emptyText }: {
  rows: R[]
  columns: SheetColumn<R>[]
  rowKey: (r: R) => string
  commit: (label: string, changes: { row: R; col: SheetColumn<R>; value: string }[]) => void
  onSelectionChange?: (rows: R[]) => void
  rowClass?: (r: R) => string
  emptyText?: string
}) {
  const [sel, setSel] = useState<Sel>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string; replace: boolean } | null>(null)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const dragging = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  const view = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    return [...rows].sort((a, b) => col.get(a).localeCompare(col.get(b), undefined, { numeric: true, sensitivity: 'base' }) * sort.dir)
  }, [rows, columns, sort])

  const clampSel = (s: Sel): Sel => {
    const R = Math.max(view.length - 1, 0), C = columns.length - 1
    const cl = (v: number, m: number) => Math.max(0, Math.min(m, v))
    return { r0: cl(s.r0, R), c0: cl(s.c0, C), r1: cl(s.r1, R), c1: cl(s.c1, C) }
  }
  const box = norm(sel)
  const selectedRows = useMemo(() => view.slice(box.top, box.bottom + 1), [view, box.top, box.bottom])
  useEffect(() => { onSelectionChange?.(selectedRows) }, [selectedRows, onSelectionChange])

  const focusGrid = () => wrap.current?.focus({ preventScroll: true })
  useLayoutEffect(() => { if (editing) { input.current?.focus(); if (input.current instanceof HTMLInputElement && !editing.replace) input.current.select() } }, [editing?.r, editing?.c])

  // Keep the active cell visible.
  useEffect(() => {
    wrap.current?.querySelector(`[data-cell="${sel.r1}:${sel.c1}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [sel.r1, sel.c1])

  const startEdit = (r: number, c: number, seed?: string) => {
    const col = columns[c], row = view[r]
    if (!col?.set || !row) return
    setEditing({ r, c, draft: seed ?? (col.options ? col.value?.(row) ?? col.get(row) : col.get(row)), replace: seed !== undefined })
  }
  const finishEdit = (move?: [number, number]) => {
    if (editing) {
      const col = columns[editing.c], row = view[editing.r]
      if (col && row && editing.draft !== col.get(row)) commit(`Edit ${col.title}`, [{ row, col, value: editing.draft }])
    }
    setEditing(null)
    if (move) setSel((s) => clampSel({ r0: s.r1 + move[0], c0: s.c1 + move[1], r1: s.r1 + move[0], c1: s.c1 + move[1] }))
    requestAnimationFrame(focusGrid)
  }

  const cellsIn = (b = box) => {
    const out: { row: R; col: SheetColumn<R> }[] = []
    for (let r = b.top; r <= b.bottom; r++) for (let c = b.left; c <= b.right; c++) if (view[r] && columns[c]) out.push({ row: view[r], col: columns[c] })
    return out
  }
  const copyText = () => {
    const lines: string[] = []
    for (let r = box.top; r <= box.bottom; r++) {
      const cells: string[] = []
      for (let c = box.left; c <= box.right; c++) cells.push((view[r] ? columns[c].get(view[r]) : '').replace(/[\t\n]/g, ' '))
      lines.push(cells.join('\t'))
    }
    return lines.join('\n')
  }
  const paste = (text: string) => {
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    const changes: { row: R; col: SheetColumn<R>; value: string }[] = []
    if (grid.length === 1 && grid[0].length === 1) {
      // One value into a multi-cell selection: fill it.
      for (const { row, col } of cellsIn()) if (col.set) changes.push({ row, col, value: grid[0][0] })
    } else {
      grid.forEach((line, i) => line.forEach((v, j) => {
        const row = view[box.top + i], col = columns[box.left + j]
        if (row && col?.set) changes.push({ row, col, value: v })
      }))
      setSel(clampSel({ r0: box.top, c0: box.left, r1: box.top + grid.length - 1, c1: box.left + Math.max(...grid.map((l) => l.length)) - 1 }))
    }
    if (changes.length) commit(`Paste ${changes.length} cell${changes.length === 1 ? '' : 's'}`, changes)
  }
  const clear = () => {
    const changes = cellsIn().filter((x) => x.col.set && !x.col.options).map((x) => ({ ...x, value: '' }))
    if (changes.length) commit('Clear Cells', changes)
  }
  const fillDown = () => {
    if (box.bottom === box.top) return
    const changes: { row: R; col: SheetColumn<R>; value: string }[] = []
    for (let c = box.left; c <= box.right; c++) {
      const col = columns[c]
      if (!col.set) continue
      const v = col.get(view[box.top])
      for (let r = box.top + 1; r <= box.bottom; r++) changes.push({ row: view[r], col, value: v })
    }
    if (changes.length) commit('Fill Down', changes)
  }

  // Menu-driven Select All / Delete, and native copy/paste (menu roles + shortcuts).
  useEffect(() => {
    const all = () => setSel({ r0: 0, c0: 0, r1: view.length - 1, c1: columns.length - 1 })
    const del = () => { if (!editing) clear() }
    const onCopy = (e: ClipboardEvent) => { if (editing || !wrap.current?.contains(document.activeElement)) return; e.preventDefault(); e.clipboardData?.setData('text/plain', copyText()) }
    const onCut = (e: ClipboardEvent) => { if (editing || !wrap.current?.contains(document.activeElement)) return; e.preventDefault(); e.clipboardData?.setData('text/plain', copyText()); clear() }
    const onPaste = (e: ClipboardEvent) => { if (editing || !wrap.current?.contains(document.activeElement)) return; e.preventDefault(); paste(e.clipboardData?.getData('text/plain') ?? '') }
    window.addEventListener('sheet:selectAll', all); window.addEventListener('sheet:delete', del)
    document.addEventListener('copy', onCopy); document.addEventListener('cut', onCut); document.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('sheet:selectAll', all); window.removeEventListener('sheet:delete', del)
      document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCut); document.removeEventListener('paste', onPaste)
    }
  })

  const onKey = (e: React.KeyboardEvent) => {
    if (editing) return
    const mod = e.metaKey || e.ctrlKey
    const move = (dr: number, dc: number) => {
      e.preventDefault()
      setSel((s) => e.shiftKey ? clampSel({ ...s, r1: s.r1 + dr, c1: s.c1 + dc }) : clampSel({ r0: s.r1 + dr, c0: s.c1 + dc, r1: s.r1 + dr, c1: s.c1 + dc }))
    }
    if (e.key === 'ArrowDown') return move(mod ? view.length : 1, 0)
    if (e.key === 'ArrowUp') return move(mod ? -view.length : -1, 0)
    if (e.key === 'ArrowRight') return move(0, mod ? columns.length : 1)
    if (e.key === 'ArrowLeft') return move(0, mod ? -columns.length : -1)
    if (e.key === 'Tab') return move(0, e.shiftKey ? -1 : 1)
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel.r1, sel.c1); return }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clear(); return }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel({ r0: 0, c0: 0, r1: view.length - 1, c1: columns.length - 1 }); return }
    if (!mod && e.key.length === 1) {
      const col = columns[sel.c1]
      if (col?.set && !col.options) { e.preventDefault(); startEdit(sel.r1, sel.c1, e.key) }
      else if (col?.options) { e.preventDefault(); startEdit(sel.r1, sel.c1) }
    }
  }

  const cellDown = (e: React.MouseEvent, r: number, c: number) => {
    if (editing && (editing.r !== r || editing.c !== c)) finishEdit()
    if (e.shiftKey) setSel((s) => ({ ...s, r1: r, c1: c }))
    else setSel({ r0: r, c0: c, r1: r, c1: c })
    dragging.current = true
    focusGrid()
  }
  const cellEnter = (r: number, c: number) => { if (dragging.current) setSel((s) => ({ ...s, r1: r, c1: c })) }
  useEffect(() => { const up = () => { dragging.current = false }; window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up) }, [])

  const rowHeaderDown = (e: React.MouseEvent, r: number) => {
    if (e.shiftKey) setSel((s) => ({ ...s, r1: r, c0: 0, c1: columns.length - 1 }))
    else setSel({ r0: r, c0: 0, r1: r, c1: columns.length - 1 })
    focusGrid()
  }
  const colHeaderClick = (e: React.MouseEvent, c: number) => {
    if (e.altKey || e.detail === 2) return
    const k = columns[c].key
    setSort((s) => (s?.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }))
  }

  const selRect = useCallback((r: number, c: number) => r >= box.top && r <= box.bottom && c >= box.left && c <= box.right, [box])
  // Last column stretches to fill the window; rows never shrink below the column widths.
  const total = 44 + columns.reduce((a, c) => a + c.width, 0)
  const template = `44px ${columns.map((c, i) => (i === columns.length - 1 ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' ')}`

  return (
    <div className="xsheet" ref={wrap} tabIndex={0} onKeyDown={onKey}>
      <div className="xsheet-row xsheet-head" style={{ gridTemplateColumns: template, minWidth: total }}>
        <div className="xsheet-corner" onClick={() => setSel({ r0: 0, c0: 0, r1: view.length - 1, c1: columns.length - 1 })} title="Select all" />
        {columns.map((col, c) => (
          <div key={col.key} className={`xsheet-th ${col.set ? 'editable' : ''}`} onClick={(e) => colHeaderClick(e, c)} title={col.set ? 'Editable · click to sort' : 'Click to sort'}>
            {col.title}{sort?.key === col.key ? (sort.dir === 1 ? ' ▴' : ' ▾') : ''}
          </div>
        ))}
      </div>
      {view.length === 0 && <div className="xsheet-empty">{emptyText ?? 'Nothing here yet.'}</div>}
      {view.map((row, r) => (
        <div key={rowKey(row)} className={`xsheet-row ${rowClass?.(row) ?? ''}`} style={{ gridTemplateColumns: template, minWidth: total }}>
          <div className={`xsheet-rh ${r >= box.top && r <= box.bottom ? 'on' : ''}`} onMouseDown={(e) => rowHeaderDown(e, r)}>{r + 1}</div>
          {columns.map((col, c) => {
            const isEdit = editing && editing.r === r && editing.c === c
            const active = sel.r1 === r && sel.c1 === c
            return (
              <div key={col.key} data-cell={`${r}:${c}`}
                className={`xsheet-td ${selRect(r, c) ? 'sel' : ''} ${active ? 'active' : ''} ${col.set ? 'editable' : 'ro'} ${col.align ?? (col.numeric ? 'right' : '')}`}
                onMouseDown={(e) => { if (!isEdit) cellDown(e, r, c) }} onMouseEnter={() => cellEnter(r, c)} onDoubleClick={() => startEdit(r, c)}>
                {isEdit ? (
                  col.options ? (
                    <select ref={(el) => { input.current = el }} value={editing.draft}
                      onChange={(e) => { const v = e.target.value; setEditing({ ...editing, draft: v }); commit(`Edit ${col.title}`, [{ row, col, value: v }]); setEditing(null); requestAnimationFrame(focusGrid) }}
                      onBlur={() => { setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(null); focusGrid() } }}>
                      {col.options(row).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input ref={(el) => { input.current = el }} value={editing.draft} onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                      onBlur={() => finishEdit()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); finishEdit([e.shiftKey ? -1 : 1, 0]) }
                        else if (e.key === 'Tab') { e.preventDefault(); finishEdit([0, e.shiftKey ? -1 : 1]) }
                        else if (e.key === 'Escape') { setEditing(null); focusGrid() }
                      }} />
                  )
                ) : (col.render ? col.render(row) : col.get(row))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

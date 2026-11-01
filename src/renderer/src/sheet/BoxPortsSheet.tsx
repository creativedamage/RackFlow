import { useCallback, useMemo, useState } from 'react'
import {
  boxNumberingOf, boxPortRows, numberBoxPorts, numberSeries, PORT_CLASSES, setPortLock, setPortNumber,
  type BoxPortRow, type PortClass,
} from '@core/index'
import { useStore } from '../store'
import { Select } from '../components/ui'
import { Sheet, type SheetColumn } from './Sheet'

const CLASS_NAME = Object.fromEntries(PORT_CLASSES.map((c) => [c.key, c.name.replace(/\s*\(.*\)$/, '')])) as Record<PortClass, string>
const YES = /^(y|yes|x|✓|✔|true|1|lock|locked)$/i

/**
 * Box Ports: every jack on the project's wall boxes, plates, floor boxes and
 * connector panels with its number. Type over a number (or paste a column) to
 * put jacks where you want them; numbers set here are locked so Renumber
 * leaves them alone. "Number Selected…" fills a run (M17, M18…) down the rows.
 */
export function BoxPortsSheet() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const [q, setQ] = useState('')
  const [cls, setCls] = useState<PortClass | ''>('')
  const [picked, setPicked] = useState<BoxPortRow[]>([])
  const [series, setSeries] = useState<string | null>(null)
  const on = boxNumberingOf(project).on

  const all = useMemo(() => boxPortRows(project), [project])
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return all.filter((r) => (!cls || r.cls === cls) && (!s || [r.eq.tag, r.eq.room, r.jack, r.number, r.front, r.rear, r.multipin].join(' ').toLowerCase().includes(s)))
  }, [all, q, cls])
  const classes = [...new Set(all.map((r) => r.cls))]
  const dups = all.filter((r) => r.duplicate).length

  const columns = useMemo<SheetColumn<BoxPortRow>[]>(() => [
    { key: 'box', title: 'Box', width: 90, get: (r) => r.eq.tag, render: (r) => <b>{r.eq.tag}</b> },
    { key: 'room', title: 'Room', width: 110, get: (r) => r.eq.room ?? '' },
    { key: 'jack', title: 'Jack', width: 150, get: (r) => r.jack },
    { key: 'type', title: 'Type', width: 120, get: (r) => CLASS_NAME[r.cls] },
    { key: 'number', title: 'Number', width: 90, get: (r) => r.number, set: () => { /* commit */ },
      render: (r) => <span className={r.duplicate ? 'bp-dup' : ''} title={r.duplicate ? 'Used by another jack too' : undefined}>{r.number || <span className="muted">—</span>}</span> },
    { key: 'locked', title: 'Locked', width: 80, align: 'center', get: (r) => (r.locked ? '✓' : ''), set: () => { /* commit */ },
      render: (r) => (r.number ? <span className={`pull-check bp-lock ${r.locked ? 'on' : ''}`} title={r.locked ? 'Locked – Renumber keeps it. Click to unlock.' : 'Automatic – Renumber may change it. Click to lock.'}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); useStore.getState().apply(r.locked ? 'Unlock Port Number' : 'Lock Port Number', (d) => setPortLock(d, r.eq.id, r.port.id, !r.locked)) }}>{r.locked ? '✓' : ''}</span> : null) },
    { key: 'front', title: 'Plugged in front', width: 170, get: (r) => r.front },
    { key: 'rear', title: 'Tie line to', width: 170, get: (r) => r.rear },
    { key: 'multipin', title: 'Multipin', width: 120, get: (r) => r.multipin },
  ], [])

  const commit = useCallback((label: string, changes: { row: BoxPortRow; col: SheetColumn<BoxPortRow>; value: string }[]) => {
    apply(label === 'Edit Number' ? 'Port Number' : label, (d) => {
      for (const ch of changes) {
        if (ch.col.key === 'number') setPortNumber(d, ch.row.eq.id, ch.row.port.id, ch.value)
        else if (ch.col.key === 'locked') setPortLock(d, ch.row.eq.id, ch.row.port.id, YES.test(ch.value.trim()))
      }
    })
  }, [apply])

  const fillRun = (first: string) => {
    const target = picked.length > 1 ? picked : rows
    const nums = numberSeries(first, target.length)
    apply(`Number ${target.length} Ports`, (d) => target.forEach((r, i) => setPortNumber(d, r.eq.id, r.port.id, nums[i])))
    notify(`Numbered ${target.length} jack${target.length === 1 ? '' : 's'} ${nums[0]}–${nums[nums.length - 1]} (locked)`, { undo: true, kind: 'success' })
    setSeries(null)
  }

  return (
    <>
      <div className="schedule-bar">
        <input type="search" placeholder="Filter boxes, jacks, numbers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cls} onChange={setCls} options={[{ value: '', label: 'All jack types' }, ...classes.map((c) => ({ value: c, label: CLASS_NAME[c] }))]} />
        <span className="muted small">{picked.length > 1 ? `${picked.length} rows selected` : `${rows.length} jack${rows.length === 1 ? '' : 's'}`}{dups ? <span className="bp-dup"> · {dups} clashing</span> : null}</span>
        <span className="spacer" />
        {series == null
          ? <button disabled={!rows.length} onClick={() => setSeries(rows[0]?.number || 'M1')} title="Give the selected rows (or every row shown) a run of numbers, e.g. M17, M18, M19…">Number {picked.length > 1 ? 'Selected' : 'Shown'}…</button>
          : <span className="fb-pop">
              First <input className="mono" autoFocus value={series} style={{ width: 80 }} onChange={(e) => setSeries(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && series.trim()) fillRun(series); if (e.key === 'Escape') setSeries(null) }} />
              <span className="muted small">→ {numberSeries(series || 'M1', Math.max(1, picked.length > 1 ? picked.length : rows.length)).slice(-1)[0]}</span>
              <button className="primary" disabled={!series.trim()} onClick={() => fillRun(series)}>Fill</button>
              <button onClick={() => setSeries(null)}>Cancel</button>
            </span>}
        <button disabled={!on} onClick={() => {
          let n = 0
          apply('Renumber Box Ports', (d) => { n = numberBoxPorts(d, { all: true }) })
          const locked = all.filter((r) => r.locked).length
          notify(n ? `Renumbered ${n} jack${n === 1 ? '' : 's'} around ${locked} locked number${locked === 1 ? '' : 's'}` : locked ? 'Already in order – the unlocked jacks already follow your locked numbers' : 'Already in order – lock a number (type it in) and the jacks after it follow on from it', { undo: n > 0, kind: n ? 'success' : 'info' })
        }}
          title="Number every unlocked jack again, box by box in tag order. Jacks after a locked number carry on from it (lock M17 → the next ones become M18, M19…)">Renumber Unlocked</button>
        <button onClick={() => useStore.getState().set({ editingNumbering: true })} title="Prefixes (M, L, D…), digits and start for each jack type">Numbering Standards…</button>
      </div>
      {!on && (
        <div className="bp-off">
          Box port numbering is off – jacks keep their own names. You can still type numbers here, or
          <button className="link" onClick={() => useStore.getState().set({ editingNumbering: true })}>turn it on</button> in Numbering Standards → Box ports to number everything automatically.
        </div>
      )}
      <Sheet rows={rows} columns={columns} rowKey={(r) => r.key} commit={commit} onSelectionChange={setPicked}
        rowClass={(r) => (r.duplicate ? 'err' : '')}
        emptyText="No wall boxes, plates, floor boxes or connector panels yet. Add one from the library (＋ New → Wall Box…)." />
    </>
  )
}

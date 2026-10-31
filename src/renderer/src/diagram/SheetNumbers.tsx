import { useState } from 'react'
import { autoNumber, defaultNumbering, GENERAL_PAGE, groupsOf, pageNumbers, viewsOf, type SheetNumbering } from '@core/index'
import { useStore } from '../store'
import { Modal, NumberInput, Toggle } from '../components/ui'

/**
 * Page numbers for the wiring diagram: automatic prefix + start (AV101,
 * AV102…) and a custom number on any page or signal view. They show on the
 * page tabs, in the title block's SHEET box and in off-sheet references.
 */
export function SheetNumbersDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const saved = project.diagram?.numbering
  const [on, setOn] = useState(!!saved)
  const [n, setN] = useState<SheetNumbering>(saved ?? defaultNumbering())
  const general = project.equipment.some((e) => !e.groupId || !groupsOf(project).some((g) => g.id === e.groupId)) || !groupsOf(project).length
  const rows = [
    ...groupsOf(project).map((g) => ({ id: g.id, name: g.name, kind: 'Page', custom: g.number ?? '' })),
    ...(general ? [{ id: GENERAL_PAGE, name: groupsOf(project).length ? 'Not on a page (General)' : 'Wiring diagram', kind: 'Sheet', custom: project.diagram?.generalNumber ?? '' }] : []),
    ...viewsOf(project).map((v) => ({ id: v.id, name: v.name, kind: 'View', custom: v.number ?? '' })),
  ]
  const [custom, setCustom] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.id, r.custom])))
  const auto = (i: number) => (on ? autoNumber(n, i) : '')
  const clash = (() => {
    const seen = new Map<string, number>()
    rows.forEach((r, i) => { const v = (custom[r.id]?.trim() || auto(i)).toUpperCase(); if (v) seen.set(v, (seen.get(v) ?? 0) + 1) })
    return new Set([...seen].filter(([, c]) => c > 1).map(([k]) => k))
  })()

  const save = () => {
    apply('Sheet Numbers', (d) => {
      d.diagram = { ...(d.diagram ?? {}), numbering: on ? { prefix: n.prefix.trim(), start: n.start, step: Math.max(1, n.step) } : undefined }
      for (const g of groupsOf(d)) g.number = custom[g.id]?.trim() || undefined
      for (const v of viewsOf(d)) v.number = custom[v.id]?.trim() || undefined
      d.diagram.generalNumber = custom[GENERAL_PAGE]?.trim() || undefined
    })
    const nums = pageNumbers(useStore.getState().project)
    useStore.getState().notify(nums.size ? `Numbered ${nums.size} sheet${nums.size === 1 ? '' : 's'}` : 'Page numbers off', { kind: 'success', undo: true })
    onClose()
  }

  return (
    <Modal title="Sheet Numbers" onClose={onClose} footer={<>
      {clash.size > 0 && <span className="error-text small">Duplicate: {[...clash].join(', ')}</span>}
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <button className="primary" onClick={save}>Save</button>
    </>}>
      <div className="form sheetnums">
        <p className="muted small" style={{ marginTop: 0 }}>Numbers show on the page tabs, in the title block’s SHEET box and in off-sheet arrows (“SHT AV102”).</p>
        <Toggle label="Number pages automatically" checked={on} onChange={setOn} />
        {on && (
          <div className="row-gap sn-auto">
            <label>Prefix <input value={n.prefix} onChange={(e) => setN({ ...n, prefix: e.target.value.toUpperCase() })} style={{ width: 70 }} placeholder="AV" /></label>
            <label>Start <NumberInput value={n.start} min={0} width={70} onCommit={(v) => setN({ ...n, start: v ?? n.start })} /></label>
            <label>Step <NumberInput value={n.step} min={1} width={50} onCommit={(v) => setN({ ...n, step: v ?? n.step })} /></label>
            <span className="muted small">→ {autoNumber(n, 0)}, {autoNumber(n, 1)}, {autoNumber(n, 2)}…</span>
          </div>
        )}
        <table className="sn-table">
          <thead><tr><th>Sheet</th><th>Number</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const val = (custom[r.id]?.trim() || auto(i)).toUpperCase()
              return (
                <tr key={r.id}>
                  <td><span className="muted small">{r.kind}</span> {r.name}</td>
                  <td>
                    <input className={val && clash.has(val) ? 'invalid' : ''} value={custom[r.id] ?? ''} placeholder={auto(i) || 'none'}
                      onChange={(e) => setCustom({ ...custom, [r.id]: e.target.value.toUpperCase() })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted small">Leave a number empty to use the automatic one. Type your own (e.g. AV201, E-001) for any page.</p>
      </div>
    </Modal>
  )
}

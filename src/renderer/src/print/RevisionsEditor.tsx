import { newId, type Revision } from '@core/index'
import { useStore } from '../store'

const nextRev = (revs: Revision[]) => {
  const last = revs[revs.length - 1]?.rev?.trim()
  if (!last) return 'A'
  if (/^\d+$/.test(last)) return String(Number(last) + 1)
  if (/^[A-Y]$/i.test(last)) return String.fromCharCode(last.toUpperCase().charCodeAt(0) + 1)
  return `${last}.1`
}

/** Revision history: Rev / Date / Description / By. Printed above the title block (latest 6). */
export function RevisionsEditor() {
  const revs = useStore((s) => s.project.revisions)
  const designer = useStore((s) => s.project.info.designer)
  const apply = useStore((s) => s.apply)
  const list = revs ?? []
  const upd = (id: string, patch: Partial<Revision>) => apply('Edit Revision', (d) => { const r = d.revisions?.find((x) => x.id === id); if (r) Object.assign(r, patch) })
  return (
    <div className="rev-editor">
      {list.length > 0 && (
        <table>
          <thead><tr><th>Rev</th><th>Date</th><th>Description</th><th>By</th><th /></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><input defaultValue={r.rev} onBlur={(e) => e.target.value !== r.rev && upd(r.id, { rev: e.target.value })} style={{ width: 34 }} /></td>
                <td><input defaultValue={r.date} onBlur={(e) => e.target.value !== r.date && upd(r.id, { date: e.target.value })} style={{ width: 78 }} /></td>
                <td><input defaultValue={r.description} placeholder="What changed" onBlur={(e) => e.target.value !== r.description && upd(r.id, { description: e.target.value })} /></td>
                <td><input defaultValue={r.by} onBlur={(e) => e.target.value !== r.by && upd(r.id, { by: e.target.value })} style={{ width: 46 }} /></td>
                <td><button className="mini danger" title="Remove" onClick={() => apply('Remove Revision', (d) => { d.revisions = (d.revisions ?? []).filter((x) => x.id !== r.id) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="mini" onClick={() => apply('Add Revision', (d) => {
        const r: Revision = { id: newId(), rev: nextRev(d.revisions ?? []), date: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), description: '', by: initials(designer) }
        d.revisions = [...(d.revisions ?? []), r]
      })}>+ Add Revision</button>
      <p className="muted small">The latest revision shows in the title block's REV box. Place a Δ revision note on the diagram with ＋ Note.</p>
    </div>
  )
}

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join('')

import { autoLayout, layoutView, nodeGeom, type Project } from '@core/index'
import { useStore } from '../store'

export { nodeGeom }

/** Re-arranges the diagram (or just the selected devices) by signal flow. */
export function tidyDiagram(opts: { selectionOnly?: boolean; amend?: boolean } = {}) {
  const s = useStore.getState()
  const only = opts.selectionOnly && s.selection.length > 1 ? new Set<string>(s.selection) : undefined
  if (s.diagramView) {
    // A signal view has its own layout.
    let n = 0
    const fn = (d: Project) => { n = layoutView(d, s.diagramView!, nodeGeom, { only }) }
    if (opts.amend) s.amend(fn); else s.apply(only ? 'Tidy Selection' : 'Tidy View', fn)
    return n
  }
  const pos = autoLayout(s.project, nodeGeom, { only })
  if (!pos.size) return 0
  const fn = (d: Project) => { for (const e of d.equipment) { const p = pos.get(e.id); if (p) e.position = p } }
  if (opts.amend) s.amend(fn); else s.apply(only ? 'Tidy Selection' : 'Tidy Diagram', fn)
  return pos.size
}

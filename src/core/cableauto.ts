// Picking cable types for wired connections: the best-fitting cable for each
// cable that is TBD (or whose cable doesn't fit its ports), and the types that
// fit a whole selection at once.

import type { Cable, CableId, Project } from './model'
import { cableSpec, fittingCables, orientation, type CableSpec } from './cables'
import { resolve } from './project'

/** Cable types that fit this cable's two ports, best fit first (always at least the made-to-order one). */
export function cableChoices(p: Project, c: Cable): CableSpec[] {
  const a = resolve(p, c.from), b = resolve(p, c.to)
  return a && b ? fittingCables(a.port, b.port) : []
}

/** Is the cable's type missing, or one that doesn't fit its ports? */
export function needsCableType(p: Project, c: Cable): boolean {
  const spec = cableSpec(c.specKey)
  if (!spec) return true
  const a = resolve(p, c.from), b = resolve(p, c.to)
  return !!a && !!b && orientation(spec, a.port, b.port) == null
}

/**
 * Sets the best-fitting cable type on these cables (default: every cable that is
 * TBD or doesn't fit). With `all`, cables that already fit are re-picked too.
 * Returns how many changed.
 */
export function autoCableTypes(p: Project, ids?: CableId[], all = false): number {
  let n = 0
  for (const c of p.cables) {
    if (ids && !ids.includes(c.id)) continue
    if (!all && !needsCableType(p, c)) continue
    const best = cableChoices(p, c)[0]
    if (best && best.key !== c.specKey) { c.specKey = best.key; n++ }
  }
  return n
}

/** Cable types that fit every one of these cables (for setting a selection in one go), best fits first. */
export function commonCableChoices(p: Project, ids: CableId[]): CableSpec[] {
  const lists = p.cables.filter((c) => ids.includes(c.id)).map((c) => cableChoices(p, c))
  if (!lists.length) return []
  const [first, ...rest] = lists
  return first.filter((s) => rest.every((l) => l.some((x) => x.key === s.key)))
}

// Patch multiples: wire an ordered list of ports onto consecutive ports of a target device.

import { cardSide } from './diagramgeom'
import { addrKey, type CableId, type PortAddress, type Project } from './model'
import { connect } from './project'
import { validate } from './validation/validator'

export interface BulkResult {
  made: { cable: CableId; from: PortAddress; to: PortAddress }[]
  /** Sources that found no free, valid port on the target device. */
  skipped: PortAddress[]
}

/**
 * Connects `sources` (in order) to `firstTarget` and the ports after it on the
 * same device. Each source takes the next target port that is free, faces the
 * same way as `firstTarget`, and passes validation; incompatible or occupied
 * ports are skipped over. Runs inside one project mutation (one undo step).
 */
/** `only`: restrict targets to these port ids (e.g. the ports shown on a signal view). */
export function connectMany(p: Project, sources: PortAddress[], firstTarget: PortAddress, only?: Set<string>): BulkResult {
  const result: BulkResult = { made: [], skipped: [] }
  const eq = p.equipment.find((e) => e.id === firstTarget.equipment)
  if (!eq) return { made: [], skipped: [...sources] }
  // Cascade down the card: the ports on the same side of the device, in the order they're drawn.
  const ports = cardSide(eq, firstTarget.port)
  const start = ports.findIndex((x) => x.id === firstTarget.port)
  if (start < 0) return { made: [], skipped: [...sources] }
  const first = ports[start]
  const srcKeys = new Set(sources.map(addrKey))
  const seen = new Set<string>()
  // Stay on the same side as the first port: same direction and panel face
  // (so on a two-sided patch panel, rear stays rear and front stays front).
  const queue = ports.slice(start).filter((x, i) => i === 0 || (x.direction === first.direction && x.face === first.face && (!only || only.has(x.id))))
  let cursor = 0
  for (const src of sources) {
    const k = addrKey(src)
    if (seen.has(k)) continue
    seen.add(k)
    // Try ports from the cursor on; only a successful connection moves the cursor,
    // so a source that can't go anywhere doesn't eat the remaining target ports.
    let placed = false
    for (let j = cursor; j < queue.length; j++) {
      const to: PortAddress = { equipment: eq.id, port: queue[j].id }
      if (srcKeys.has(addrKey(to))) continue
      if (!validate(p, src, to).allowed) continue
      const v = connect(p, src, to)
      if (v.cableId) { result.made.push({ cable: v.cableId, from: src, to }); cursor = j + 1; placed = true; break }
    }
    if (!placed) result.skipped.push(src)
  }
  return result
}

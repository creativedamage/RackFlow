// Patch multiples: wire an ordered list of ports onto consecutive ports of a target device.

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
export function connectMany(p: Project, sources: PortAddress[], firstTarget: PortAddress): BulkResult {
  const result: BulkResult = { made: [], skipped: [] }
  const eq = p.equipment.find((e) => e.id === firstTarget.equipment)
  if (!eq) return { made: [], skipped: [...sources] }
  const ports = eq.product.ports
  const start = ports.findIndex((x) => x.id === firstTarget.port)
  if (start < 0) return { made: [], skipped: [...sources] }
  const dir = ports[start].direction
  const srcKeys = new Set(sources.map(addrKey))
  const seen = new Set<string>()
  const queue = ports.slice(start).filter((x, i) => i === 0 || x.direction === dir)
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

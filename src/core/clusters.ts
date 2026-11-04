// Device groups: a named box drawn on the diagram (right-click › Add Group, then
// drag out the box). Whatever devices sit inside the box are in the group; drag a
// device in or out to change that. Moving the box moves what's in it; its corners
// resize it. A box belongs to the page or signal view it was drawn on.

import { newId, type Cluster, type EquipmentInstance, type Project } from './model'
import { NODE_WIDTH, nodeGeom } from './diagramgeom'

export const CLUSTER_COLORS = ['#5c7cfa', '#20c997', '#f59f00', '#e64980', '#7950f2', '#15aabf', '#82c91e', '#fd7e14', '#868e96']

export const clustersOf = (p: Project): Cluster[] => p.clusters ?? []
export const clusterColor = (p: Project, c: Cluster) => c.color ?? CLUSTER_COLORS[Math.max(0, clustersOf(p).indexOf(c)) % CLUSTER_COLORS.length]

const nextName = (p: Project) => { let n = clustersOf(p).length + 1; while (clustersOf(p).some((c) => c.name === `Group ${n}`)) n++; return `Group ${n}` }

/** Adds a group box. `scope` is the page or view it is drawn on (null = All pages). */
export function addCluster(p: Project, rect: { x: number; y: number; w: number; h: number }, scope: string | null, name?: string): Cluster {
  const c: Cluster = { id: newId(), name: name?.trim() || nextName(p), scope, x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(120, Math.round(rect.w)), h: Math.max(80, Math.round(rect.h)) }
  p.clusters = [...clustersOf(p), c]
  return c
}

export function deleteCluster(p: Project, id: string) {
  p.clusters = clustersOf(p).filter((c) => c.id !== id)
  if (!p.clusters.length) delete p.clusters
}

export function renameCluster(p: Project, id: string, name: string) {
  const c = clustersOf(p).find((x) => x.id === id)
  if (c && name.trim()) c.name = name.trim()
}

/** Is a box shown here? Boxes drawn on a page also show on All pages; view boxes only in their view. */
export function clusterShownIn(c: Cluster, here: { page: string | null; view: string | null }, viewIds: Set<string>): boolean {
  const scope = c.scope ?? null
  if (here.view) return scope === here.view
  if (scope && viewIds.has(scope)) return false
  return here.page ? scope === here.page || scope === null : true
}

/** The box itself, or – for a group made before boxes were drawn – a box round its devices. */
export function clusterRect(p: Project, c: Cluster): { x: number; y: number; w: number; h: number } {
  if (c.w && c.h) return { x: c.x ?? 0, y: c.y ?? 0, w: c.w, h: c.h }
  const ms = p.equipment.filter((e) => e.cluster === c.id)
  if (!ms.length) return { x: 0, y: 0, w: 400, h: 300 }
  const x0 = Math.min(...ms.map((e) => e.position.x)) - 30, y0 = Math.min(...ms.map((e) => e.position.y)) - 50
  const x1 = Math.max(...ms.map((e) => e.position.x + NODE_WIDTH)) + 30, y1 = Math.max(...ms.map((e) => e.position.y + nodeGeom(e).height)) + 30
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** A device is in a box when its centre is inside it. */
export const insideRect = (r: { x: number; y: number; w: number; h: number }, pos: { x: number; y: number }, size: { w: number; h: number }) => {
  const cx = pos.x + size.w / 2, cy = pos.y + Math.min(size.h / 2, 60)
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
}

/**
 * Which group each device is in, for devices laid out as given (a page's
 * positions, or a view's). The smallest box wins when boxes overlap.
 */
export function clusterMembership(p: Project, eqs: EquipmentInstance[], scope: { page: string | null; view: string | null }, viewIds: Set<string>): Map<string, string> {
  const boxes = clustersOf(p).filter((c) => clusterShownIn(c, scope, viewIds)).map((c) => ({ c, r: clusterRect(p, c) })).sort((a, b) => a.r.w * a.r.h - b.r.w * b.r.h)
  const out = new Map<string, string>()
  for (const e of eqs) {
    const size = { w: NODE_WIDTH, h: nodeGeom(e).height }
    const hit = boxes.find((b) => insideRect(b.r, e.position, size))
    if (hit) out.set(e.id, hit.c.id)
  }
  return out
}

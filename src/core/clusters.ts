// Device groups: a named box drawn round a set of devices wherever they appear
// (any page or signal view), and on the printed drawing instead of room zones.

import { newId, type Cluster, type Project } from './model'

export const CLUSTER_COLORS = ['#5c7cfa', '#20c997', '#f59f00', '#e64980', '#7950f2', '#15aabf', '#82c91e', '#fd7e14', '#868e96']

export const clustersOf = (p: Project): Cluster[] => p.clusters ?? []
export const clusterColor = (p: Project, c: Cluster) => c.color ?? CLUSTER_COLORS[Math.max(0, clustersOf(p).indexOf(c)) % CLUSTER_COLORS.length]

const nextName = (p: Project) => { let n = clustersOf(p).length + 1; while (clustersOf(p).some((c) => c.name === `Group ${n}`)) n++; return `Group ${n}` }

/** Makes a group from these devices (taking them out of any other group). */
export function newCluster(p: Project, ids: string[], name?: string): Cluster {
  const c: Cluster = { id: newId(), name: name?.trim() || nextName(p) }
  p.clusters = [...clustersOf(p), c]
  setCluster(p, ids, c.id)
  return c
}

/** Puts devices in a group (null = in no group). Groups left empty are removed. */
export function setCluster(p: Project, ids: string[], clusterId: string | null) {
  for (const e of p.equipment) if (ids.includes(e.id)) { if (clusterId) e.cluster = clusterId; else delete e.cluster }
  pruneClusters(p)
}

/** Deletes a group; its devices stay where they are, just ungrouped. */
export function deleteCluster(p: Project, id: string) {
  for (const e of p.equipment) if (e.cluster === id) delete e.cluster
  p.clusters = clustersOf(p).filter((c) => c.id !== id)
}

export function renameCluster(p: Project, id: string, name: string) {
  const c = clustersOf(p).find((x) => x.id === id)
  if (c && name.trim()) c.name = name.trim()
}

/** Drops groups with no devices, and device links to groups that no longer exist. */
export function pruneClusters(p: Project) {
  const used = new Set(p.equipment.map((e) => e.cluster).filter(Boolean))
  p.clusters = clustersOf(p).filter((c) => used.has(c.id))
  const ok = new Set(p.clusters.map((c) => c.id))
  for (const e of p.equipment) if (e.cluster && !ok.has(e.cluster)) delete e.cluster
  if (!p.clusters.length) delete p.clusters
}

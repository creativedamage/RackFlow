// Signal views: extra diagram pages that show devices from the main diagram
// but only the ports and cables of chosen signal types (e.g. an "Audio Tie
// Lines" page with just the wall plates, floor boxes and patch bays and their
// audio ports). Devices stay on the main diagram with every port; a view only
// references them and keeps its own layout.

import { autoLayout, freeSpot, type NodeGeom } from './autolayout'
import { newId, type CanvasPoint, type EquipmentInstance, type PortTemplate, type Project } from './model'
import { SIGNALS, type SignalDomain } from './signals'

export interface SignalView {
  id: string
  name: string
  /** Signal types shown (ports carrying any of these). */
  domains: SignalDomain[]
  /** Auto: every device with a matching port, minus `exclude`, plus `include`. Manual: just `include`. */
  auto: boolean
  include: string[]
  exclude: string[]
  /** This view's own layout (device id → position). */
  positions: Record<string, CanvasPoint>
  /** Hide ports that have no cable (keeps big patch bays readable). */
  hideUnused?: boolean
  /** Custom sheet number; empty = automatic. */
  number?: string
  /** Exact ports shown per device (device id → port ids); devices not listed use the signal match. */
  ports?: Record<string, string[]>
  /** Card size per device in this view (small = drawing only, full = large drawing). */
  sizes?: Record<string, 'small' | 'medium' | 'full'>
}

export const viewsOf = (p: Project): SignalView[] => p.views ?? []
export const isViewId = (p: Project, id: string | undefined | null) => !!id && viewsOf(p).some((v) => v.id === id)

/**
 * A port matches the view when its main (first) signal is one of the view's
 * types – so a Dante / AES67 network port or a combo jack doesn't slip into an
 * Audio view just because it can also carry audio.
 */
export const portInView = (port: PortTemplate, domains: SignalDomain[]) => !!port.signals[0] && domains.includes(SIGNALS[port.signals[0]]?.domain)

/** Ports of a device shown in the view: its exact pick, else the signal match. */
export function viewPortIds(v: Pick<SignalView, 'domains' | 'ports'>, e: EquipmentInstance): Set<string> {
  const pick = v.ports?.[e.id]
  return new Set(pick ? pick.filter((id) => e.product.ports.some((x) => x.id === id)) : e.product.ports.filter((x) => portInView(x, v.domains)).map((x) => x.id))
}

/** Hide / show single ports of a device in a view (turns the device into an exact pick). */
export function setPortsInView(p: Project, viewId: string, eqId: string, portIds: string[], on: boolean) {
  const v = viewsOf(p).find((x) => x.id === viewId)
  const e = p.equipment.find((x) => x.id === eqId)
  if (!v || !e) return
  const cur = viewPortIds(v, e)
  for (const id of portIds) { if (on) cur.add(id); else cur.delete(id) }
  v.ports = { ...(v.ports ?? {}), [eqId]: e.product.ports.filter((x) => cur.has(x.id)).map((x) => x.id) }
}

/** Devices that have at least one port of the view's signal types. */
export const viewCandidates = (p: Project, v: Pick<SignalView, 'domains'>) =>
  p.equipment.filter((e) => e.product.ports.some((x) => portInView(x, v.domains)))

export function viewMembers(p: Project, v: SignalView): EquipmentInstance[] {
  const inc = new Set(v.include), exc = new Set(v.exclude)
  const auto = v.auto ? new Set(viewCandidates(p, v).map((e) => e.id as string)) : new Set<string>()
  return p.equipment.filter((e) => inc.has(e.id) || (auto.has(e.id) && !exc.has(e.id)))
}

/** Adds / removes devices from a view (works for auto and manual views). */
export function setInView(p: Project, viewId: string, ids: string[], on: boolean) {
  const v = viewsOf(p).find((x) => x.id === viewId)
  if (!v) return
  const cand = new Set(viewCandidates(p, v).map((e) => e.id as string))
  for (const id of ids) {
    v.include = v.include.filter((x) => x !== id)
    v.exclude = v.exclude.filter((x) => x !== id)
    if (on && !(v.auto && cand.has(id))) v.include.push(id)
    if (!on && v.auto && cand.has(id)) v.exclude.push(id)
    if (!on) delete v.positions[id]
  }
}

/**
 * The view as a stand-alone project: members only, their ports filtered to the
 * view's signals, positioned by the view's layout, and only cables whose both
 * ends are visible. Used for the on-screen view, Tidy and printing.
 */
export function viewProject(p: Project, v: SignalView): Project {
  const members = viewMembers(p, v)
  const wired = new Set(v.hideUnused ? p.cables.flatMap((c) => [`${c.from.equipment}/${c.from.port}`, `${c.to.equipment}/${c.to.port}`]) : [])
  const equipment = members.map((e): EquipmentInstance => ({
    ...e,
    groupId: undefined,
    nodeSize: v.sizes?.[e.id],
    position: v.positions[e.id] ?? e.position,
    product: { ...e.product, ports: ((ids) => e.product.ports.filter((x) => ids.has(x.id) && (!v.hideUnused || wired.has(`${e.id}/${x.id}`))))(viewPortIds(v, e)) },
  }))
  const ports = new Map(equipment.map((e) => [e.id as string, new Set(e.product.ports.map((x) => x.id))]))
  const visible = (a: { equipment: string; port: string }) => !!ports.get(a.equipment)?.has(a.port)
  return {
    ...p,
    equipment,
    cables: p.cables.filter((c) => visible(c.from) && visible(c.to)),
    groups: [],
    annotations: (p.annotations ?? []).filter((a) => a.page === v.id),
  }
}

/** Wires from a visible port to a device that isn't in the view: "label ▸ TAG · Port". */
export function viewOffFlags(p: Project, v: SignalView): Map<string, Record<string, string>> {
  const vp = viewProject(p, v)
  const shown = new Map(vp.equipment.map((e) => [e.id as string, new Set(e.product.ports.map((x) => x.id))]))
  const out = new Map<string, Record<string, string>>()
  for (const c of p.cables) {
    for (const [here, there] of [[c.from, c.to], [c.to, c.from]] as const) {
      if (!shown.get(here.equipment)?.has(here.port) || shown.get(there.equipment)?.has(there.port)) continue
      const te = p.equipment.find((e) => e.id === there.equipment)
      const tp = te?.product.ports.find((x) => x.id === there.port)
      if (!te) continue
      out.set(here.equipment, { ...(out.get(here.equipment) ?? {}), [here.port]: `${c.label} ▸ ${te.tag} · ${tp?.label ?? ''}` })
    }
  }
  return out
}

/** Lays the view out by signal flow (all members, or only those without a position yet). */
export function layoutView(p: Project, viewId: string, geom: (eq: EquipmentInstance) => NodeGeom, opts: { onlyNew?: boolean; only?: Set<string> } = {}) {
  const v = viewsOf(p).find((x) => x.id === viewId)
  if (!v) return 0
  const vp = viewProject(p, v)
  const only = opts.only ?? (opts.onlyNew ? new Set(vp.equipment.filter((e) => !v.positions[e.id]).map((e) => e.id as string)) : undefined)
  if (only && !only.size) return 0
  if (opts.onlyNew && only) {
    // New arrivals go into free space next to what's already laid out.
    const placed = vp.equipment.filter((e) => !only.has(e.id))
    if (placed.length) {
      for (const e of vp.equipment.filter((x) => only.has(x.id))) {
        const right = Math.max(...placed.map((x) => x.position.x + geom(x).width)) + 200
        const at = freeSpot(vp, geom(e), { x: right, y: Math.min(...placed.map((x) => x.position.y)) }, geom, { among: (x) => placed.includes(x), margin: 120 })
        v.positions[e.id] = at
        e.position = at
        placed.push(e)
      }
      return only.size
    }
  }
  // Leave room for the off-view flags beside ports (they'd otherwise overlap the next block).
  const flags = viewOffFlags(p, v)
  const reach = new Map(vp.equipment.map((e) => {
    const g = geom(e), r = { left: 0, right: 0 }
    for (const [port, text] of Object.entries(flags.get(e.id) ?? {})) {
      const w = 30 + text.length * 5.6
      if (g.port(port)?.side === 'left') r.left = Math.max(r.left, w); else r.right = Math.max(r.right, w)
    }
    return [e.id as string, r]
  }))
  const wide = (e: EquipmentInstance): NodeGeom => { const g = geom(e), r = reach.get(e.id); return r ? { ...g, width: g.width + r.left + r.right } : g }
  const pos = autoLayout(vp, wide, { only, keepGroups: false })
  for (const [id, at] of pos) v.positions[id] = { x: at.x + (reach.get(id)?.left ?? 0), y: at.y }
  return pos.size
}

export function createView(p: Project, init: Partial<SignalView> & { name: string; domains: SignalDomain[] }): SignalView {
  const v: SignalView = { id: newId(), auto: true, include: [], exclude: [], positions: {}, ...init }
  p.views = [...viewsOf(p), v]
  return v
}

/**
 * Copies a view – its signals, devices, picked ports, card sizes, layout and
 * notes – as "Name (copy)", placed right after the original. The copy gets
 * its own sheet number later (none at first).
 */
export function duplicateView(p: Project, id: string): SignalView | null {
  const all = viewsOf(p)
  const src = all.find((v) => v.id === id)
  if (!src) return null
  const names = new Set(all.map((v) => v.name))
  let name = `${src.name} (copy)`
  for (let i = 2; names.has(name); i++) name = `${src.name} (copy ${i})`
  // JSON copy: works on Immer drafts too (structuredClone can't copy a draft).
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
  const v: SignalView = { ...clone(src), id: newId(), name, number: undefined }
  const at = all.indexOf(src)
  p.views = [...all.slice(0, at + 1), v, ...all.slice(at + 1)]
  const notes = (p.annotations ?? []).filter((a) => a.page === id).map((a) => ({ ...clone(a), id: newId(), page: v.id }))
  if (notes.length) p.annotations = [...(p.annotations ?? []), ...notes]
  return v
}

export function deleteView(p: Project, id: string) {
  p.views = viewsOf(p).filter((v) => v.id !== id)
  p.annotations = (p.annotations ?? []).filter((a) => a.page !== id)
}

/** Drops references to deleted devices (call after deleting equipment). */
export function pruneViews(p: Project) {
  const ids = new Set(p.equipment.map((e) => e.id as string))
  for (const v of viewsOf(p)) {
    v.include = v.include.filter((x) => ids.has(x))
    v.exclude = v.exclude.filter((x) => ids.has(x))
    for (const k of Object.keys(v.positions)) if (!ids.has(k)) delete v.positions[k]
  }
}

/**
 * For printing: the view plus the far ends of wires that leave it (devices
 * outside the view, kept off the sheet) so those wires end in off-sheet arrows.
 */
export function viewPrintProject(p: Project, v: SignalView): { project: Project; ids: Set<string> } {
  // Printed blocks are always the standard size.
  const vp0 = viewProject(p, v)
  const vp = { ...vp0, equipment: vp0.equipment.map((e) => ({ ...e, nodeSize: undefined })) }
  const ids = new Set(vp.equipment.map((e) => e.id as string))
  const shown = new Map(vp.equipment.map((e) => [e.id as string, new Set(e.product.ports.map((x) => x.id))]))
  const vis = (a: { equipment: string; port: string }) => !!shown.get(a.equipment)?.has(a.port)
  const leaving = p.cables.filter((c) => vis(c.from) !== vis(c.to) && (ids.has(c.from.equipment) || ids.has(c.to.equipment)))
  const far = new Set(leaving.map((c) => (vis(c.from) ? c.to.equipment : c.from.equipment)))
  // A far end that is itself in the view (a hidden port of a member) stays as the member.
  const extra = p.equipment.filter((e) => far.has(e.id) && !ids.has(e.id))
  const known = new Set([...ids, ...extra.map((e) => e.id as string)])
  const cables = [...vp.cables, ...leaving.filter((c) => known.has(c.from.equipment) && known.has(c.to.equipment) && !(ids.has(c.from.equipment) && ids.has(c.to.equipment)))]
  return { project: { ...vp, equipment: [...vp.equipment, ...extra], cables }, ids }
}

/**
 * Pushes overlapping cards apart (downwards, keeping each column's order) on
 * every page and signal view. Used once when opening a project drawn with the
 * older, shorter device cards.
 */
export function spreadCards(p: Project, geom: (e: EquipmentInstance) => { width: number; height: number }): number {
  let moved = 0
  const spread = (items: { id: string; x: number; y: number; w: number; h: number; page: string }[], set: (id: string, y: number) => void) => {
    const placed: typeof items = []
    for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
      let y = it.y
      for (let again = true; again;) {
        again = false
        for (const q of placed) {
          if (q.page !== it.page) continue
          if (it.x < q.x + q.w + 8 && q.x < it.x + it.w + 8 && y < q.y + q.h + 8 && q.y < y + it.h + 8) { y = q.y + q.h + 30; again = true }
        }
      }
      if (y !== it.y) { set(it.id, y); moved++ }
      placed.push({ ...it, y })
    }
  }
  spread(p.equipment.map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, ...dims(geom(e)), page: e.groupId ?? '' })), (id, y) => { p.equipment.find((e) => e.id === id)!.position.y = y })
  for (const v of viewsOf(p)) {
    const vp = viewProject(p, v)
    spread(vp.equipment.map((e) => ({ id: e.id, x: e.position.x, y: e.position.y, ...dims(geom(e)), page: '' })), (id, y) => { v.positions[id] = { x: v.positions[id]?.x ?? vp.equipment.find((e) => e.id === id)!.position.x, y } })
  }
  return moved
}
const dims = (g: { width: number; height: number }) => ({ w: g.width, h: g.height })

/**
 * Runs `change` (e.g. a product edit that rebuilds the device's ports) and then
 * keeps the device where it was in every view: still a member, and with the
 * same ports picked – matched by id, else by label. A pick that no longer
 * matches anything falls back to the view's signal match instead of an empty card.
 */
export function keepInViews(p: Project, eqId: string, change: () => void) {
  const before = p.equipment.find((e) => e.id === eqId)
  const snap = viewsOf(p).map((v) => ({
    id: v.id,
    member: !!before && viewMembers(p, v).some((e) => e.id === eqId),
    pick: before && v.ports?.[eqId] ? v.ports[eqId].map((id) => ({ id, label: before.product.ports.find((x) => x.id === id)?.label })) : null,
  }))
  change()
  const after = p.equipment.find((e) => e.id === eqId)
  if (!after) return
  for (const s of snap) {
    const v = viewsOf(p).find((x) => x.id === s.id)
    if (!v) continue
    if (s.member && !viewMembers(p, v).some((e) => e.id === eqId)) setInView(p, v.id, [eqId], true)
    if (s.pick) {
      const ids = s.pick.map((q) => (after.product.ports.some((x) => x.id === q.id) ? q.id : after.product.ports.find((x) => q.label && x.label === q.label)?.id)).filter((x): x is string => !!x)
      const ports = { ...(v.ports ?? {}) }
      if (ids.length) ports[eqId] = [...new Set(ids)]; else delete ports[eqId]
      v.ports = ports
    }
  }
}

/** Deletes the cables drawn on a view (both ends visible there); cables on other signal types are kept. */
export function removeViewConnections(p: Project, viewId: string): number {
  const v = viewsOf(p).find((x) => x.id === viewId)
  if (!v) return 0
  const ids = new Set(viewProject(p, { ...v, hideUnused: false }).cables.map((c) => c.id))
  p.cables = p.cables.filter((c) => !ids.has(c.id))
  return ids.size
}

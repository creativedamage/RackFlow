// CAD-style printed wiring schematics: monochrome device blocks with tag,
// maker / model and type, connector badges on every port, wires with the
// cable number and FROM-TO tags at both ends, off-sheet arrows for long or
// cross-sheet runs, and dashed room zones.

import { viewPrintProject, viewsOf } from '../views'
import { CATEGORIES, type Annotation, type Cable, type EquipmentInstance, type PortTemplate, type Project, type WireMode } from '../model'
import { DOMAINS } from '../signals'
import { portDomain } from '../project'
import { planChannels, type ChannelWire } from '../autolayout'
import { headerHeight, NODE_WIDTH, nodeGeom, ROW_H, splitPorts } from '../diagramgeom'
import { crossings, route, WIRE_CLEAR, type Pt, type Rect } from '../wireroute'
import { groupsOf } from '../groups'
import { newSheet, sheetSize, type SheetOptions } from './sheet'
import { Svg, textWidth } from './svg'

export interface SchematicOptions extends SheetOptions {
  wires: WireMode
  /** One sheet for everything, or one per group / room. */
  split: 'none' | 'group' | 'room'
  rooms: boolean
  color: boolean
  /** Signal views to add as extra sheets (undefined = all of them). */
  views?: string[]
}

export const defaultSchematic = (p?: Project): SchematicOptions => ({
  sheet: 'archD', titleBlock: true, title: 'SIGNAL FLOW', wires: p?.diagram?.wires === 'all' ? 'all' : 'smart', split: p?.groups?.length ? 'group' : 'none', rooms: true, color: false,
})

const BADGE = 22      // connector badge width (px, diagram units)
const STUB = 70       // off-sheet stub length
const SMART_LEN = 1400

/** Short connector names for the badges ("BNC", "HDMI", "RJ45"…). */
export function connectorBadge(c: PortTemplate['connector']): string {
  const m: Record<string, string> = {
    hdmi: 'HDMI', displayPort: 'DP', dvi: 'DVI', bnc: 'BNC', hd15: 'VGA', xlr3: 'XLR', miniXlr: 'TA3', trs6_35: 'TRS', trs3_5: '3.5', bantamTT: 'TT', rca: 'RCA',
    speakonNL2: 'NL2', speakonNL4: 'NL4', euroblock: 'PHX', bindingPost: 'BP', rj45: 'RJ45', etherCON: 'ECON', lcDuplex: 'LC', scDuplex: 'SC', opticalCON: 'OCON',
    usbA: 'USB', usbB: 'USB', usbC: 'USBC', db9: 'DB9', db25: 'DB25', idcPunchdown: 'IDC', xlr5: 'XLR5', lemo: 'LEMO', smpteFiber: 'SMPT', sma: 'SMA', tnc: 'TNC',
    iecC13C14: 'IEC', iecC19C20: 'C20', powerCON: 'PCON', powerCONTrue1: 'TRU1', dcBarrel: 'DC', xlr4: 'XLR4', camlok: 'CAM', schuko: 'SCH',
  }
  return m[c] ?? (c.startsWith('nema') ? c.replace('nema', '').replace('_', '-').toUpperCase() : c.slice(0, 4).toUpperCase())
}

const compactTag = (t: string) => t.replace(/[^A-Za-z0-9]/g, '')
const portRef = (eq: EquipmentInstance, port: PortTemplate) => `${eq.tag} ${port.label}`.toUpperCase()

interface Page { title: string; ids: Set<string>; pageId?: string | null }

export function schematicSheets(p0: Project, o: SchematicOptions): string[] {
  if (!p0.equipment.length) return []
  // Notes placed on signal views print on those views' sheets only.
  const views = viewsOf(p0).filter((v) => !o.views || o.views.includes(v.id))
  const viewIds = new Set(viewsOf(p0).map((v) => v.id))
  const p: Project = { ...p0, annotations: (p0.annotations ?? []).filter((a) => !a.page || !viewIds.has(a.page)) }
  // Pages
  let pages: Page[]
  if (o.split === 'group') {
    const gs = groupsOf(p)
    pages = gs.map((g) => ({ title: g.name.toUpperCase(), pageId: g.id, ids: new Set(p.equipment.filter((e) => e.groupId === g.id).map((e) => e.id as string)) }))
    const rest = p.equipment.filter((e) => !e.groupId || !gs.some((g) => g.id === e.groupId))
    if (rest.length || (p.annotations ?? []).some((a) => !a.page || !gs.some((g) => g.id === a.page))) pages.push({ title: 'GENERAL', pageId: null, ids: new Set(rest.map((e) => e.id as string)) })
  } else if (o.split === 'room') {
    const rooms = [...new Set(p.equipment.map((e) => e.room?.trim() || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b))
    pages = rooms.map((r) => ({ title: (r || 'UNASSIGNED').toUpperCase(), ids: new Set(p.equipment.filter((e) => (e.room?.trim() || '') === r).map((e) => e.id as string)) }))
  } else pages = [{ title: '', ids: new Set(p.equipment.map((e) => e.id as string)) }]
  pages = pages.filter((pg) => pg.ids.size || notesFor(p, o, pg).length)
  const sheetOf = new Map<string, number>()
  pages.forEach((pg, i) => pg.ids.forEach((id) => sheetOf.set(id, i + 1)))
  const extra = views.map((v) => ({ v, ...viewPrintProject(p0, v) })).filter((x) => x.ids.size)
  const total = pages.length + extra.length
  return [
    ...pages.map((pg, i) => drawPage(p, o, pg, i + 1, total, sheetOf)),
    // Wires leaving a view end in arrows naming the device and the main sheet it's on.
    ...extra.map(({ v, project: vp, ids }, i) => drawPage(vp, { ...o, split: 'group' }, { title: v.name.toUpperCase(), pageId: v.id, ids }, pages.length + i + 1, total, sheetOf)),
  ]
}

/** How far wires, labels and off-sheet flags reach out of each side of a block (diagram units). */
export function sideReach(p: Project, e: EquipmentInstance, o: Pick<SchematicOptions, 'wires'>): { left: number; right: number } {
  let left = 0, right = 0
  for (const c of p.cables) {
    const mine = c.from.equipment === e.id ? c.from : c.to.equipment === e.id ? c.to : null
    if (!mine) continue
    const other = mine === c.from ? c.to : c.from
    const g = nodeGeom(e).port(mine.port)
    const oe = p.equipment.find((x) => x.id === other.equipment)
    const op = oe?.product.ports.find((x) => x.id === other.port)
    if (!g || !oe || !op) continue
    // Wire label ("V-0012" / "PB002-VSW001"); stubs add the stub and the flag naming the far end.
    const label = 84
    const flag = STUB + Math.max(40, textWidth(`${portRef(oe, op)} (SHT 99)`, 7.5) + 14)
    const r = o.wires === 'all' ? label : Math.max(label, flag)
    if (g.side === 'left') left = Math.max(left, r); else right = Math.max(right, r)
  }
  return { left, right }
}

const ZONE_PAD = 36 // room zone border distance from what it encloses

/**
 * Print positions: the diagram's layout, re-spaced so nothing crowds –
 * columns are pushed apart far enough for each side's wire labels and
 * off-sheet flags (and room borders between rooms), then blocks in a column
 * are pushed down so every block keeps its tag above and type line below.
 */
export function printPositions(p: Project, eqs: EquipmentInstance[], o: Pick<SchematicOptions, 'wires'> = { wires: 'smart' }): Map<string, { x: number; y: number }> {
  const H = (e: EquipmentInstance) => nodeGeom(e).height + 12 // box incl. the type line
  const reach = new Map(eqs.map((e) => [e.id as string, sideReach(p, e, o)]))
  const room = (e: EquipmentInstance) => e.room?.trim() ?? ''
  // 1. Columns: devices whose x is within 120 of each other move together.
  const byX = [...eqs].sort((a, b) => a.position.x - b.position.x)
  const cols: EquipmentInstance[][] = []
  for (const e of byX) {
    const c = cols[cols.length - 1]
    if (c && e.position.x - c[0].position.x < 120) c.push(e); else cols.push([e])
  }
  const shift = new Map<string, number>()
  let prevRight = -Infinity, prevRooms = new Set<string>(), prevReach = 0, offset = 0
  for (const c of cols) {
    const x0 = Math.min(...c.map((e) => e.position.x)) + offset
    const leftReach = Math.max(...c.map((e) => reach.get(e.id)!.left))
    const rooms = new Set(c.map(room))
    const roomGap = [...rooms].some((r) => !prevRooms.has(r)) || [...prevRooms].some((r) => !rooms.has(r)) ? ZONE_PAD * 2 + 20 : 0
    const need = prevRight + prevReach + BADGE * 2 + leftReach + 40 + roomGap
    if (x0 < need) offset += need - x0
    for (const e of c) shift.set(e.id, offset)
    prevRight = Math.max(...c.map((e) => e.position.x + offset + NODE_WIDTH))
    prevReach = Math.max(...c.map((e) => reach.get(e.id)!.right))
    prevRooms = rooms
  }
  // 2. Rows: push blocks down until they clear the ones above them.
  const order = [...eqs].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
  const placed: { e: EquipmentInstance; x: number; y: number }[] = []
  const out = new Map<string, { x: number; y: number }>()
  const pad = BADGE + 50
  for (const e of order) {
    let y = e.position.y
    const x = e.position.x + (shift.get(e.id) ?? 0)
    for (let again = true; again;) {
      again = false
      for (const q of placed) {
        if (!(x - pad < q.x + NODE_WIDTH + pad && q.x - pad < x + NODE_WIDTH + pad)) continue
        const gap = room(q.e) === room(e) ? 60 : 60 + ZONE_PAD * 2 + 30
        const bottom = q.y + H(q.e) + gap
        if (y + H(e) + gap > q.y && y < bottom) { y = bottom; again = true }
      }
    }
    placed.push({ e, x, y })
    out.set(e.id, { x, y })
  }
  return out
}

function drawPage(p0: Project, o: SchematicOptions, page: Page, n: number, total: number, sheetOf: Map<string, number>): string {
  const { svg, area } = newSheet(p0, o, n, total, page.title)
  // Work on a copy with print positions so blocks never crowd each other.
  const pos = printPositions(p0, p0.equipment.filter((e) => page.ids.has(e.id)), o)
  const p: Project = { ...p0, equipment: p0.equipment.map((e) => (pos.has(e.id) ? { ...e, position: pos.get(e.id)! } : e)) }
  const eqs = p.equipment.filter((e) => page.ids.has(e.id))
  // Notes on this sheet move with the device they sit next to.
  const notes = notesFor(p0, o, page).map((a) => {
    const near = nearestDevice(p0, a, page)
    const d = near && pos.get(near.id) ? { x: pos.get(near.id)!.x - near.position.x, y: pos.get(near.id)!.y - near.position.y } : { x: 0, y: 0 }
    return { ...a, x: a.x + d.x, y: a.y + d.y, leader: a.leader ? { x: a.leader.x + d.x, y: a.leader.y + d.y } : undefined }
  })
  const geo = new Map(eqs.map((e) => [e.id as string, nodeGeom(e)]))
  // Bounds in diagram units (room for tags above, category below, stubs and labels at the sides).
  const reachOf = new Map(eqs.map((e) => [e.id as string, sideReach(p, e, o)]))
  const noteXs = notes.flatMap((a) => [a.x, a.x + a.w, ...(a.leader ? [a.leader.x] : [])]), noteYs = notes.flatMap((a) => [a.y, a.y + a.h, ...(a.leader ? [a.leader.y] : [])])
  const x0 = Math.min(...eqs.map((e) => e.position.x - BADGE - reachOf.get(e.id)!.left - ZONE_PAD), ...noteXs.map((v) => v - 20)) - 20
  const y0 = Math.min(...eqs.map((e) => e.position.y - 100), ...noteYs.map((v) => v - 30))
  const x1 = Math.max(...eqs.map((e) => e.position.x + NODE_WIDTH + BADGE + reachOf.get(e.id)!.right + ZONE_PAD), ...noteXs.map((v) => v + 20)) + 20
  const y1 = Math.max(...eqs.map((e) => e.position.y + geo.get(e.id)!.height + 60), ...noteYs.map((v) => v + 30))
  const scale = Math.min(area.w / (x1 - x0), area.h / (y1 - y0), 0.6)
  const ox = area.x + (area.w - (x1 - x0) * scale) / 2, oy = area.y + (area.h - (y1 - y0) * scale) / 2
  const rects: Rect[] = eqs.map((e) => {
    const g = geo.get(e.id)!
    return { id: e.id, x0: e.position.x - BADGE - WIRE_CLEAR, y0: e.position.y - 22 - WIRE_CLEAR, x1: e.position.x + g.width + BADGE + WIRE_CLEAR, y1: e.position.y + g.height + 14 + WIRE_CLEAR }
  })
  svg.group(`translate(${ox} ${oy}) scale(${scale}) translate(${-x0} ${-y0})`, (g) => {
    if (o.rooms && o.split !== 'room') drawRooms(g, eqs, geo, reachOf)
    for (const e of eqs) drawDevice(g, e, o)
    drawWires(g, p, o, eqs, rects, sheetOf, n)
    for (const a of notes) drawNote(g, a)
  })
  return svg.toString()
}

function drawRooms(svg: Svg, eqs: EquipmentInstance[], geo: Map<string, { width: number; height: number }>, reach: Map<string, { left: number; right: number }>) {
  const rooms = new Map<string, EquipmentInstance[]>()
  for (const e of eqs) if (e.room?.trim()) rooms.set(e.room.trim(), [...(rooms.get(e.room.trim()) ?? []), e])
  if (rooms.size < 1) return
  const boxOf = (e: EquipmentInstance) => ({ x0: e.position.x - BADGE - (reach.get(e.id)?.left ?? 0) - ZONE_PAD / 2, y0: e.position.y - 30 - ZONE_PAD, x1: e.position.x + NODE_WIDTH + BADGE + (reach.get(e.id)?.right ?? 0) + ZONE_PAD / 2, y1: e.position.y + geo.get(e.id)!.height + 12 + ZONE_PAD })
  const near = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 + 80 && b.x0 < a.x1 + 80 && a.y0 < b.y1 + 80 && b.y0 < a.y1 + 80
  for (const [room, ms] of rooms) {
    // Devices of one room that sit apart get separate zones instead of one box over everything.
    let zones = ms.map((e) => ({ ...boxOf(e), ids: [e.id as string] }))
    for (let merged = true; merged;) {
      merged = false
      outer: for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i], b = zones[j]
        if (!near(a, b)) continue
        const u = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), ids: [...a.ids, ...b.ids] }
        // Don't merge across another room's device.
        const intruder = eqs.some((e) => !u.ids.includes(e.id) && (e.room?.trim() ?? '') !== room && e.position.x + NODE_WIDTH / 2 > u.x0 && e.position.x + NODE_WIDTH / 2 < u.x1 && e.position.y + 20 > u.y0 && e.position.y + 20 < u.y1)
        if (intruder) continue
        zones = [...zones.filter((_, k) => k !== i && k !== j), u]
        merged = true
        break outer
      }
    }
    for (const z of zones) {
      svg.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0, { lw: 1, dash: '14 8', stroke: '#444' })
      // Room name on the top border, on a white backing so lines never run through it.
      const label = room.toUpperCase(), tw = textWidth(label, 12) + 14
      svg.rect(z.x0 + 10, z.y0 - 8, tw, 16, { fill: '#fff', stroke: 'none', lw: 0 })
      svg.text(z.x0 + 15, z.y0, label, { size: 12, fill: '#444' })
    }
  }
}

function drawDevice(svg: Svg, e: EquipmentInstance, o: SchematicOptions) {
  const g = nodeGeom(e)
  const { x, y } = e.position
  const h = headerHeight(e)
  const { left, right } = splitPorts(e)
  const boxH = g.height + 12
  svg.text(x + NODE_WIDTH / 2, y - 9, e.tag, { size: 13, anchor: 'middle', weight: 'bold' })
  svg.rect(x, y, NODE_WIDTH, boxH, { lw: 1.4 })
  const maker = e.product.manufacturer.toUpperCase(), model = e.product.model.toUpperCase()
  svg.text(x + NODE_WIDTH / 2, y + 11, maker, { size: 9, anchor: 'middle', maxWidth: NODE_WIDTH - 16 })
  svg.text(x + NODE_WIDTH / 2, y + 23, model, { size: 9.5, anchor: 'middle', maxWidth: NODE_WIDTH - 16 })
  if (e.room?.trim()) svg.text(x + NODE_WIDTH / 2, y + 36, `(${e.room.trim().toUpperCase()})`, { size: 8, anchor: 'middle', fill: '#444', maxWidth: NODE_WIDTH - 16 })
  svg.line(x, y + h - 4, x + NODE_WIDTH, y + h - 4, { lw: 0.5 })
  const kind = e.product.category === 'other' ? 'DEVICE' : CATEGORIES[e.product.category].name.toUpperCase()
  svg.text(x + NODE_WIDTH / 2, y + boxH - 8, kind, { size: 9, anchor: 'middle', maxWidth: NODE_WIDTH - 16 })
  const port = (pt: PortTemplate, i: number, side: 'left' | 'right') => {
    const py = y + h + i * ROW_H + ROW_H / 2
    const d = portDomain(pt)
    const stroke = o.color && d ? DOMAINS[d].color : '#000'
    const bx = side === 'left' ? x - BADGE : x + NODE_WIDTH
    svg.rect(bx, py - 6, BADGE, 12, { lw: 0.8, stroke })
    svg.text(bx + BADGE / 2, py + 0.5, connectorBadge(pt.connector), { size: 6.5, anchor: 'middle', maxWidth: BADGE - 3, fill: stroke })
    const label = pt.label.toUpperCase()
    if (side === 'left') svg.text(x + 5, py, label, { size: 8.5, maxWidth: NODE_WIDTH / 2 - 8 })
    else svg.text(x + NODE_WIDTH - 5, py, label, { size: 8.5, anchor: 'end', maxWidth: NODE_WIDTH / 2 - 8 })
  }
  left.forEach((pt, i) => port(pt, i, 'left'))
  right.forEach((pt, i) => port(pt, i, 'right'))
}

interface End { eq: EquipmentInstance; port: PortTemplate; pt: Pt; dir: number }

function endOf(p: Project, a: Cable['from']): End | null {
  const eq = p.equipment.find((e) => e.id === a.equipment)
  const port = eq?.product.ports.find((x) => x.id === a.port)
  const g = eq && nodeGeom(eq).port(a.port)
  if (!eq || !port || !g) return null
  const dir = g.side === 'left' ? -1 : 1
  return { eq, port, dir, pt: { x: eq.position.x + g.x + dir * BADGE, y: eq.position.y + g.y } }
}

function drawWires(svg: Svg, p: Project, o: SchematicOptions, eqs: EquipmentInstance[], rects: Rect[], sheetOf: Map<string, number>, page: number) {
  const onPage = new Set(eqs.map((e) => e.id as string))
  const cables = p.cables.filter((c) => onPage.has(c.from.equipment) || onPage.has(c.to.equipment))
  // Channel plan for wires drawn in full on this sheet.
  const wires: ChannelWire[] = []
  for (const c of cables) {
    const a = endOf(p, c.from), b = endOf(p, c.to)
    if (!a || !b || !onPage.has(a.eq.id) || !onPage.has(b.eq.id)) continue
    const [s, t] = a.dir > 0 ? [a, b] : [b, a]
    if (s.dir > 0 && t.dir < 0 && t.pt.x > s.pt.x) wires.push({ id: c.id, sx: s.pt.x, sy: s.pt.y, tx: t.pt.x, ty: t.pt.y, sourceRight: s.eq.position.x + NODE_WIDTH + BADGE })
  }
  const plan = planChannels(wires, 18, 7)
  for (const c of cables) {
    const a = endOf(p, c.from), b = endOf(p, c.to)
    if (!a || !b) continue
    const d = portDomain(a.port)
    const stroke = o.color && d ? DOMAINS[d].color : '#000'
    const tags = `${compactTag(a.eq.tag)}-${compactTag(b.eq.tag)}`
    const both = onPage.has(a.eq.id) && onPage.has(b.eq.id)
    let pts: Pt[] | null = null
    if (both) {
      pts = route(a.pt, a.dir, b.pt, b.dir, rects, 0, plan.get(c.id))
      const len = pts.slice(1).reduce((s, q, i) => s + Math.abs(q.x - pts![i].x) + Math.abs(q.y - pts![i].y), 0)
      const ends = rects.filter((r) => r.id === a.eq.id || r.id === b.eq.id)
      if (o.wires === 'stubs' || (o.wires === 'smart' && (len > SMART_LEN || crossings(pts, rects, ends) > 0))) pts = null
    }
    if (pts) {
      svg.polyline(pts, { lw: 1, stroke })
      endLabel(svg, a, c.label, tags, stroke)
      endLabel(svg, b, c.label, tags, stroke)
    } else {
      for (const [here, there] of [[a, b], [b, a]] as const) {
        if (!onPage.has(here.eq.id)) continue
        const sheet = sheetOf.get(there.eq.id)
        const ref = `${portRef(there.eq, there.port)}${sheet && sheet !== page ? ` (SHT ${sheet})` : ''}`
        offSheet(svg, here, c.label, tags, ref, stroke)
      }
    }
  }
}

/** Cable number above the wire, FROM-TO tags below, right next to the port. */
function endLabel(svg: Svg, e: End, label: string, tags: string, stroke: string) {
  const x = e.pt.x + e.dir * 4
  const anchor = e.dir > 0 ? 'start' : 'end'
  svg.text(x, e.pt.y - 4.5, label, { size: 7.5, anchor, fill: stroke })
  svg.text(x, e.pt.y + 5, tags, { size: 5.5, anchor, fill: stroke })
}

/** Short wire ending in an off-sheet arrow tag naming the far end. */
function offSheet(svg: Svg, e: End, label: string, tags: string, ref: string, stroke: string) {
  const end = { x: e.pt.x + e.dir * STUB, y: e.pt.y }
  svg.line(e.pt.x, e.pt.y, end.x, end.y, { lw: 1, stroke })
  endLabel(svg, e, label, tags, stroke)
  const w = Math.max(40, textWidth(ref, 7.5) + 14), hh = 6
  const x0 = e.dir > 0 ? end.x : end.x - w
  // Arrow-ended flag pointing away from the device.
  const d = e.dir > 0
    ? `M ${x0} ${end.y - hh} L ${x0 + w - hh} ${end.y - hh} L ${x0 + w} ${end.y} L ${x0 + w - hh} ${end.y + hh} L ${x0} ${end.y + hh} Z`
    : `M ${x0 + w} ${end.y - hh} L ${x0 + hh} ${end.y - hh} L ${x0} ${end.y} L ${x0 + hh} ${end.y + hh} L ${x0 + w} ${end.y + hh} Z`
  svg.path(d, { lw: 0.8, stroke, fill: '#fff' })
  svg.text(x0 + w / 2 + (e.dir > 0 ? -hh / 2 : hh / 2), end.y + 0.5, ref, { size: 7.5, anchor: 'middle', maxWidth: w - hh - 6, fill: stroke })
}

export const schematicSheetSize = (o: SchematicOptions) => sheetSize(o)

// MARK: Notes, callouts, revision notes

/** Notes that belong on a sheet: by page when printing one sheet per page, else by nearest device. */
function notesFor(p: Project, o: SchematicOptions, page: Page): Annotation[] {
  const all = p.annotations ?? []
  if (o.split === 'group') {
    const known = new Set(groupsOf(p).map((g) => g.id))
    return all.filter((a) => (page.pageId ? a.page === page.pageId : !a.page || !known.has(a.page)))
  }
  if (o.split === 'none') return all
  return all.filter((a) => { const d = nearestDevice(p, a); return d ? page.ids.has(d.id) : page.title === 'UNASSIGNED' })
}

function nearestDevice(p: Project, a: Annotation, page?: Page): EquipmentInstance | undefined {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2
  let best: EquipmentInstance | undefined, bd = Infinity
  for (const e of p.equipment) {
    if (page && page.ids.size && !page.ids.has(e.id)) continue
    const d = Math.hypot(e.position.x + NODE_WIDTH / 2 - cx, e.position.y + 40 - cy)
    if (d < bd) { bd = d; best = e }
  }
  return best
}

/** Word-wraps text to a width (diagram units). */
function wrap(text: string, width: number, size: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (line && textWidth(next, size) > width) { out.push(line); line = word } else line = next
    }
    out.push(line)
  }
  return out
}

function drawNote(svg: Svg, a: Annotation) {
  const size = 11, lh = size * 1.3
  if (a.kind === 'revision') {
    // Cloud outline
    const r = 9, nx = Math.max(1, Math.round(a.w / (r * 2))), ny = Math.max(1, Math.round(a.h / (r * 2)))
    const sx = a.w / nx, sy = a.h / ny
    let d = `M ${a.x} ${a.y}`
    for (let i = 0; i < nx; i++) d += ` a ${sx / 2} ${r} 0 0 1 ${sx} 0`
    for (let i = 0; i < ny; i++) d += ` a ${r} ${sy / 2} 0 0 1 0 ${sy}`
    for (let i = 0; i < nx; i++) d += ` a ${sx / 2} ${r} 0 0 1 ${-sx} 0`
    for (let i = 0; i < ny; i++) d += ` a ${r} ${sy / 2} 0 0 1 0 ${-sy}`
    svg.path(d, { lw: 1.2, fill: '#fff' })
    // Δ revision tag
    const tx = a.x + 8, ty = a.y + 8
    svg.path(`M ${tx + 13} ${ty} L ${tx + 26} ${ty + 23} L ${tx} ${ty + 23} Z`, { lw: 1.2, fill: '#fff' })
    svg.text(tx + 13, ty + 15, a.rev ?? '', { size: 9, anchor: 'middle', weight: 'bold' })
    wrap(a.text, a.w - 50, size).forEach((l, i) => svg.text(a.x + 42, a.y + 14 + i * lh, l, { size }))
    return
  }
  if (a.kind === 'callout' && a.leader) {
    const lx = a.leader.x, ly = a.leader.y
    const inside = lx > a.x && lx < a.x + a.w && ly > a.y && ly < a.y + a.h
    const sx = inside ? a.x + a.w / 2 : Math.min(Math.max(lx, a.x), a.x + a.w), sy = inside ? a.y + a.h : Math.min(Math.max(ly, a.y), a.y + a.h)
    svg.line(sx, sy, lx, ly, { lw: 1.2 })
    const ang = Math.atan2(ly - sy, lx - sx)
    svg.path(`M ${lx} ${ly} L ${lx - 10 * Math.cos(ang - 0.4)} ${ly - 10 * Math.sin(ang - 0.4)} L ${lx - 10 * Math.cos(ang + 0.4)} ${ly - 10 * Math.sin(ang + 0.4)} Z`, { lw: 0.5, fill: '#000' })
  }
  svg.rect(a.x, a.y, a.w, a.h, { lw: a.kind === 'callout' ? 1.4 : 1, fill: '#fff' })
  wrap(a.text, a.w - 16, size).forEach((l, i) => svg.text(a.x + 8, a.y + 14 + i * lh, l, { size }))
}

// CAD-style printed wiring schematics: monochrome device blocks with tag,
// maker / model and type, connector badges on every port, wires with the
// cable number and FROM-TO tags at both ends, off-sheet arrows for long or
// cross-sheet runs, and dashed room zones.

import { cableColorHex } from '../cables'
import { clusterMembership } from '../clusters'
import { viewPrintProject, viewsOf } from '../views'
import { autoNumber, GENERAL_PAGE, pageNumbers, sheetLabel } from '../sheetnumbers'
import { CATEGORIES, type Annotation, type Cable, type EquipmentInstance, type PortTemplate, type Project, type WireMode, type NetInfo, type VlanPlan } from '../model'
import { DOMAINS } from '../signals'
import { portDomain } from '../project'
import { planChannels, type ChannelWire } from '../autolayout'
import { cardLayout, cardPortLabel, FACE_H, headerHeight, NODE_WIDTH, nodeGeom, SEC_HEAD, splitPorts } from '../diagramgeom'
import { cleanPath, crossings, detourBudget, nudgeWires, route, WIRE_CLEAR, type Pt, type Rect } from '../wireroute'
import { groupsOf } from '../groups'
import { newSheet, sheetSize, type SheetOptions } from './sheet'
import { Svg, textWidth } from './svg'

export interface SchematicOptions extends SheetOptions {
  wires: WireMode
  /** One sheet for everything, or one per group / room. */
  split: 'none' | 'group' | 'room'
  /** Old switch for room zones; `zones` replaces it. */
  rooms?: boolean
  /** Dashed boxes round devices: their groups, their rooms, or none. Default: groups when the project has any, else rooms. */
  zones?: ZoneMode
  color: boolean
  /** Signal views to add as extra sheets (undefined = all of them). */
  views?: string[]
  /** Quick print: just this page's sheet (group id, null = devices on no page) – or just this signal view. */
  onlyPage?: string | null
  onlyView?: string
  /** Export: just these pages (page id, or GENERAL_PAGE) and views (view id). */
  onlySheets?: string[]
}

export type ZoneMode = 'groups' | 'rooms' | 'none'
/** Which zones a print draws (groups win when the project uses them). */
export const zoneMode = (p: Project, o: Pick<SchematicOptions, 'zones' | 'rooms'>): ZoneMode =>
  o.zones ?? (o.rooms === false ? 'none' : p.clusters?.length ? 'groups' : 'rooms')

export const defaultSchematic = (p?: Project): SchematicOptions => ({
  sheet: 'archD', titleBlock: true, title: 'SIGNAL FLOW', wires: p?.diagram?.wires === 'all' ? 'all' : 'smart', split: p?.groups?.length ? 'group' : 'none', color: false,
})

const BADGE = 22      // connector badge width (px, diagram units)
const STUB = 70       // off-sheet stub length
const SMART_LEN = 1400

/** Short connector names for the badges ("BNC", "HDMI", "RJ45"…). */
export function connectorBadge(c: PortTemplate['connector']): string {
  const m: Record<string, string> = {
    hdmi: 'HDMI', displayPort: 'DP', dvi: 'DVI', bnc: 'BNC', hd15: 'VGA', xlr3: 'XLR', miniXlr: 'TA3', trs6_35: 'TRS', trs3_5: '3.5', bantamTT: 'TT', rca: 'RCA',
    speakonNL2: 'NL2', speakonNL4: 'NL4', euroblock: 'PHX', bindingPost: 'BP', rj45: 'RJ45', etherCON: 'ECON', lcDuplex: 'LC', scDuplex: 'SC', mdc: 'MDC', mpo8: 'MTP8', mpo12: 'MTP', mpo24: 'MT24', opticalCON: 'OCON',
    usbA: 'USB', usbB: 'USB', usbC: 'USBC', db9: 'DB9', db25: 'DB25', idcPunchdown: 'IDC', xlr5: 'XLR5', lemo: 'LEMO', smpteFiber: 'SMPT', sma: 'SMA', tnc: 'TNC',
    iecC13C14: 'IEC', iecC19C20: 'C20', powerCON: 'PCON', powerCONTrue1: 'TRU1', dcBarrel: 'DC', xlr4: 'XLR4', camlok: 'CAM', schuko: 'SCH',
    whirlwindW1: 'W1', whirlwindW2: 'W2', socapex19: 'SOCA', amphenol57: 'AMP', edac56: 'ED56', edac90: 'ED90',
  }
  return m[c] ?? (c.startsWith('nema') ? c.replace('nema', '').replace('_', '-').toUpperCase() : c.slice(0, 4).toUpperCase())
}

const compactTag = (t: string) => t.replace(/[^A-Za-z0-9]/g, '')
const portRef = (eq: EquipmentInstance, port: PortTemplate) => `${eq.tag} ${port.label}`.toUpperCase()

interface Page { title: string; ids: Set<string>; pageId?: string | null }

export function schematicSheets(pIn: Project, o: SchematicOptions): string[] {
  if (!pIn.equipment.length) return []
  // Printed cards always show every port – folded sections are a screen convenience.
  // …and no plate / panel face drawing in the device blocks (it looked out of place on paper).
  const p0: Project = { ...pIn, equipment: pIn.equipment.map((e) => ({ ...e, collapsed: undefined, ioHidden: undefined, noFace: true })) }
  // Notes placed on signal views print on those views' sheets only.
  const views = viewsOf(p0).filter((v) => !o.views || o.views.includes(v.id) || v.id === o.onlyView)
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
  // Sheet numbers: each page's / view's own number (AV101…) when splitting by page, else
  // the automatic sequence, else the drawing number counted up (AV-201, AV-202…).
  const nums = pageNumbers(p0), numbering = p0.diagram?.numbering
  const byIndex = (i: number) => (numbering ? autoNumber(numbering, i) : sheetLabel(o.drawingNumber, i))
  const labels: (string | undefined)[] = [
    ...pages.map((pg, i) => (o.split === 'group' ? nums.get(pg.pageId ?? GENERAL_PAGE) ?? sheetLabel(o.drawingNumber, i) : byIndex(i))),
    ...extra.map(({ v }, i) => nums.get(v.id) ?? byIndex(pages.length + i)),
  ]
  // Quick print draws just one page or view (numbered as in the full set).
  const mainOk = (pg: Page) => !o.onlyView && (o.onlyPage === undefined || (pg.pageId ?? null) === o.onlyPage) && (!o.onlySheets || o.onlySheets.includes(pg.pageId ?? GENERAL_PAGE))
  const viewOk = (id: string) => (o.onlyView ? id === o.onlyView : o.onlyPage === undefined) && (!o.onlySheets || o.onlySheets.includes(id))
  return [
    ...pages.flatMap((pg, i) => (mainOk(pg) ? [drawPage(p, o, pg, i + 1, total, sheetOf, labels)] : [])),
    // Wires leaving a view end in arrows naming the device and the main sheet it's on.
    ...extra.flatMap(({ v, project: vp, ids }, i) => (viewOk(v.id) ? [drawPage(vp, { ...o, split: 'group' }, { title: v.name.toUpperCase(), pageId: v.id, ids }, pages.length + i + 1, total, sheetOf, labels)] : [])),
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
    // Single flag, or (bundled with others to the same device) port text + bracket + device-name flag.
    const flag = Math.max(STUB + Math.max(40, textWidth(`${portRef(oe, op)} (SHT AV1099)`, 7.5) + 14),
      STUB * 2 + textWidth(op.label, 6.5) + 8 + textWidth(`${oe.tag} · ${oe.product.manufacturer} ${oe.product.model} (SHT AV1099)`, 7.5) + 14)
    const r = o.wires === 'all' ? label : Math.max(label, flag)
    if (g.side === 'left') left = Math.max(left, r); else right = Math.max(right, r)
  }
  return { left, right }
}

const ZONE_PAD = 36 // room zone border distance from what it encloses

/**
 * Print positions: the diagram's own layout, as you arranged it. Blocks only
 * move where they would actually collide on paper – a column that sits on top
 * of the one before it is nudged right just enough to clear it (and a group /
 * room border between them), and a block that overlaps the one above it is
 * nudged down just enough to keep its tag and type line clear. Wire labels and
 * flags no longer push the whole drawing apart.
 */
export function printPositions(p: Project, eqs: EquipmentInstance[], o: Pick<SchematicOptions, 'wires'> & Partial<Pick<SchematicOptions, 'zones' | 'rooms' | 'split'>> = { wires: 'smart' }, groupOf?: Map<string, string>): Map<string, { x: number; y: number }> {
  const H = (e: EquipmentInstance) => nodeGeom(e).height + 12 // box incl. the type line
  const reach = new Map(eqs.map((e) => [e.id as string, sideReach(p, e, o)]))
  // Zone each device sits in – columns of different zones get room for the zone borders.
  const zm = zoneMode(p, o)
  const room = (e: EquipmentInstance) => (zm === 'groups' ? groupOf?.get(e.id) ?? '' : zm === 'rooms' && o.split !== 'room' ? e.room?.trim() ?? '' : '')
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
    // Just clear the previous column's blocks and badges (plus the zone borders between different zones).
    const need = prevRight + BADGE * 2 + 24 + (roomGap ? ZONE_PAD * 2 : 0)
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
  const pad = BADGE + 8
  for (const e of order) {
    let y = e.position.y
    const x = e.position.x + (shift.get(e.id) ?? 0)
    for (let again = true; again;) {
      again = false
      for (const q of placed) {
        if (!(x - pad < q.x + NODE_WIDTH + pad && q.x - pad < x + NODE_WIDTH + pad)) continue
        const gap = room(q.e) === room(e) ? 34 : 34 + ZONE_PAD * 2
        const bottom = q.y + H(q.e) + gap
        if (y + H(e) + gap > q.y && y < bottom) { y = bottom; again = true }
      }
    }
    placed.push({ e, x, y })
    out.set(e.id, { x, y })
  }
  // 3. Close up empty space: wide gaps between blocks (as drawn) shrink to a normal gutter,
  // across and down, so the arrangement keeps its order and alignment but fills the sheet.
  const MAX_GAP = 90 + ZONE_PAD * 2
  const squeeze = (axis: 'x' | 'y', span: (e: EquipmentInstance, at: { x: number; y: number }) => [number, number]) => {
    const iv = eqs.map((e) => ({ id: e.id as string, r: span(e, out.get(e.id)!) })).sort((a, b) => a.r[0] - b.r[0])
    let reach = -Infinity, cut = 0
    const shiftBy = new Map<string, number>()
    for (const it of iv) {
      if (reach > -Infinity && it.r[0] - reach > MAX_GAP) cut += it.r[0] - reach - MAX_GAP
      shiftBy.set(it.id, cut)
      reach = Math.max(reach, it.r[1])
    }
    for (const [id, d] of shiftBy) { const q = out.get(id)!; out.set(id, axis === 'x' ? { x: q.x - d, y: q.y } : { x: q.x, y: q.y - d }) }
  }
  squeeze('x', (e, at) => [at.x - BADGE - reach.get(e.id)!.left, at.x + NODE_WIDTH + BADGE + reach.get(e.id)!.right])
  squeeze('y', (e, at) => [at.y - 40, at.y + H(e) + 20])
  return out
}

function drawPage(p0: Project, o: SchematicOptions, page: Page, n: number, total: number, sheetOf: Map<string, number>, labels: (string | undefined)[] = []): string {
  const { svg, area } = newSheet(p0, o, n, total, page.title, labels[n - 1])
  // Work on a copy with print positions so blocks never crowd each other.
  // Which group box each device sits in, from the layout it was drawn in (before re-spacing).
  const viewIds = new Set(viewsOf(p0).map((v) => v.id))
  const isView = !!page.pageId && viewIds.has(page.pageId)
  const groupOf = clusterMembership(p0, p0.equipment.filter((e) => page.ids.has(e.id)), { page: isView ? null : page.pageId ?? null, view: isView ? page.pageId! : null }, viewIds)
  const pos = printPositions(p0, p0.equipment.filter((e) => page.ids.has(e.id)), o, groupOf)
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
    const zm = zoneMode(p, o)
    if (zm === 'groups') {
      const names = new Map((p.clusters ?? []).map((c) => [c.id, c.name]))
      drawZones(g, eqs, geo, reachOf, (e) => { const k = groupOf.get(e.id); return k && names.has(k) ? k : '' }, (k) => names.get(k) ?? '', true)
    } else if (zm === 'rooms' && o.split !== 'room') drawZones(g, eqs, geo, reachOf, (e) => e.room?.trim() ?? '', (k) => k)
    for (const e of eqs) drawDevice(g, e, { ...o, zones: zm }, p.vlans ?? [])
    drawWires(g, p, o, eqs, rects, sheetOf, n, labels)
    for (const a of notes) drawNote(g, a)
  })
  return svg.toString()
}

/** Dashed, labelled boxes round devices that share a zone (a group, or a room). */
function drawZones(svg: Svg, eqs: EquipmentInstance[], geo: Map<string, { width: number; height: number }>, reach: Map<string, { left: number; right: number }>, keyOf: (e: EquipmentInstance) => string, nameOf: (k: string) => string, whole = false) {
  const rooms = new Map<string, EquipmentInstance[]>()
  for (const e of eqs) { const k = keyOf(e); if (k) rooms.set(k, [...(rooms.get(k) ?? []), e]) }
  if (rooms.size < 1) return
  const boxOf = (e: EquipmentInstance) => ({ x0: e.position.x - BADGE - (reach.get(e.id)?.left ?? 0) - ZONE_PAD / 2, y0: e.position.y - 30 - ZONE_PAD, x1: e.position.x + NODE_WIDTH + BADGE + (reach.get(e.id)?.right ?? 0) + ZONE_PAD / 2, y1: e.position.y + geo.get(e.id)!.height + 12 + ZONE_PAD })
  const near = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 + 80 && b.x0 < a.x1 + 80 && a.y0 < b.y1 + 80 && b.y0 < a.y1 + 80
  for (const [room, ms] of rooms) {
    // Devices of one room that sit apart get separate zones instead of one box over everything.
    let zones = ms.map((e) => ({ ...boxOf(e), ids: [e.id as string] }))
    // A group is one box round all its devices; rooms split where their devices sit apart.
    if (whole) zones = [zones.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), ids: [...a.ids, ...b.ids] }))]
    for (let merged = !whole; merged;) {
      merged = false
      outer: for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i], b = zones[j]
        if (!near(a, b)) continue
        const u = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), ids: [...a.ids, ...b.ids] }
        // Don't merge across another room's device.
        const intruder = eqs.some((e) => !u.ids.includes(e.id) && keyOf(e) !== room && e.position.x + NODE_WIDTH / 2 > u.x0 && e.position.x + NODE_WIDTH / 2 < u.x1 && e.position.y + 20 > u.y0 && e.position.y + 20 < u.y1)
        if (intruder) continue
        zones = [...zones.filter((_, k) => k !== i && k !== j), u]
        merged = true
        break outer
      }
    }
    for (const z of zones) {
      svg.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0, { lw: 1, dash: '14 8', stroke: '#444' })
      // Room name on the top border, on a white backing so lines never run through it.
      const label = nameOf(room).toUpperCase(), tw = textWidth(label, 12) + 14
      svg.rect(z.x0 + 10, z.y0 - 8, tw, 16, { fill: '#fff', stroke: 'none', lw: 0 })
      svg.text(z.x0 + 15, z.y0, label, { size: 12, fill: '#444' })
    }
  }
}

function drawDevice(svg: Svg, e: EquipmentInstance, o: SchematicOptions, vlans: VlanPlan[] = []) {
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
  if (e.room?.trim() && o.zones !== 'groups') svg.text(x + NODE_WIDTH / 2, y + 36, `(${e.room.trim().toUpperCase()})`, { size: 8, anchor: 'middle', fill: '#444', maxWidth: NODE_WIDTH - 16 })
  const L = cardLayout(e)
  svg.line(x, y + h - 2, x + NODE_WIDTH, y + h - 2, { lw: 0.5 })
  for (const sec of L.sections) {
    svg.text(x + 6, y + sec.y + SEC_HEAD / 2 + 0.5, sec.name.toUpperCase(), { size: 7.5, weight: 'bold', fill: '#555', maxWidth: NODE_WIDTH - 12 })
    svg.line(x + 6, y + sec.y + SEC_HEAD - 3, x + NODE_WIDTH - 6, y + sec.y + SEC_HEAD - 3, { lw: 0.3, stroke: '#999' })
    if (sec.faces) {
      svg.text(x + 6, y + sec.y + SEC_HEAD + FACE_H / 2, (sec.heads?.[0] ?? 'Front').toUpperCase(), { size: 6.5, fill: '#777' })
      svg.text(x + NODE_WIDTH - 6, y + sec.y + SEC_HEAD + FACE_H / 2, (sec.heads?.[1] ?? 'Rear').toUpperCase(), { size: 6.5, fill: '#777', anchor: 'end' })
    }
  }
  const secOf = new Map(L.sections.flatMap((sec) => sec.ports.map((q) => [q.id, sec] as const)))
  const kind = e.product.category === 'other' ? 'DEVICE' : CATEGORIES[e.product.category].name.toUpperCase()
  svg.text(x + NODE_WIDTH / 2, y + boxH - 8, kind, { size: 9, anchor: 'middle', maxWidth: NODE_WIDTH - 16 })
  const isSwitch = e.product.category === 'networkSwitch'
  const port = (pt: PortTemplate, _i: number, side: 'left' | 'right') => {
    const py = y + (L.ports.get(pt.id)?.y ?? 0)
    const d = portDomain(pt)
    const stroke = o.color && d ? DOMAINS[d].color : '#000'
    const bx = side === 'left' ? x - BADGE : x + NODE_WIDTH
    svg.rect(bx, py - 6, BADGE, 12, { lw: 0.8, stroke })
    svg.text(bx + BADGE / 2, py + 0.5, connectorBadge(pt.connector), { size: 6.5, anchor: 'middle', maxWidth: BADGE - 3, fill: stroke })
    const sec = secOf.get(pt.id)
    const label = (sec ? cardPortLabel(pt.label, sec.name, sec.faces) : pt.label).toUpperCase()
    // Switch ports with a VLAN: the VLAN goes on a second line under the port name (the row is tall enough for both).
    const vl = isSwitch ? portVlanText(e.network?.[pt.id], vlans) : ''
    const ly = vl ? py - 4 : py
    const lx = side === 'left' ? x + 5 : x + NODE_WIDTH - 5, anchor = side === 'left' ? 'start' as const : 'end' as const
    svg.text(lx, ly, label, { size: 8.5, anchor, maxWidth: NODE_WIDTH / 2 - 8 })
    if (vl) svg.text(lx, py + 6, vl, { size: 6.5, anchor, fill: '#555', maxWidth: NODE_WIDTH / 2 - 8 })
  }
  left.forEach((pt, i) => port(pt, i, 'left'))
  right.forEach((pt, i) => port(pt, i, 'right'))
}

/** "VLAN 20 · AUDIO" for an access port, "TRUNK 10,20 (NATIVE 1)" for a trunk; '' when none is set. */
export function portVlanText(info: NetInfo | undefined, vlans: VlanPlan[] = []): string {
  if (!info) return ''
  const name = (v?: string) => { const n = v ? vlans.find((x) => x.vlan === v)?.name?.trim() : ''; return n ? ` · ${n}` : '' }
  if (info.mode === 'trunk') return `TRUNK ${info.tagged || ''}${info.vlan ? ` (NATIVE ${info.vlan})` : ''}`.replace(/\s+/g, ' ').trim().toUpperCase()
  return info.vlan ? `VLAN ${info.vlan}${name(info.vlan)}`.toUpperCase() : ''
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

function drawWires(svg: Svg, p: Project, o: SchematicOptions, eqs: EquipmentInstance[], rects: Rect[], sheetOf: Map<string, number>, page: number, labels: (string | undefined)[] = []) {
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
  const plan = planChannels(wires)
  // Route every wire drawn in full first, then pull apart wires sharing a run.
  detourBudget(4000)
  const full = new Map<string, Pt[]>()
  for (const c of cables) {
    const a = endOf(p, c.from), b = endOf(p, c.to)
    if (!a || !b || !onPage.has(a.eq.id) || !onPage.has(b.eq.id)) continue
    const pts = route(a.pt, a.dir, b.pt, b.dir, rects, 0, plan.get(c.id))
    const len = pts.slice(1).reduce((s, q, i) => s + Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y), 0)
    const ends = rects.filter((r) => r.id === a.eq.id || r.id === b.eq.id)
    if (o.wires === 'stubs' || (o.wires === 'smart' && (len > SMART_LEN || crossings(pts, rects, ends) > 0))) continue
    full.set(c.id, pts)
  }
  const nudged = nudgeWires(full, undefined, undefined, rects)
  const bundles = new Map<string, { here: End; there: End; label: string; tags: string; ref: string; sht: string; stroke: string }[]>()
  for (const c of cables) {
    const a = endOf(p, c.from), b = endOf(p, c.to)
    if (!a || !b) continue
    const d = portDomain(a.port)
    const stroke = o.color ? (cableColorHex(c.color) ?? (d ? DOMAINS[d].color : '#000')) : '#000'
    const tags = `${compactTag(a.eq.tag)}-${compactTag(b.eq.tag)}`
    const both = onPage.has(a.eq.id) && onPage.has(b.eq.id)
    let pts: Pt[] | null = null
    if (both) pts = nudged.get(c.id) ?? null
    if (pts) {
      svg.polyline(cleanPath(pts), { lw: 1, stroke })
      endLabel(svg, a, c.label, tags, stroke)
      endLabel(svg, b, c.label, tags, stroke)
    } else {
      for (const [here, there] of [[a, b], [b, a]] as const) {
        if (!onPage.has(here.eq.id)) continue
        const sheet = sheetOf.get(there.eq.id)
        const sht = sheet && sheet !== page ? ` (SHT ${labels[sheet - 1] ?? sheet})` : ''
        const key = `${here.eq.id}|${here.dir}|${there.eq.id}`
        bundles.set(key, [...(bundles.get(key) ?? []), { here, there, label: c.label, tags, ref: `${portRef(there.eq, there.port)}${sht}`, sht, stroke }])
      }
    }
  }
  // Off-sheet ends: one flag each, or – when several go to the same device – a bracket and one flag naming it.
  for (const ms of bundles.values()) {
    if (ms.length < 2) { const m = ms[0]; offSheet(svg, m.here, m.label, m.tags, m.ref, m.stroke); continue }
    ms.sort((x, y) => x.here.pt.y - y.here.pt.y)
    const dir = ms[0].here.dir
    const w = Math.max(...ms.map((m) => textWidth(`${m.there.port.label}`, 6.5))) + 8
    const bx = ms[0].here.pt.x + dir * (STUB + w)
    for (const m of ms) {
      svg.line(m.here.pt.x, m.here.pt.y, bx, m.here.pt.y, { lw: 1, stroke: m.stroke })
      endLabel(svg, m.here, m.label, m.tags, m.stroke)
      svg.text(m.here.pt.x + dir * (STUB + 2), m.here.pt.y - 3.5, m.there.port.label.toUpperCase(), { size: 6.5, anchor: dir > 0 ? 'start' : 'end', fill: m.stroke })
    }
    const y0 = ms[0].here.pt.y, y1 = ms[ms.length - 1].here.pt.y, ym = (y0 + y1) / 2
    svg.line(bx, y0, bx, y1, { lw: 1.4 })
    const there = ms[0].there.eq
    offSheet(svg, { ...ms[0].here, pt: { x: bx, y: ym } }, '', '', `${there.tag} · ${there.product.manufacturer} ${there.product.model}${ms[0].sht}`.toUpperCase(), '#000')
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

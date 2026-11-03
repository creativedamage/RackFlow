// Panel fabrication drawings: one sheet per plate / box / connector panel
// design, for a fabricator to build from – the face to scale, every cut-out
// located by ordinate dimensions from a top-left datum, a connector schedule
// with engraving text, and the finish / size / quantity notes.

import type { EquipmentInstance, PlateInsert, PlateSpec, Project } from '../model'
import { PLATE_MODULES } from '../plates'
import { finishOf, footprint, plateInner, plateSize, withLayout } from '../platelayout'
import { newSheet, type SheetOptions } from './sheet'


export interface FabricationOptions extends SheetOptions {
  /** Units shown first on dimensions; the other is given in brackets. */
  units: 'mm' | 'in'
  /** Only these devices (ids); default every plate, box and panel. */
  only?: string[]
  /** One sheet per box (default) – else identical boxes share a sheet with a table of where each goes. */
  perBox?: boolean
}

export const defaultFabrication = (): FabricationOptions => ({ sheet: 'ansiB', titleBlock: true, title: 'PANEL FABRICATION', units: 'in' })

const KIND: Record<PlateSpec['kind'], string> = { wallPlate: 'Wall plate', wallBox: 'Wall box panel', floorBox: 'Floor box / stage pocket', rackPanel: 'Rack connector panel' }

/** Cut-out to make for a connector footprint (published standards; verify against the connector datasheet). */
export function cutoutOf(module: string): string {
  const f = footprint(module)
  switch (f.shape) {
    case 'd': return 'Ø24 HOLE + 2× Ø3.2 (M3) AT 19 H × 24 V, DIAG. (NEUTRIK D)'
    case 'keystone': return 'KEYSTONE 14.9 × 19.4 RECT'
    case 'duplex': return 'DECORA 33.4 × 67.0 RECT + 2× #6-32 ON 96.8 CTRS'
    case 'round': return `Ø${Math.round(f.w * 0.7)} HOLE (PER MFR)`
    case 'twist': return 'Ø40 HOLE + 2× #6-32 (PER MFR)'
    case 'block': return module === 'binding' ? '2× Ø5 ON 19 CTRS' : module === 'euro' ? `${f.w} × ${f.h} RECT (PER MFR)` : 'D-SUB SHELL CUT-OUT + 2× Ø3.1 (PER MFR)'
    default: return `${f.w} × ${f.h} FLANGE – CUT-OUT PER MFR DRAWING`
  }
}

interface Design { spec: PlateSpec; eqs: EquipmentInstance[]; model: string }

/** Plates with the same face and engraving share one sheet (quantity and tags listed). */
function designs(p: Project, only?: string[], perBox = true): Design[] {
  const out = new Map<string, Design>()
  for (const e of p.equipment) {
    const spec = e.product.plate
    if (!spec || (only && !only.includes(e.id))) continue
    const key = perBox ? e.id : JSON.stringify(withLayout(spec))
    const d = out.get(key)
    if (d) d.eqs.push(e)
    else out.set(key, { spec: withLayout(spec), eqs: [e], model: `${e.product.manufacturer} ${e.product.model}`.trim() })
  }
  return [...out.values()].sort((a, b) => a.eqs[0].tag.localeCompare(b.eqs[0].tag, undefined, { numeric: true }))
}

const SCALES = [2, 1.5, 1, 0.75, 0.5, 0.4, 0.25, 0.2, 0.125, 0.1]
const scaleName = (s: number) => (s >= 1 ? `${s}:1` : `1:${Math.round(1 / s * 100) / 100}`)

/** Jack name as engraved (same rule as the face drawing). */
function engravings(spec: PlateSpec): Map<string, string> {
  const names = new Map<string, string>(), c = new Map<string, number>()
  for (const ins of spec.inserts) {
    const k = (c.get(ins.module) ?? 0) + 1; c.set(ins.module, k)
    const many = spec.inserts.filter((x) => x.module === ins.module).length > 1
    if (ins.pid) names.set(ins.pid, (ins.label?.trim() || `${(PLATE_MODULES[ins.module]?.name ?? ins.module).replace(/\s*\(.*\)$/, '')}${many ? ` ${k}` : ''}`).toUpperCase())
  }
  return names
}

export function fabricationSheets(p: Project, o: FabricationOptions = defaultFabrication()): string[] {
  const list = designs(p, o.only, o.perBox !== false)
  const page = (e: EquipmentInstance) => p.groups?.find((g) => g.id === e.groupId)?.name ?? ''
  const where = (e: EquipmentInstance) => e.room?.trim() || ''
  const fmt = (mm: number) => {
    const inch = mm / 25.4
    return o.units === 'in' ? `${inch.toFixed(3)}" (${mm.toFixed(1)})` : `${mm.toFixed(1)} (${inch.toFixed(2)}")`
  }
  const short = (mm: number) => (o.units === 'in' ? (mm / 25.4).toFixed(3) : mm.toFixed(1))
  return list.map((d, i) => {
    const tags = d.eqs.map((e) => e.tag)
    const one = d.eqs.length === 1 ? d.eqs[0] : null
    const { svg, area } = newSheet(p, o, i + 1, list.length, `${tags[0]}${tags.length > 1 ? ` (+${tags.length - 1})` : ''}${one && where(one) ? ` – ${where(one)}` : ''}`)
    const spec = d.spec, L = spec.layout!
    const size = plateSize(spec)
    // Zones: drawing (left), schedule + notes (right).
    const tableW = Math.min(170, area.w * 0.42)
    const draw = { x: area.x + 6, y: area.y + 24, w: area.w - tableW - 18, h: area.h - 30 }
    // Room for ordinate dimensions (top / left) and overall dims (bottom / right).
    const dimTop = 30, dimLeft = 30, dimRight = 16, dimBottom = 16
    // Fit the face and anything sticking out of it (a jack placed past the edge is drawn, and flagged).
    const placed = spec.inserts.filter((ins) => ins.pid && L.jacks[ins.pid]).map((ins) => ({ c: L.jacks[ins.pid!], f: footprint(ins.module) }))
    const bx0 = Math.min(0, ...placed.map((q) => q.c.x - q.f.w / 2 - 3)), bx1 = Math.max(L.w, ...placed.map((q) => q.c.x + q.f.w / 2 + 3))
    const by0 = Math.min(0, ...placed.map((q) => q.c.y - q.f.h / 2 - 3)), by1 = Math.max(L.h, ...placed.map((q) => q.c.y + q.f.h / 2 + 6))
    const BW = bx1 - bx0, BH = by1 - by0
    const s = SCALES.find((k) => BW * k <= draw.w - dimLeft - dimRight && BH * k <= draw.h - dimTop - dimBottom) ?? 0.1
    const ox = draw.x + dimLeft + (draw.w - dimLeft - dimRight - BW * s) / 2 - bx0 * s
    const oy = draw.y + dimTop + (draw.h - dimTop - dimBottom - BH * s) / 2 - by0 * s
    const X = (mm: number) => ox + mm * s, Y = (mm: number) => oy + mm * s

    svg.text(area.x + 4, area.y + 5, `${KIND[spec.kind].toUpperCase()} – ${tags.join(', ')}`.toUpperCase(), { size: 4.2, weight: 'bold', maxWidth: area.w - tableW - 20 })
    // Where it goes – boxes often look alike, so this is big and boxed.
    if (one) {
      const loc = where(one), pg = page(one)
      const text = loc ? `INSTALL AT: ${loc}${pg ? `  ·  ${pg}` : ''}`.toUpperCase() : 'INSTALL LOCATION NOT SET – ADD A ROOM / LOCATION TO THIS BOX'
      const w = Math.min(area.w - tableW - 20, text.length * 2.05 + 8)
      svg.rect(area.x + 4, area.y + 14, w, 8, { lw: 0.5, fill: '#fff', stroke: '#000', rx: 1 })
      svg.text(area.x + 8, area.y + 18, text, { size: 3.4, weight: 'bold', maxWidth: w - 8 })
    }
    svg.text(area.x + 4, area.y + 10.5, `FRONT VIEW · SCALE ${scaleName(s)} ON ${o.sheet === 'ansiB' ? 'ANSI B' : o.sheet.toUpperCase()} · DATUM: TOP-LEFT CORNER OF FACE · DO NOT SCALE – USE DIMENSIONS`, { size: 2.4, fill: '#333', maxWidth: area.w - tableW - 20 })

    // The face, drawn by the same code as the designer, at true scale.
    svg.raw(`<g transform="translate(${ox} ${oy}) scale(${s})" color="#000">${plateInner(spec, { labels: true })}</g>`)

    // Datum mark.
    svg.line(X(0) - 4, Y(0), X(0) + 4, Y(0), { lw: 0.3 }); svg.line(X(0), Y(0) - 4, X(0), Y(0) + 4, { lw: 0.3 })
    svg.text(X(0) - 2, Y(0) - 5, '0,0', { size: 2.2, anchor: 'end', weight: 'bold' })

    const jacks = spec.inserts.filter((ins): ins is PlateInsert & { pid: string } => !!ins.pid && !!L.jacks[ins.pid])
    const names = engravings(spec)
    // Ordinate dimensions: x along the top, y down the left (one per distinct value).
    const xs = [...new Set(jacks.map((j) => Math.round(L.jacks[j.pid].x * 10) / 10))].sort((a, b) => a - b)
    const ys = [...new Set(jacks.map((j) => Math.round(L.jacks[j.pid].y * 10) / 10))].sort((a, b) => a - b)
    const baseY = Y(by0) - 6
    // Spread labels that would collide (min 3.4 mm apart on paper).
    const spread = (vals: number[], at: (v: number) => number) => {
      const pos: number[] = []
      vals.forEach((v, k) => { const want = at(v); pos.push(k && want - pos[k - 1] < 3.4 ? pos[k - 1] + 3.4 : want) })
      return pos
    }
    const xp = spread(xs, X)
    xs.forEach((v, k) => {
      svg.line(X(v), Y(by0) - 1, X(v), baseY, { lw: 0.15 })
      svg.line(X(v), baseY, xp[k], baseY - 3, { lw: 0.15 })
      svg.raw(`<text x="${xp[k]}" y="${baseY - 4}" font-family="Arial Narrow, Arial, sans-serif" font-size="2.3" transform="rotate(-90 ${xp[k]} ${baseY - 4})" dominant-baseline="middle">${short(v)}</text>`)
    })
    const baseX = X(bx0) - 6
    const yp = spread(ys, Y)
    ys.forEach((v, k) => {
      svg.line(X(bx0) - 1, Y(v), baseX, Y(v), { lw: 0.15 })
      svg.line(baseX, Y(v), baseX - 3, yp[k], { lw: 0.15 })
      svg.text(baseX - 4, yp[k], short(v), { size: 2.3, anchor: 'end' })
    })
    // Centre lines through each cut-out.
    for (const j of jacks) {
      const c = L.jacks[j.pid], f = footprint(j.module)
      svg.line(X(c.x - f.w / 2 - 2), Y(c.y), X(c.x + f.w / 2 + 2), Y(c.y), { lw: 0.1, dash: '3 1 0.6 1' })
      svg.line(X(c.x), Y(c.y - f.h / 2 - 2), X(c.x), Y(c.y + f.h / 2 + 2), { lw: 0.1, dash: '3 1 0.6 1' })
    }
    // Overall size: width below, height to the right.
    const by = Y(by1) + 8, rx = X(bx1) + 8
    const arrowDim = (x1: number, y1: number, x2: number, y2: number) => {
      svg.line(x1, y1, x2, y2, { lw: 0.2 })
      const h = x1 === x2
      for (const [x, y, d] of [[x1, y1, 1], [x2, y2, -1]] as const) svg.path(h ? `M ${x} ${y} l -0.9 ${2.4 * d} l 1.8 0 z` : `M ${x} ${y} l ${2.4 * d} -0.9 l 0 1.8 z`, { fill: '#000', lw: 0 })
    }
    svg.line(X(0), Y(L.h) + 1, X(0), by + 2, { lw: 0.15 }); svg.line(X(L.w), Y(L.h) + 1, X(L.w), by + 2, { lw: 0.15 })
    arrowDim(X(0), by, X(L.w), by)
    svg.text((X(0) + X(L.w)) / 2, by + 3.2, fmt(L.w), { size: 2.6, anchor: 'middle', weight: 'bold' })
    svg.line(X(L.w) + 1, Y(0), rx + 2, Y(0), { lw: 0.15 }); svg.line(X(L.w) + 1, Y(L.h), rx + 2, Y(L.h), { lw: 0.15 })
    arrowDim(rx, Y(0), rx, Y(L.h))
    svg.raw(`<text x="${rx + 3.2}" y="${(Y(0) + Y(L.h)) / 2}" font-family="Arial Narrow, Arial, sans-serif" font-size="2.6" font-weight="bold" text-anchor="middle" transform="rotate(-90 ${rx + 3.2} ${(Y(0) + Y(L.h)) / 2})">${fmt(L.h)}</text>`)

    // Balloons: item number at each cut-out (top-right of its flange).
    jacks.forEach((j, k) => {
      const c = L.jacks[j.pid], f = footprint(j.module)
      const bx = X(c.x + f.w / 2) + 1.2, byy = Y(c.y - f.h / 2) - 1.2
      svg.circle(bx, byy, 2, { fill: '#fff', lw: 0.25 })
      svg.text(bx, byy + 0.1, String(k + 1), { size: 2.2, anchor: 'middle', weight: 'bold' })
    })

    // Connector schedule.
    const tx = area.x + area.w - tableW, ty = area.y + 2
    const cols = [{ t: '#', w: 0.06 }, { t: 'CONNECTOR', w: 0.25 }, { t: 'ENGRAVING', w: 0.2 }, { t: `X ${o.units === 'in' ? 'IN' : 'MM'}`, w: 0.1 }, { t: `Y ${o.units === 'in' ? 'IN' : 'MM'}`, w: 0.1 }, { t: 'CUT-OUT / MOUNTING', w: 0.29 }]
    const rowH = 5
    const maxRows = Math.max(4, Math.floor((area.h * 0.62 - 12) / rowH))
    svg.text(tx, ty + 3, 'CONNECTOR SCHEDULE', { size: 3, weight: 'bold' })
    let y = ty + 7
    const row = (vals: string[], head: boolean) => {
      let x = tx
      svg.rect(tx, y, tableW, rowH, { lw: head ? 0.35 : 0.2, fill: head ? '#eee' : undefined })
      cols.forEach((c, k) => {
        svg.text(x + 1.2, y + rowH / 2, vals[k], { size: head ? 2.1 : 2.3, weight: head ? 'bold' : 'normal', maxWidth: tableW * c.w - 2.4 })
        x += tableW * c.w
        if (k < cols.length - 1) svg.line(x, y, x, y + rowH, { lw: 0.15 })
      })
      y += rowH
    }
    row(cols.map((c) => c.t), true)
    jacks.slice(0, maxRows).forEach((j, k) => {
      const c = L.jacks[j.pid], m = PLATE_MODULES[j.module]
      row([String(k + 1), (m?.name ?? j.module).toUpperCase(), names.get(j.pid) ?? '', short(c.x), short(c.y), cutoutOf(j.module)], false)
    })
    if (jacks.length > maxRows) { svg.text(tx, y + 3, `+ ${jacks.length - maxRows} MORE – SEE SCHEDULE EXPORT`, { size: 2.2, fill: '#555' }); y += 5 }

    // Where each one goes (grouped sheets).
    if (!one) {
      y += 6
      svg.text(tx, y, 'INSTALL LOCATIONS', { size: 3, weight: 'bold' }); y += 3
      const lc = [{ t: 'TAG', w: 0.2 }, { t: 'LOCATION / ROOM', w: 0.45 }, { t: 'PAGE', w: 0.35 }]
      const lrow = (vals: string[], head: boolean) => {
        let x = tx
        svg.rect(tx, y, tableW, rowH, { lw: head ? 0.35 : 0.2, fill: head ? '#eee' : undefined })
        lc.forEach((c, k) => { svg.text(x + 1.2, y + rowH / 2, vals[k], { size: head ? 2.1 : 2.4, weight: head || k === 0 ? 'bold' : 'normal', maxWidth: tableW * c.w - 2.4 }); x += tableW * c.w; if (k < lc.length - 1) svg.line(x, y, x, y + rowH, { lw: 0.15 }) })
        y += rowH
      }
      lrow(lc.map((c) => c.t), true)
      for (const e of d.eqs) lrow([e.tag, (where(e) || '— NOT SET —').toUpperCase(), page(e).toUpperCase()], false)
    }
    // Notes.
    y += 6
    svg.text(tx, y, 'NOTES', { size: 3, weight: 'bold' }); y += 4.5
    const free = (L.texts ?? []).map((t) => t.text.replace(/\n/g, ' / ')).filter(Boolean)
    const notes = [
      one ? `TAG: ${one.tag} – ${(where(one) || 'LOCATION NOT SET').toUpperCase()}` : `QTY ${d.eqs.length}: ${tags.join(', ')} (SEE INSTALL LOCATIONS)`,
      'MARK EACH PANEL ON THE BACK WITH ITS TAG SO IDENTICAL-LOOKING PANELS GO TO THE RIGHT LOCATION.',
      `TYPE: ${KIND[spec.kind].toUpperCase()} – ${spec.style.toUpperCase()}${size.gangs ? ` (${size.gangs}-GANG${size.decora ? ' DECORA' : ''})` : ''}${size.ru ? ` (${size.ru}RU, EIA-310)` : ''}`,
      `FACE: ${fmt(L.w)} W × ${fmt(L.h)} H${L.shape === 'round' ? ', ROUND' : ''}`,
      `FINISH: ${finishOf(L.finish).fab}`,
      `ENGRAVING: ${L.labelPos === 'none' ? 'NONE ON JACKS' : `JACK NAMES ${L.labelPos === 'above' ? 'ABOVE' : 'BELOW'} EACH CONNECTOR, 2.8 MM BOLD SANS, FILLED ${finishOf(L.finish).dark ? 'WHITE' : 'BLACK'}`}`,
      ...(free.length ? [`ADDITIONAL ENGRAVING: ${free.join(' · ').toUpperCase()}`] : []),
      ...(spec.power ? [`RECEPTACLE CIRCUIT: ${spec.power.volts} V / ${spec.power.amps} A`] : []),
      ...(() => {
        const out = jacks.map((j, k) => ({ k: k + 1, c: L.jacks[j.pid], f: footprint(j.module) })).filter((q) => q.c.x - q.f.w / 2 < 0 || q.c.y - q.f.h / 2 < 0 || q.c.x + q.f.w / 2 > L.w || q.c.y + q.f.h / 2 > L.h)
        return out.length ? [`⚠ ITEM${out.length > 1 ? 'S' : ''} ${out.map((q) => q.k).join(', ')} EXTEND${out.length > 1 ? '' : 'S'} PAST THE FACE – MOVE ${out.length > 1 ? 'THEM' : 'IT'} IN THE PLATE DESIGNER OR USE A LARGER PLATE BEFORE RELEASING`] : []
      })(),
      'ALL DIMENSIONS TO CONNECTOR CENTRES FROM DATUM (TOP-LEFT OF FACE). TOL ±0.2 MM UNLESS NOTED.',
      'VERIFY CUT-OUTS AGAINST CONNECTOR MANUFACTURER DRAWINGS BEFORE MACHINING.',
      `MODEL: ${d.model.toUpperCase()}`,
    ]
    notes.forEach((t, k) => { svg.text(tx, y, `${k + 1}. ${t}`, { size: 2.3, maxWidth: tableW }); y += 4 })
    return svg.toString()
  })
}



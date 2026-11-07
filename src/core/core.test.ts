import { beforeEach, describe, expect, it } from 'vitest'
import {
  addEquipment, addPatchBay, addRack, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, candidates, cellSpanMM, channelCenterMM,
  connect, evaluate, geometryProblems, layoutLabels, newProject, pageToSVG, productProblems, ProductLibrary, RackLayout,
  refreshLabels, removeEquipment, setCell, findCell, updateEquipment, validate, audit, applyMeasured, evenlySpaced,
  type EquipmentInstance, type PortAddress, type Project, STOCKS, defaultPrintOptions, segments,
  BUILT_IN_MANUFACTURERS, ManufacturerDirectory,
  isNewerVersion, circuitLoads, sourcesFor, sourceRating, connectMany, createGroup, membersOf, autoGroupBySystem, groupsOf, ungroup, renumberCables, cablesToCSV, cableRows, makePlateProduct, toPerCell, finishPerCell, repeatPattern, fitToWidth, gapBefore,
  fillSeries, mergeTitle, fittingCables, cableSpec, resolve, titlesIn, toggleStyle, pasteAt, copyRange, setNormals, cycleNormal, moveBay, removePatchBay,
} from './index'

const product = (key: string) => {
  const p = BUILT_IN_PRODUCTS.find((x) => x.key === key)
  if (!p) throw new Error(`missing fixture ${key}`)
  return p
}
const at = (e: EquipmentInstance, port: string): PortAddress => ({ equipment: e.id, port })
const origin = { x: 0, y: 0 }

describe('connection validation', () => {
  let p: Project
  let matrix: EquipmentInstance, projector: EquipmentInstance, router: EquipmentInstance, pdu: EquipmentInstance
  let dsp: EquipmentInstance, amp: EquipmentInstance, speaker: EquipmentInstance, sw: EquipmentInstance

  beforeEach(() => {
    p = newProject()
    matrix = addEquipment(p, product('generic.matrix.8x8'), origin)
    projector = addEquipment(p, product('generic.projector.laser.4k'), origin)
    router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    pdu = addEquipment(p, product('generic.pdu.8'), origin)
    dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    amp = addEquipment(p, product('generic.amp.4ch'), origin)
    speaker = addEquipment(p, product('generic.speaker.ceiling70v'), origin)
    sw = addEquipment(p, product('generic.switch.24poe'), origin)
  })

  it('HDMI out → HDMI in is clean', () => {
    const v = validate(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1'), { specKey: 'hdmi.uhs' })
    expect(v.issues).toEqual([])
    expect(v.signal).toBe('hdmi20')
  })

  it('normalises direction when dragging from an input', () => {
    const v = validate(p, at(projector, 'in.hdmi.1'), at(matrix, 'out.hdmi.01'))
    expect(v.allowed).toBe(true)
    expect(v.normalized?.[0]).toEqual(at(matrix, 'out.hdmi.01'))
  })

  it('Dante device → switch port', () => {
    expect(validate(p, at(dsp, 'dante.pri'), at(sw, 'port.01'), { specKey: 'cat6a' }).allowed).toBe(true)
  })

  it('PDU outlet → device inlet with the right cord', () => {
    const v = validate(p, at(pdu, 'out.01'), at(matrix, 'pwr.in'), { specKey: 'pwr.c13.515' })
    expect(v.issues).toEqual([])
  })

  it('UPS outlets with locking/20 A receptacles get a cord that fits (bug: no option offered)', () => {
    const ups = addEquipment(p, { ...structuredClone(product('generic.pdu.8')), key: 'user.ups' }, origin)
    const port0 = ups.product.ports[0]
    // 5-20R: a 5-20P cord fits, and so does a 5-15P cord (T-slot receptacle)
    port0.connector = 'nema5_20'
    expect(validate(p, at(ups, port0.id), at(matrix, 'pwr.in'), { specKey: 'pwr.c13.520' }).issues).toEqual([])
    expect(validate(p, at(ups, port0.id), at(matrix, 'pwr.in'), { specKey: 'pwr.c13.515' }).issues).toEqual([])
    const wrong = validate(p, at(ups, port0.id), at(matrix, 'pwr.in'), { specKey: 'pwr.true1.515' })
    expect(wrong.issues.some((i) => i.rule === 'connector' && i.severity === 'error')).toBe(true)
    expect(fittingCables(port0, resolve(p, at(matrix, 'pwr.in'))!.port).length).toBeGreaterThan(0)
    // L5-30R: the catalog has an L5-30P → C13 cord
    port0.connector = 'nemaL5_30'
    const v = validate(p, at(ups, port0.id), at(matrix, 'pwr.in'))
    expect(v.suggestedCables[0]?.key).toBe('pwr.c13.l530')
    // L21-30R has no catalog cord: an exact-fit cable is suggested and validates clean
    port0.connector = 'nemaL21_30'
    const s = validate(p, at(ups, port0.id), at(matrix, 'pwr.in')).suggestedCables[0]
    expect(s.name).toBe('Power Cord NEMA L21-30P → C13')
    expect(validate(p, at(ups, port0.id), at(matrix, 'pwr.in'), { specKey: s.key }).issues).toEqual([])
    expect(cableSpec(s.key)?.name).toBe(s.name)
  })

  it('does not invent a cable between mismatched signal connectors', () => {
    expect(validate(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.sdi')).suggestedCables).toEqual([])
  })

  it('suggests a mating cable', () => {
    expect(validate(p, at(router, 'out.sdi.01'), at(projector, 'in.sdi')).suggestedCables[0]?.key).toBe('sdi.12g')
  })

  it('blocks an SDI cable into an HDMI port', () => {
    const v = validate(p, at(router, 'out.sdi.01'), at(projector, 'in.hdmi.1'), { specKey: 'sdi.12g' })
    expect(v.allowed).toBe(false)
    expect(v.issues.some((i) => i.rule === 'signal')).toBe(true)
    expect(v.issues.some((i) => i.rule === 'connector')).toBe(true)
  })

  it('blocks signal into an AC receptacle, with no follow-on noise', () => {
    const v = validate(p, at(router, 'out.sdi.01'), at(pdu, 'out.01'))
    expect(v.allowed).toBe(false)
    expect(v.issues.map((i) => i.rule)).toEqual(['domain'])
  })

  it('blocks a cable that does not physically fit', () => {
    const v = validate(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1'), { specKey: 'sdi.12g' })
    expect(v.allowed).toBe(false)
    expect(v.issues.some((i) => i.rule === 'connector')).toBe(true)
  })

  it('blocks input→input and output→output', () => {
    expect(validate(p, at(projector, 'in.hdmi.1'), at(matrix, 'in.hdmi.01')).issues[0].rule).toBe('direction')
    expect(validate(p, at(matrix, 'out.hdmi.01'), at(matrix, 'out.hdmi.02')).allowed).toBe(false)
  })

  it('blocks speaker level into a line input; allows amp → 70V speaker', () => {
    expect(validate(p, at(amp, 'out.spk.01'), at(dsp, 'in.mic.01')).allowed).toBe(false)
    expect(validate(p, at(amp, 'out.spk.01'), at(speaker, 'in.spk'), { specKey: 'spk.euro' }).issues).toEqual([])
  })

  it('enforces port occupancy', () => {
    expect(connect(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1')).allowed).toBe(true)
    const v = validate(p, at(matrix, 'out.hdmi.02'), at(projector, 'in.hdmi.1'))
    expect(v.issues.some((i) => i.rule === 'occupancy')).toBe(true)
  })

  it('warns on long HDMI, errors on >100 m Ethernet', () => {
    const h = validate(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1'), { specKey: 'hdmi.uhs', lengthMeters: 12 })
    expect(h.allowed).toBe(true)
    expect(h.severity).toBe('warning')
    expect(validate(p, at(dsp, 'dante.pri'), at(sw, 'port.01'), { specKey: 'cat6a', lengthMeters: 120 }).allowed).toBe(false)
  })

  it('compatibility matrix', () => {
    expect(evaluate('sdi3G', 'sdi12G').kind).toBe('exact')
    expect(evaluate('sdi12G', 'sdi3G').kind).toBe('incompatible')
    expect(evaluate('analogMic', 'analogLine').kind).toBe('degraded')
    expect(evaluate('dante', 'aes67').kind).toBe('degraded')
    expect(evaluate('sacn', 'artNet').kind).toBe('incompatible')
    expect(evaluate('dante', 'ethernet1G').kind).toBe('exact')
  })

  it('drag candidates exclude incompatible ports', () => {
    const c = candidates(p, at(router, 'out.sdi.01'))
    expect(c.has(`${projector.id}/in.sdi`)).toBe(true)
    expect(c.has(`${projector.id}/in.hdmi.1`)).toBe(false)
    expect(c.has(`${pdu.id}/out.01`)).toBe(false)
  })

  it('connect auto-labels and picks a cable', () => {
    const v = connect(p, at(projector, 'in.hdmi.1'), at(matrix, 'out.hdmi.01'))
    const cable = p.cables[0]
    expect(v.cableId).toBe(cable.id)
    expect(cable.label).toBe('V-0001')
    expect(cable.specKey).toBe('hdmi.uhs')
    expect(cable.from).toEqual(at(matrix, 'out.hdmi.01'))
  })

  it('removing equipment removes its cables', () => {
    connect(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1'))
    removeEquipment(p, [projector.id])
    expect(p.cables).toEqual([])
  })

  it('round-trips through JSON', () => {
    connect(p, at(matrix, 'out.hdmi.01'), at(projector, 'in.hdmi.1'))
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })

  it('auditor flags unpowered devices', () => {
    expect(audit(p).some((i) => i.rule === 'unpowered')).toBe(true)
  })
})

describe('catalog', () => {
  it('every built-in product is valid', () => {
    for (const x of BUILT_IN_PRODUCTS) expect(productProblems(x), x.key).toEqual([])
  })
  it('search ranks and filters', () => {
    const lib = new ProductLibrary(BUILT_IN_PRODUCTS, [])
    expect(lib.search({ text: 'dante dsp generic' })[0].key).toBe('generic.dsp.12x8')
    expect(lib.search({ text: 'dlive' }).some((x) => x.manufacturer === 'Allen & Heath')).toBe(true)
    expect(lib.search({ text: 'atem' })[0].manufacturer).toBe('Blackmagic Design')
    expect(lib.search({ domain: 'lighting' }).length).toBeGreaterThanOrEqual(2)
    expect(lib.search({ rackOnly: true }).every((x) => x.physical.rackUnits != null)).toBe(true)
  })
})

describe('update version check', () => {
  it('compares versions numerically', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('v1.10.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('2.0.0-beta.1', '1.9.0')).toBe(true)
  })
})

describe('device groups', () => {
  it('creates, auto-detects system, auto-groups and prunes', () => {
    const p = newProject()
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    const pj = addEquipment(p, product('generic.projector.laser.4k'), origin)
    const matrix = addEquipment(p, product('generic.matrix.8x8'), origin)
    const fx = addEquipment(p, product('generic.fixture.ledwash'), origin)
    const g = createGroup(p, [dsp.id, amp.id], { name: 'FOH Audio' })
    expect(g.system).toBe('audio')
    expect(membersOf(p, g.id).map((e) => e.id)).toEqual([dsp.id, amp.id])
    const n = autoGroupBySystem(p)
    expect(n).toBe(3)
    const byName = Object.fromEntries(groupsOf(p).map((x) => [x.name, membersOf(p, x.id).map((e) => e.tag)]))
    expect(byName['Video']).toEqual([pj.tag, matrix.tag])
    expect(byName['Lighting']).toEqual([fx.tag])
    removeEquipment(p, [fx.id])
    // Pages stay when they empty out.
    expect(membersOf(p, groupsOf(p).find((x) => x.name === 'Lighting')!.id)).toHaveLength(0)
    ungroup(p, g.id)
    expect(dsp.groupId).toBeUndefined()
    expect(createGroup(p, [dsp.id]).name).toBe('Audio')
  })
})

describe('cable schedule', () => {
  it('renumbers by system, in device order, keeping labels unique', () => {
    const p = newProject()
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const cams = [0, 1, 2].map(() => addEquipment(p, product('generic.camera.ptz'), origin))
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    connect(p, at(cams[2], 'out.sdi'), at(router, 'in.sdi.03'))
    connect(p, at(cams[0], 'out.sdi'), at(router, 'in.sdi.01'))
    connect(p, at(dsp, 'out.line.01'), at(amp, 'in.line.01'))
    connect(p, at(cams[1], 'out.sdi'), at(router, 'in.sdi.02'))
    p.cables[2].label = 'V-001' // an audio cable squatting on a video label
    const n = renumberCables(p, { schemes: { video: { prefix: 'VID', start: 101, digits: 3 }, audio: { prefix: 'AUD', start: 1, digits: 3 } }, order: 'from' })
    expect(n).toBe(4)
    const byTo = (port: string) => p.cables.find((c) => c.to.port === port)!.label
    expect([byTo('in.sdi.01'), byTo('in.sdi.02'), byTo('in.sdi.03')]).toEqual(['VID-101', 'VID-102', 'VID-103'])
    expect(byTo('in.line.01')).toBe('AUD-001')
    // only the selected ones, skipping numbers others still use
    const sel = new Set([p.cables[0].id])
    renumberCables(p, { ids: sel, schemes: { video: { prefix: 'VID', start: 101, digits: 3 } } })
    expect(new Set(p.cables.map((c) => c.label)).size).toBe(4)
    expect(cablesToCSV(p).split('\n')[0]).toContain('Label,System,From')
    expect(cableRows(p).every((r) => r.system !== null)).toBe(true)
  })
})

describe('per-cell strip geometry (PatchCAD-style)', () => {
  it('converts uniform strips without moving any cell', () => {
    const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'generic.trs.2x24')!
    const g = t.rows[0].strip
    const p = toPerCell(g)
    for (let i = 0; i < g.channelCount; i++) {
      expect(cellSpanMM(p, i).x).toBeCloseTo(cellSpanMM(g, i).x, 2)
      expect(cellSpanMM(p, i).width).toBeCloseTo(cellSpanMM(g, i).width, 2)
    }
    expect(p.stripWidthMM).toBeCloseTo(g.stripWidthMM, 2)
  })
  it('widths, gaps, padding and Repeat Till End', () => {
    let g = finishPerCell({ ...toPerCell(BUILT_IN_PATCH_TEMPLATES[0].rows[0].strip), channelCount: 8, cellWidthsMM: [10, 12, 10, 12, 10, 12, 10, 12], gapsAfterMM: { 4: 5 }, padLeftMM: 2, padRightMM: 3 })
    expect(g.stripWidthMM).toBe(2 + 88 + 5 + 3)
    expect(cellSpanMM(g, 4).x).toBe(2 + 44 + 5)
    expect(gapBefore(g, 4)).toBe(true)
    g = finishPerCell({ ...g, cellWidthsMM: [8, 9, 1, 1, 1, 1, 1, 1], gapsAfterMM: { 2: 4 } })
    const r = repeatPattern(g, 2)
    expect(r.cellWidthsMM).toEqual([8, 9, 8, 9, 8, 9, 8, 9])
    expect(Object.keys(r.gapsAfterMM!).sort()).toEqual(['2', '4', '6'])
    const f = fitToWidth(r, 200)
    expect(f.stripWidthMM).toBeCloseTo(200, 2)
  })
})

describe('wall plates and floor boxes', () => {
  it('builds front jacks and rear tie lines, and passes signals both ways', () => {
    const plate = makePlateProduct({ kind: 'wallPlate', style: '2-Gang', inserts: [
      { module: 'xlrF', count: 2, label: 'Podium', rear: 'idcPunchdown' }, { module: 'hdmi', count: 1, rear: 'same' }] }, { model: 'Podium Plate' })
    expect(plate.category).toBe('wallPlate')
    expect(plate.ports.map((x) => `${x.label}|${x.face}|${x.connector}`)).toEqual([
      'Podium 1|front|xlr3', 'Podium 1 (rear)|rear|idcPunchdown', 'Podium 2|front|xlr3', 'Podium 2 (rear)|rear|idcPunchdown', 'HDMI|front|hdmi', 'HDMI (rear)|rear|hdmi'])
    const p = newProject()
    const wp = addEquipment(p, plate, origin)
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    const pj = addEquipment(p, product('generic.projector.laser.4k'), origin)
    const matrix = addEquipment(p, product('generic.matrix.8x8'), origin)
    // tie line from the plate's rear into a DSP input
    expect(validate(p, at(wp, 'xlrF.1.r'), at(dsp, 'in.mic.01')).allowed).toBe(true)
    // HDMI from the plate to a projector, and from a matrix output into the plate
    expect(validate(p, at(wp, 'hdmi.1.f'), at(pj, 'in.hdmi.1'), { specKey: 'hdmi.uhs' }).issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(validate(p, at(matrix, 'out.hdmi.01'), at(wp, 'hdmi.1.r'), { specKey: 'hdmi.uhs' }).allowed).toBe(true)
    // but not an HDMI jack into an audio input
    expect(validate(p, at(wp, 'hdmi.1.f'), at(dsp, 'in.mic.02')).allowed).toBe(false)
  })
  it('a floor box with receptacles is a building power source', () => {
    const p = newProject()
    const fb = addEquipment(p, product('generic.floorbox.4'), origin)
    const pdu = addEquipment(p, product('generic.pdu.8'), origin)
    expect(connect(p, at(fb, 'pwr520.1.out'), at(pdu, 'in'), 'direct').allowed).toBe(true)
    expect(circuitLoads(p).find((l) => l.source.id === fb.id)?.devices.map((d) => d.id)).toEqual([pdu.id])
  })
})

describe('patch multiples', () => {
  it('wires a list of ports onto consecutive ports, skipping used and invalid ones', () => {
    const p = newProject()
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const cams = [0, 1, 2, 3].map(() => addEquipment(p, product('generic.camera.ptz'), origin))
    // Router input 3 already used
    const pre = addEquipment(p, product('generic.camera.ptz'), origin)
    connect(p, at(pre, 'out.sdi'), at(router, 'in.sdi.03'))
    const r = connectMany(p, cams.map((c) => at(c, 'out.sdi')), at(router, 'in.sdi.02'))
    expect(r.skipped).toEqual([])
    expect(r.made.map((m) => m.to.port)).toEqual(['in.sdi.02', 'in.sdi.04', 'in.sdi.05', 'in.sdi.06'])
  })
  it('router outputs onto patch bay rows, in click order, and reports leftovers', () => {
    const p = newProject()
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.12g.2x16')!, origin)
    const outs = ['out.sdi.05', 'out.sdi.01', 'out.sdi.02'].map((x) => at(router, x))
    const r = connectMany(p, outs, { equipment: bay.equipment, port: 'r1.c15' })
    // r1.c15, r1.c16, then the bay's next row (same direction) r2.c01? No: row 2 faces the other way, so it stops after r1.c16
    expect(r.made.map((m) => [m.from.port, m.to.port])).toEqual([['out.sdi.05', 'r1.c15'], ['out.sdi.01', 'r1.c16']])
    expect(r.skipped.map((s) => s.port)).toEqual(['out.sdi.02'])
  })
  it('a source that cannot connect anywhere does not consume target ports', () => {
    const p = newProject()
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const cam = addEquipment(p, product('generic.camera.ptz'), origin)
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    const r = connectMany(p, [at(dsp, 'out.line.01'), at(cam, 'out.sdi')], at(router, 'in.sdi.01'))
    expect(r.made.map((m) => m.to.port)).toEqual(['in.sdi.01'])
    expect(r.skipped.map((s) => s.port)).toEqual(['out.line.01'])
  })
})

describe('patch bays are passive', () => {
  const tmpl = (k: string) => BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === k)!
  it('any row accepts sources and destinations (bug: input→output refused)', () => {
    const p = newProject()
    const bay = addPatchBay(p, tmpl('generic.12g.2x16'), origin)
    const pb = p.equipment.find((e) => e.id === bay.equipment)!
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const pj = addEquipment(p, product('generic.projector.laser.4k'), origin)
    const errs = (v: { issues: { severity: string }[] }) => v.issues.filter((i) => i.severity === 'error')
    // Source into the bottom ("output") row, destination from the top ("input") row: both fine now
    expect(errs(validate(p, at(router, 'out.sdi.01'), at(pb, 'r2.c01'), { specKey: 'sdi.12g' }))).toEqual([])
    expect(errs(validate(p, at(pb, 'r1.c01'), at(pj, 'in.sdi'), { specKey: 'sdi.12g' }))).toEqual([])
    // Dragging from the device input side normalises too
    expect(errs(validate(p, at(router, 'in.sdi.01'), at(pb, 'r1.c02')))).toEqual([])
    // Bay to bay (tie lines)
    const bay2 = addPatchBay(p, tmpl('generic.12g.2x16'), origin)
    expect(errs(validate(p, at(pb, 'r2.c05'), { equipment: bay2.equipment, port: 'r2.c05' }, { specKey: 'sdi.12g' }))).toEqual([])
    expect(connect(p, at(router, 'out.sdi.02'), at(pb, 'r1.c03'), 'sdi.12g').allowed).toBe(true)
  })
  it('warns (not blocks) when a signal exceeds the bay rating; blocks the wrong family', () => {
    const p = newProject()
    const bay = addPatchBay(p, tmpl('generic.bnc.2x16'), origin)
    const pb = p.equipment.find((e) => e.id === bay.equipment)!
    const router = addEquipment(p, product('generic.sdi.router.12x12'), origin)
    const v = validate(p, at(router, 'out.sdi.01'), at(pb, 'r1.c01'), { specKey: 'sdi.12g' })
    expect(v.allowed).toBe(true)
    expect(v.issues.some((i) => i.rule === 'patch-rating' && i.severity === 'warning')).toBe(true)
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    expect(validate(p, at(dsp, 'out.line.01'), at(pb, 'r1.c02')).allowed).toBe(false)
  })
})

describe('building power', () => {
  it('rolls load up from devices through a PDU to the wall circuit', () => {
    const p = newProject()
    const wall = addEquipment(p, product('generic.power.520.duplex'), origin)
    const pdu = addEquipment(p, product('generic.pdu.8'), origin)
    const pj = addEquipment(p, product('generic.projector.laser.4k'), origin)
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    // The PDU's own plug goes straight into the wall: "direct" is suggested and valid
    const v = validate(p, at(pdu, 'in'), at(wall, 'out.01'))
    expect(v.suggestedCables[0]?.key).toBe('direct')
    expect(connect(p, at(wall, 'out.01'), at(pdu, 'in'), 'direct').issues.filter((i) => i.severity === 'error')).toEqual([])
    connect(p, at(pdu, 'out.01'), at(pj, 'pwr.in'), 'pwr.c13.515')
    connect(p, at(pdu, 'out.02'), at(amp, 'pwr.in'))
    const load = circuitLoads(p).find((l) => l.source.id === wall.id)!
    expect(load.devices.map((d) => d.id).sort()).toEqual([pdu.id, pj.id, amp.id].sort())
    expect(load.maxWatts).toBe(pdu.product.power.maxWatts + pj.product.power.maxWatts + amp.product.power.maxWatts)
    expect(load.rating?.ratedWatts).toBe(2400)
    expect(load.rating?.continuousWatts).toBe(1920)
    expect(sourcesFor(p, pj.id).map((s) => s.id)).toEqual([wall.id])
    // 10 + 780 + 1200 = 1990 W > 1920 W continuous on a 20 A circuit
    expect(audit(p).some((i) => i.rule === 'circuit-continuous')).toBe(true)
    // Put it on a 15 A breaker: 1990 W > 1800 W rated
    wall.circuit = { panel: 'LP-1', circuit: '12', breakerAmps: 15 }
    const issues = audit(p)
    expect(issues.find((i) => i.rule === 'circuit-overload')?.message).toContain('LP-1 / 12')
  })
  it('flags devices whose power never reaches a building source', () => {
    const p = newProject()
    addEquipment(p, product('generic.power.l530'), origin)
    const pdu = addEquipment(p, product('generic.pdu.8'), origin)
    const pj = addEquipment(p, product('generic.projector.laser.4k'), origin)
    connect(p, at(pdu, 'out.01'), at(pj, 'pwr.in'))
    expect(audit(p).some((i) => i.rule === 'no-building-power' && i.subject.kind === 'equipment' && i.subject.id === pj.id)).toBe(true)
    // A 5-15 plug does not go into an L5-30 receptacle
    const wall = p.equipment[0]
    expect(validate(p, at(pdu, 'in'), at(wall, 'out.1'), { specKey: 'direct' }).issues.some((i) => i.severity === 'error')).toBe(true)
  })
  it('three-phase Cam-Lok feed rating', () => {
    const p = newProject()
    const cs = addEquipment(p, product('generic.power.camlok.400'), origin)
    expect(sourceRating(cs)?.ratedWatts).toBe(Math.round(208 * 400 * Math.sqrt(3)))
  })
})

describe('manufacturer catalog', () => {
  const dir = new ManufacturerDirectory(BUILT_IN_MANUFACTURERS, [])
  const catalog = BUILT_IN_PRODUCTS.filter((p) => p.key.startsWith('cat.'))
  it('is large and spread across many makers', () => {
    expect(catalog.length).toBeGreaterThan(2000)
    expect(new Set(catalog.map((p) => p.manufacturer)).size).toBeGreaterThan(250)
  })
  it('keys are unique', () => {
    const keys = BUILT_IN_PRODUCTS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('every product names a directory manufacturer exactly', () => {
    const bad = catalog.filter((p) => dir.get(p.manufacturer)?.name !== p.manufacturer).map((p) => `${p.manufacturer} / ${p.model}`)
    expect(bad).toEqual([])
  })
  it('every product is flagged as unverified with a data note', () => {
    expect(catalog.every((p) => p.verified === false && !!p.dataNote)).toBe(true)
  })
  it('major makers have deep product lines', () => {
    const count = (m: string) => catalog.filter((p) => p.manufacturer === m).length
    for (const m of ['Blackmagic Design', 'Allen & Heath', 'Yamaha', 'DiGiCo', 'Shure', 'Sennheiser', 'QSC', 'Extron', 'Crestron', 'Clear-Com', 'Robe Lighting', 'MA Lighting', 'L-Acoustics', 'd&b audiotechnik'])
      expect(count(m), m).toBeGreaterThanOrEqual(10)
  })
  it('powered devices have a power input; passive ones draw nothing', () => {
    for (const p of catalog) {
      const hasInlet = p.ports.some((x) => x.group === 'Power' && x.direction === 'input')
      if (p.power.typicalWatts > 0 && !p.power.poweredByPoE) expect(hasInlet, p.key).toBe(true)
    }
  })
})

describe('rack layout', () => {
  it('detects overlap and snaps to a free slot', () => {
    const p = newProject()
    const rack = addRack(p)
    rack.spec.rackUnits = 12
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    const dsp = addEquipment(p, product('generic.dsp.12x8'), origin)
    updateEquipment(p, amp.id, (e) => { e.rackPlacement = { rack: rack.id, startUnit: 1, face: 'front' } })
    updateEquipment(p, dsp.id, (e) => { e.rackPlacement = { rack: rack.id, startUnit: 2, face: 'front' } })
    const l = RackLayout.of(p, rack.id)!
    expect(l.validate().some((i) => i.rule === 'rack-overlap')).toBe(true)
    expect(l.nearestFreeStart(1, 260, 2, 'front', { kind: 'equipment', id: dsp.id })).toBe(3)
  })

  it('front/rear depth conflict', () => {
    const p = newProject()
    const rack = addRack(p)
    rack.spec.mountingDepthMM = 500
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    const sw = addEquipment(p, product('generic.switch.24poe'), origin)
    amp.rackPlacement = { rack: rack.id, startUnit: 1, face: 'front' }
    sw.rackPlacement = { rack: rack.id, startUnit: 2, face: 'rear' }
    expect(RackLayout.of(p, rack.id)!.validate().some((i) => i.rule === 'rack-overlap')).toBe(true)
  })

  it('analytics', () => {
    const p = newProject()
    const rack = addRack(p)
    const amp = addEquipment(p, product('generic.amp.4ch'), origin)
    amp.rackPlacement = { rack: rack.id, startUnit: 40, face: 'front' }
    const l = RackLayout.of(p, rack.id)!
    expect(l.usedUnits).toBe(2)
    expect(l.totalWeightKG).toBeCloseTo(11)
    expect(l.totalHeatBTU).toBeCloseTo(204.73, 1) // 300 W × (1 − 0.8) × 3.412
    expect(l.validate().some((i) => i.rule === 'rack-cog')).toBe(true)
  })
})

describe('patch bays', () => {
  it('geometry with banks', () => {
    const g = { stripWidthMM: 100, stripHeightMM: 10, channelCount: 4, channelPitchMM: 10, firstChannelCenterMM: 10, groupSize: 2, groupGapMM: 5, linesPerCell: 2 }
    expect([0, 1, 2].map((i) => channelCenterMM(g, i))).toEqual([10, 20, 35])
    expect(geometryProblems(g)).toEqual([])
  })

  it('all built-in templates fit their strips', () => {
    for (const t of BUILT_IN_PATCH_TEMPLATES) for (const r of t.rows) expect(geometryProblems(r.strip), t.key).toEqual([])
  })

  it('measured pitch round-trips', () => {
    const g = evenlySpaced(431.8, 9.5, 48, { groupSize: 24, groupGapMM: 4 })
    const first = channelCenterMM(g, 0), last = channelCenterMM(g, 47)
    const m = applyMeasured({ ...g, channelPitchMM: 1 }, first, last)
    expect(m.channelPitchMM).toBeCloseTo(g.channelPitchMM, 6)
    expect(cellSpanMM(m, 47).x).toBeCloseTo(cellSpanMM(g, 47).x, 6)
  })

  it('labels bind from wiring; manual overrides survive refresh', () => {
    const p = newProject()
    const rx = addEquipment(p, product('generic.mic.wireless.rx'), origin)
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.trs.2x24')!, origin)
    const v = connect(p, at(rx, 'out.1'), { equipment: bay.equipment, port: 'r1.c01' })
    expect(v.allowed).toBe(true)
    expect(p.cables[0].specKey).toBe('xlr3.trs')

    refreshLabels(bay, p)
    expect(findCell(bay, 1, 1)?.text).toBe('WRX-01\nCH 1 OUT')
    expect(findCell(bay, 1, 2)?.text).toBe('')

    setCell(bay, 1, 1, { text: 'LECTERN', manual: true })
    refreshLabels(bay, p)
    expect(findCell(bay, 1, 1)?.text).toBe('LECTERN')
  })

  it('layout splits long strips and exports exact-scale SVG', () => {
    const p = newProject()
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.tt.2x48')!, origin)
    const pages = layoutLabels([bay], { ...defaultPrintOptions(), stock: STOCKS[0], landscape: true })
    const strips = pages.flatMap((pg) => pg.items).filter((i) => i.t === 'rect' && i.stroke)
    expect(strips.length).toBe(4) // 2 rows × 2 segments on letter landscape
    expect(segments(bay.template.rows[0].strip, 263.4).map((x) => x.last - x.first + 1)).toEqual([24, 24])
    expect(pageToSVG(pages[0])).toContain('width="279.400mm"')
  })
})

describe('patch bay editing (PatchCAD-style)', () => {
  const setup = () => {
    const p = newProject()
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.tt.2x48')!, origin)
    return { p, bay }
  }

  it('seeds normalling from the template', () => {
    const { bay } = setup()
    expect(bay.normals).toHaveLength(1)
    expect(bay.normals[0].afterRow).toBe(1)
    expect(bay.normals[0].modes.every((m) => m === 'half')).toBe(true)
  })

  it('fills series with tokens and letters', () => {
    const { bay } = setup()
    fillSeries(bay, { row: 1, a: 3, b: 1 }, 'MIC {nn}')
    expect([1, 2, 3].map((c) => findCell(bay, 1, c)?.text)).toEqual(['MIC 01', 'MIC 02', 'MIC 03'])
    fillSeries(bay, { row: 2, a: 1, b: 3 }, '{A}', 26)
    expect([1, 2, 3].map((c) => findCell(bay, 2, c)?.text)).toEqual(['Z', 'AA', 'AB'])
    expect(findCell(bay, 1, 1)?.manual).toBe(true)
  })

  it('merges titles and replaces overlaps', () => {
    const { bay } = setup()
    mergeTitle(bay, { row: 1, a: 1, b: 24 }, 'TIE LINES')
    mergeTitle(bay, { row: 1, a: 20, b: 30 }, 'DAW')
    expect(titlesIn(bay, 1).map((s) => [s.text, s.start, s.end])).toEqual([['TIE LINES', 1, 19], ['DAW', 20, 30]])
    mergeTitle(bay, { row: 1, a: 5, b: 6 }, 'X')
    expect(titlesIn(bay, 1).map((s) => [s.text, s.start, s.end])).toEqual([['TIE LINES', 1, 4], ['X', 5, 6], ['TIE LINES', 7, 19], ['DAW', 20, 30]])
  })

  it('toggles styles across a range', () => {
    const { bay } = setup()
    toggleStyle(bay, { row: 1, a: 1, b: 2 }, 'bold')
    expect(findCell(bay, 1, 2)?.style?.bold).toBe(true)
    toggleStyle(bay, { row: 1, a: 1, b: 2 }, 'bold')
    expect(findCell(bay, 1, 2)?.style).toBeUndefined()
  })

  it('copies and pastes TSV', () => {
    const { bay } = setup()
    pasteAt(bay, 1, 5, 'KICK\tSNARE\tHAT\n')
    expect(copyRange(bay, { row: 1, a: 5, b: 7 })).toBe('KICK\tSNARE\tHAT')
  })

  it('normalling edits and print layout include titles + symbols', () => {
    const { p, bay } = setup()
    setNormals(bay, 1, 1, 4, 'full')
    cycleNormal(bay, 1, 5)
    expect(bay.normals[0].modes.slice(0, 5)).toEqual(['full', 'full', 'full', 'full', 'full'])
    mergeTitle(bay, { row: 1, a: 1, b: 48 }, 'TIE LINES')
    bay.rowFill['1'] = '#fde2e2'
    const pages = layoutLabels(p.patchBays, defaultPrintOptions())
    const svg = pageToSVG(pages[0])
    expect(svg).toContain('TIE LINES')
    expect(svg).toContain('↕')
    expect(svg).toContain('#fde2e2')
  })

  it('moves and removes bays with their equipment', () => {
    const { p, bay } = setup()
    const b2 = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES[0], origin)
    moveBay(p, b2.id, -1)
    expect(p.patchBays[0].id).toBe(b2.id)
    removePatchBay(p, bay.id)
    expect(p.patchBays.map((b) => b.id)).toEqual([b2.id])
    expect(p.equipment.some((e) => e.id === bay.equipment)).toBe(false)
  })
})

describe('manufacturer directory', () => {
  const dir = new ManufacturerDirectory(BUILT_IN_MANUFACTURERS)
  it('has at least 200 unique AVL manufacturers', () => {
    expect(BUILT_IN_MANUFACTURERS.length).toBeGreaterThanOrEqual(200)
    const names = BUILT_IN_MANUFACTURERS.map((m) => m.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(BUILT_IN_MANUFACTURERS.every((m) => m.categories.length > 0)).toBe(true)
  })
  it('no alias collides with another maker\'s name', () => {
    for (const m of BUILT_IN_MANUFACTURERS) for (const a of m.aliases) {
      const owner = dir.get(a)
      if (owner) expect(owner.name, `${a} on ${m.name}`).toBe(m.name)
    }
  })
  it('resolves product lines to makers', () => {
    expect(dir.resolve('dLive')?.maker.name).toBe('Allen & Heath')
    expect(dir.resolve('atem')?.maker.name).toBe('Blackmagic Design')
    expect(dir.resolve('Q-SYS')?.maker.name).toBe('QSC')
    expect(dir.resolve('grandMA3')?.maker.name).toBe('MA Lighting')
    expect(dir.resolve('digico')?.maker.name).toBe('DiGiCo')
  })
  it('searches names first, then aliases, with category filter', () => {
    expect(dir.search('ross')[0].maker.name).toBe('Ross Video')
    expect(dir.search('carbonite')[0]).toMatchObject({ maker: { name: 'Ross Video' }, via: 'Carbonite' })
    expect(dir.search('', 'lighting').every((m) => m.maker.categories.includes('lighting'))).toBe(true)
  })
  it('merges user makers and product-referenced names', () => {
    const d = new ManufacturerDirectory(BUILT_IN_MANUFACTURERS, [{ name: 'Acme AV', categories: ['video'], aliases: [], source: 'user' }], ['Studio Widgets', 'shure'])
    expect(d.get('acme av')?.source).toBe('user')
    expect(d.get('Studio Widgets')).toBeTruthy()
    expect(d.all.filter((m) => m.name.toLowerCase() === 'shure')).toHaveLength(1)
  })
})

describe('half-rack units', () => {
  it('two ½-width 1RU devices share one unit side by side', async () => {
    const { RackLayout } = await import('./rack')
    const p = newProject()
    const r = addRack(p)
    const half = { ...BUILT_IN_PRODUCTS.find((x) => x.physical.rackUnits === 1)!, key: 'half', physical: { ...BUILT_IN_PRODUCTS.find((x) => x.physical.rackUnits === 1)!.physical, halfWidth: true } }
    const a = addEquipment(p, half, { x: 0, y: 0 }), b = addEquipment(p, half, { x: 0, y: 0 })
    a.rackPlacement = { rack: r.id, startUnit: 10, face: 'front', halfSlot: 'left' }
    const spot = RackLayout.of(p, r.id)!.nearestSpot(1, half.physical.depthMM, 10, 'front', { kind: 'equipment', id: b.id }, true, 'left')
    expect(spot).toEqual({ start: 10, slot: 'right' })
    b.rackPlacement = { rack: r.id, startUnit: 10, face: 'front', halfSlot: 'right' }
    expect(RackLayout.of(p, r.id)!.usedUnits).toBe(1)
  })
})

import { renameSeries } from './bulk'
it('names several ports at once', () => {
  expect(renameSeries('Mic 3', 4, 2)).toEqual(['Mic 1', 'Mic 2', 'Mic 3', 'Mic 4'])
  expect(renameSeries('Stage', 3)).toEqual(['Stage 1', 'Stage 2', 'Stage 3'])
  expect(renameSeries('Ch {n} In', 2)).toEqual(['Ch 1 In', 'Ch 2 In'])
  expect(renameSeries('IN07', 3)).toEqual(['IN07', 'IN08', 'IN09'])
})

// Generates examples/Demo Conference Room.rackflow using the real core APIs.
// Run: npx tsx scripts/make-demo.ts
import { writeFileSync } from 'node:fs'
import {
  addEquipment, addPatchBay, addRack, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, connect, newProject, refreshLabels, type EquipmentInstance,
  fillSeries, mergeTitle, setNormals,
} from '../src/core/index'

const p = newProject('Demo Conference Room')
p.info.client = 'Example Client'
p.info.location = 'Building 2'
const prod = (k: string) => BUILT_IN_PRODUCTS.find((x) => x.key === k)!
const add = (k: string, x: number, y: number, room = '') => { const e = addEquipment(p, prod(k), { x, y }); e.room = room; return e }
const a = (e: EquipmentInstance, port: string) => ({ equipment: e.id, port })

const cam = add('generic.camera.ptz', 0, 0, 'Main Room')
const wrx = add('generic.mic.wireless.rx', 0, 220, 'AV Closet')
const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.trs.2x24')!, { x: 320, y: 120 })
const dsp = add('generic.dsp.12x8', 640, 120, 'AV Closet')
const amp = add('generic.amp.4ch', 960, 120, 'AV Closet')
const spk1 = add('generic.speaker.ceiling70v', 1280, 80, 'Main Room')
const spk2 = add('generic.speaker.ceiling70v', 1280, 200, 'Main Room')
const matrix = add('generic.matrix.8x8', 640, 560, 'AV Closet')
const proj = add('generic.projector.laser.4k', 960, 520, 'Main Room')
const disp = add('generic.display.86', 960, 800, 'Main Room')
const sw = add('generic.switch.24poe', 320, 900, 'AV Closet')
const pdu = add('generic.pdu.8', 0, 560, 'AV Closet')
const wall1 = add('generic.power.520.duplex', -300, 560, 'AV Closet')
wall1.circuit = { panel: 'LP-1', circuit: '12' }
const wall2 = add('generic.power.520.duplex', 660, 40, 'AV Closet')
wall2.circuit = { panel: 'LP-1', circuit: '14' }

const ok = (v: { allowed: boolean; issues: { message: string }[] }, what: string) => { if (!v.allowed) throw new Error(`${what}: ${v.issues.map((i) => i.message).join('; ')}`) }
ok(connect(p, a(wrx, 'out.1'), { equipment: bay.equipment, port: 'r1.c01' }), 'wrx1→bay')
ok(connect(p, a(wrx, 'out.2'), { equipment: bay.equipment, port: 'r1.c02' }), 'wrx2→bay')
ok(connect(p, { equipment: bay.equipment, port: 'r2.c01' }, a(dsp, 'in.mic.01')), 'bay→dsp1')
ok(connect(p, { equipment: bay.equipment, port: 'r2.c02' }, a(dsp, 'in.mic.02')), 'bay→dsp2')
ok(connect(p, a(dsp, 'out.line.01'), a(amp, 'in.line.01')), 'dsp→amp')
ok(connect(p, a(amp, 'out.spk.01'), a(spk1, 'in.spk'), 'spk.euro'), 'amp→spk1')
ok(connect(p, a(amp, 'out.spk.02'), a(spk2, 'in.spk'), 'spk.euro'), 'amp→spk2')
ok(connect(p, a(cam, 'out.hdmi'), a(matrix, 'in.hdmi.01')), 'cam→matrix')
ok(connect(p, a(matrix, 'out.hdmi.01'), a(proj, 'in.hdmi.1')), 'matrix→proj')
ok(connect(p, a(matrix, 'out.hdmi.02'), a(disp, 'in.hdmi.1')), 'matrix→disp')
ok(connect(p, a(dsp, 'dante.pri'), a(sw, 'port.01'), 'cat6a'), 'dsp→sw')
ok(connect(p, a(amp, 'dante'), a(sw, 'port.02'), 'cat6a'), 'amp→sw')
ok(connect(p, a(cam, 'lan'), a(sw, 'port.03'), 'cat6a'), 'cam→sw')
ok(connect(p, a(pdu, 'out.01'), a(dsp, 'pwr.in')), 'pdu→dsp')
ok(connect(p, a(pdu, 'out.02'), a(matrix, 'pwr.in')), 'pdu→matrix')
ok(connect(p, a(pdu, 'out.03'), a(sw, 'pwr.in')), 'pdu→sw')
ok(connect(p, a(pdu, 'out.04'), a(wrx, 'pwr.in')), 'pdu→wrx')
ok(connect(p, a(wall1, 'out.01'), a(pdu, 'in'), 'direct'), 'wall→pdu')
ok(connect(p, a(wall2, 'out.01'), a(amp, 'pwr.in'), 'pwr.c19.520'), 'wall→amp')

const rack = addRack(p, 'AV Rack A')
const place = (e: EquipmentInstance | { id: string }, startUnit: number) => {
  const eq = p.equipment.find((x) => x.id === e.id)!
  eq.rackPlacement = { rack: rack.id, startUnit, face: 'front' }
}
place(amp, 3); place(pdu, 1); place(dsp, 20); place(matrix, 22); place(sw, 30); place(wrx, 26); place({ id: bay.equipment }, 28)

refreshLabels(p.patchBays[0], p)
const b0 = p.patchBays[0]
b0.name = 'A'; b0.location = 'AV Closet'
mergeTitle(b0, { row: 1, a: 1, b: 12 }, 'WIRELESS & STAGE')
mergeTitle(b0, { row: 1, a: 13, b: 24 }, 'SPARE')
mergeTitle(b0, { row: 2, a: 1, b: 24 }, 'DSP INPUTS')
b0.rowFill['1'] = '#fde2e2'; b0.rowFill['2'] = '#f8d7da'

// Two more bays laid out like a studio console patch (PatchCAD-style).
const tt = BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.tt.2x48')!
const b1 = addPatchBay(p, tt, { x: 0, y: 1300 })
b1.name = 'B'; b1.location = 'Console'
mergeTitle(b1, { row: 1, a: 1, b: 48 }, 'TIE LINES'); fillSeries(b1, { row: 1, a: 1, b: 48 }, 'TIE {n}')
mergeTitle(b1, { row: 2, a: 1, b: 48 }, 'MICROPHONE INPUTS'); fillSeries(b1, { row: 2, a: 1, b: 48 }, 'MIC {n}')
setNormals(b1, 1, 1, 48, 'full')
b1.rowFill['1'] = '#f1e3e3'; b1.rowFill['2'] = '#f8c9cc'
const b2 = addPatchBay(p, tt, { x: 400, y: 1300 })
b2.name = 'C'; b2.location = 'Console'
mergeTitle(b2, { row: 1, a: 1, b: 32 }, 'DAW OUTPUTS'); fillSeries(b2, { row: 1, a: 1, b: 32 }, 'DAW {n}')
mergeTitle(b2, { row: 1, a: 33, b: 48 }, 'FX RETURNS'); fillSeries(b2, { row: 1, a: 33, b: 48 }, 'FX {n}')
mergeTitle(b2, { row: 2, a: 1, b: 48 }, 'LINE INPUTS'); fillSeries(b2, { row: 2, a: 1, b: 48 }, 'LINE {n}')
b2.rowFill['1'] = '#d0ebff'; b2.rowFill['2'] = '#d3f9d8'
writeFileSync('examples/Demo Conference Room.rackflow', JSON.stringify(p, null, 2))
console.log(`devices ${p.equipment.length}, cables ${p.cables.length}`)

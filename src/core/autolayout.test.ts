import { describe, expect, it } from 'vitest'
import { addEquipment, autoLayout, BUILT_IN_PRODUCTS, connect, newProject, planChannels, type EquipmentInstance, type NodeGeom } from './index'

const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!
const geom = (eq: EquipmentInstance): NodeGeom => {
  const ins = eq.product.ports.filter((p) => p.direction === 'input'), outs = eq.product.ports.filter((p) => p.direction !== 'input')
  return { width: 240, height: 48 + Math.max(ins.length, outs.length) * 18, port: (id) => {
    const i = ins.findIndex((p) => p.id === id); if (i >= 0) return { x: 0, y: 48 + i * 18, side: 'left' }
    const o = outs.findIndex((p) => p.id === id); return o >= 0 ? { x: 240, y: 48 + o * 18, side: 'right' } : null
  } }
}

describe('auto layout', () => {
  it('puts sources left of destinations without overlaps', () => {
    const p = newProject()
    const router = addEquipment(p, prod('generic.sdi.router.12x12'), { x: 0, y: 0 })
    const pj = addEquipment(p, prod('generic.projector.laser.4k'), { x: -900, y: 300 })
    const matrix = addEquipment(p, prod('generic.matrix.8x8'), { x: 500, y: -400 })
    const out = router.product.ports.find((x) => x.direction === 'output' && x.connector === 'bnc')!
    const pin = pj.product.ports.find((x) => x.direction === 'input' && x.connector === 'bnc') ?? pj.product.ports.find((x) => x.direction === 'input' && x.signals.some((s) => s.startsWith('sdi')))
    const mo = matrix.product.ports.find((x) => x.direction === 'output' && x.connector === 'hdmi')!
    const pjh = pj.product.ports.find((x) => x.direction === 'input' && x.connector === 'hdmi')!
    if (pin) connect(p, { equipment: router.id, port: out.id }, { equipment: pj.id, port: pin.id })
    connect(p, { equipment: matrix.id, port: mo.id }, { equipment: pj.id, port: pjh.id })
    const pos = autoLayout(p, geom)
    expect(pos.get(pj.id)!.x).toBeGreaterThan(pos.get(matrix.id)!.x)
    const boxes = p.equipment.map((e) => ({ ...pos.get(e.id)!, ...geom(e) }))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
    }
  })

  it('gives wires in one gap separate, non-crossing tracks', () => {
    const plan = planChannels([
      { id: 'a', sx: 100, sy: 0, tx: 400, ty: 200, sourceRight: 100 },
      { id: 'b', sx: 100, sy: 20, tx: 400, ty: 220, sourceRight: 100 },
      { id: 'c', sx: 100, sy: 500, tx: 400, ty: 600, sourceRight: 100 },
    ])
    // Down-going: the higher wire turns further right.
    expect(plan.get('a')!).toBeGreaterThan(plan.get('b')!)
    // Non-overlapping spans can share the leftmost track.
    expect(plan.get('c')).toBe(plan.get('b'))
  })
})

import { addRack, defaultRackPrint, fillWithBlanks, rackElevationSheets, schematicSheets, defaultSchematic, emptySpans } from './index'
describe('drawings', () => {
  it('fills rack gaps and draws elevations + schematics', () => {
    const p = newProject()
    const r = addRack(p, 'AVR-001')
    const amp = addEquipment(p, prod('generic.amp.4ch'), { x: 0, y: 0 }); amp.rackPlacement = { rack: r.id, startUnit: 40, face: 'front' }
    const dsp = addEquipment(p, prod('generic.dsp.12x8'), { x: 400, y: 0 }); dsp.rackPlacement = { rack: r.id, startUnit: 30, face: 'front' }
    const before = emptySpans(p, r, 'front').length
    expect(fillWithBlanks(p, r.id, 'front', { onlyBetween: true })).toBeGreaterThan(0)
    expect(emptySpans(p, r, 'front').length).toBeLessThan(before)
    const sheets = rackElevationSheets(p, defaultRackPrint())
    expect(sheets).toHaveLength(1)
    expect(sheets[0]).toContain('AVR-001')
    expect(sheets[0]).toContain('BLANK PANEL')
    const sch = schematicSheets(p, defaultSchematic(p))
    expect(sch[0]).toContain(amp.tag)
  })
})

import { freeSpot, nodeGeom, placeInFreeSpace, addPatchBay, BUILT_IN_PATCH_TEMPLATES } from './index'
describe('free space', () => {
  it('puts a new patch bay where nothing is', () => {
    const p = newProject()
    for (let i = 0; i < 6; i++) addEquipment(p, prod('generic.dsp.12x8'), { x: (i % 3) * 300, y: Math.floor(i / 3) * 600 })
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'leviton.6a586-u48')!, { x: 300, y: 0 })
    placeInFreeSpace(p, bay.equipment, nodeGeom)
    const boxes = p.equipment.map((e) => ({ ...e.position, ...nodeGeom(e) }))
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
    }
    expect(freeSpot(newProject(), { width: 10, height: 10 }, { x: 13, y: 27 }, nodeGeom)).toEqual({ x: 20, y: 20 })
  })
})

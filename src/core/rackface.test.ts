import { describe, expect, it } from 'vitest'
import { addEquipment, addPatchBay, addRack, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, newProject, RackLayout, rackFaceLayout, rackFacePorts } from './index'

const o = { x: 0, y: 0 }
const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

describe('rack elevation jack faces', () => {
  it('a 24-port switch goes odd over even in two rows', () => {
    const p = newProject()
    const sw = addEquipment(p, prod('generic.switch.24poe'), o)
    const ports = rackFacePorts(sw, 'front')
    const l = rackFaceLayout(sw, 'front', 420, 29)
    expect(l.jacks.length).toBe(ports.length)
    if (ports.length >= 24) {
      const ys = [...new Set(l.jacks.map((j) => j.y))]
      expect(ys.length).toBe(2)
      expect(l.jacks[0].y).toBeLessThan(l.jacks[1].y === l.jacks[0].y ? Infinity : l.jacks[1].y)
    }
    for (const j of l.jacks) { expect(j.x).toBeGreaterThan(24); expect(j.x).toBeLessThan(420) }
  })

  it('patch bays keep one line per row', () => {
    const p = newProject()
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'generic.12g.2x16')!, o)
    const eq = p.equipment.find((e) => e.id === (bay as { id: string }).id) ?? p.equipment[p.equipment.length - 1]
    const l = rackFaceLayout(eq, 'front', 420, 29)
    if (l.jacks.length) expect(new Set(l.jacks.map((j) => j.y)).size).toBe(2)
  })
})

describe('moving several rack units together', () => {
  it('checks against what stays put and against each other', () => {
    const p = newProject()
    const rack = addRack(p); rack.spec.rackUnits = 12
    const a = addEquipment(p, prod('generic.amp.4ch'), o), b = addEquipment(p, prod('generic.switch.24poe'), o), c = addEquipment(p, prod('generic.dsp.12x8'), o)
    a.rackPlacement = { rack: rack.id, startUnit: 1, face: 'front' }
    b.rackPlacement = { rack: rack.id, startUnit: 4, face: 'front' }
    c.rackPlacement = { rack: rack.id, startUnit: 8, face: 'front' }
    const l = RackLayout.of(p, rack.id)!
    const ha = a.product.physical.rackUnits!, hb = b.product.physical.rackUnits!
    const item = (e: typeof a, start: number) => ({ id: e.id, height: e.product.physical.rackUnits!, depthMM: e.product.physical.depthMM, start })
    // Shift both up by one: they may overlap their own old spots.
    expect(l.canPlaceGroup([item(a, 2), item(b, 5)], 'front')).toBe(true)
    // Overlapping each other.
    expect(l.canPlaceGroup([item(a, 4), item(b, 4 + ha - 1)], 'front')).toBe(false)
    // Onto the device that stays.
    expect(l.canPlaceGroup([item(a, 8), item(b, 8 + ha)], 'front')).toBe(false)
    // Off the top.
    expect(l.canPlaceGroup([item(a, 12 - hb), item(b, 12)], 'front')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { addEquipment, addRack, BUILT_IN_PRODUCTS, newProject, RackLayout } from './index'

const o = { x: 0, y: 0 }
const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

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
    expect(l.canPlaceGroup([item(a, 2), item(b, 5)], 'front')).toBe(true)
    expect(l.canPlaceGroup([item(a, 4), item(b, 4 + ha - 1)], 'front')).toBe(false)
    expect(l.canPlaceGroup([item(a, 8), item(b, 8 + ha)], 'front')).toBe(false)
    expect(l.canPlaceGroup([item(a, 12 - hb), item(b, 12)], 'front')).toBe(false)
  })
})

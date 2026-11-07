import { describe, expect, it } from 'vitest'
import { addAccessory, addEquipment, addRack, BUILT_IN_PRODUCTS, fillWithBlanks, newProject, RackLayout } from './index'

describe('½-width 1U blanks', () => {
  it('two share one unit, a third goes elsewhere', () => {
    const p = newProject()
    const rack = addRack(p); rack.spec.rackUnits = 4
    const a = addAccessory(p, rack.id, 'blank', 1, 4, 'front', { half: 'left', label: 'SHURE CHARGER' })!
    const b = addAccessory(p, rack.id, 'blank', 1, 4, 'front', { half: 'left' })!
    expect([a.startUnit, a.half]).toEqual([4, 'left'])
    expect([b.startUnit, b.half]).toEqual([4, 'right'])
    const c = addAccessory(p, rack.id, 'blank', 1, 4, 'front', { half: 'left' })!
    expect(c.startUnit).not.toBe(4)
    expect(RackLayout.of(p, rack.id)!.canPlace(1, 25, 4, 'front')).toBe(false)
  })
  it('fill blanks puts a ½ blank beside ½-width gear', () => {
    const p = newProject()
    const rack = addRack(p); rack.spec.rackUnits = 3
    const half = BUILT_IN_PRODUCTS.find((x) => x.physical.halfWidth && x.physical.rackUnits === 1)!
    const eq = addEquipment(p, half, { x: 0, y: 0 })
    eq.rackPlacement = { rack: rack.id, startUnit: 2, face: 'front', halfSlot: 'left' }
    fillWithBlanks(p, rack.id, 'front')
    expect(rack.accessories.some((x) => x.startUnit === 2 && x.half === 'right')).toBe(true)
  })
})

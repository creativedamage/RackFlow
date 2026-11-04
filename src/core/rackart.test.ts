import { describe, expect, it } from 'vitest'
import { addEquipment, addRack, BUILT_IN_PRODUCTS, frontIO, newProject, panelPorts, RackLayout, rackArtSVG } from './index'

const o = { x: 0, y: 0 }
const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

describe('rack artwork', () => {
  it('switches patch on the front; amps and DSPs on the back', () => {
    const sw = prod('generic.switch.24poe'), amp = prod('generic.amp.4ch')
    expect(frontIO(sw)).toBe(true)
    expect(panelPorts(sw, 'front').length).toBeGreaterThan(20)
    expect(panelPorts(sw, 'front').some((x) => x.group === 'Power')).toBe(false)
    expect(frontIO(amp)).toBe(false)
    expect(panelPorts(amp, 'front')).toHaveLength(0)
    expect(panelPorts(amp, 'rear')).toHaveLength(amp.ports.length)
  })

  it('draws a cabled port as a plug in the jacket colour', () => {
    const p = newProject()
    const sw = addEquipment(p, prod('generic.switch.24poe'), o)
    const port = panelPorts(sw.product, 'front')[0]
    const svg = rackArtSVG(sw, 'front', { cabled: new Map([[port.id, 'Blue']]), hot: new Set(), heightU: 1, uid: 'x' })
    expect(svg).toContain('#1c64f2')
    expect(svg).toContain(sw.tag)
    expect(svg).toContain(sw.product.manufacturer.toUpperCase())
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
    expect(l.canPlaceGroup([item(a, 2), item(b, 5)], 'front')).toBe(true)
    expect(l.canPlaceGroup([item(a, 4), item(b, 4 + ha - 1)], 'front')).toBe(false)
    expect(l.canPlaceGroup([item(a, 8), item(b, 8 + ha)], 'front')).toBe(false)
    expect(l.canPlaceGroup([item(a, 12 - hb), item(b, 12)], 'front')).toBe(false)
  })
})

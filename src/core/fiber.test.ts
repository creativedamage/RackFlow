import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, fiberSVG, makeFiberProduct, newProject, productFace, rackElevationSheets, defaultRackPrint, addRack } from './index'

describe('modular fiber enclosures', () => {
  const spec = { enclosure: 'fhd-1u', fiberType: 'OS2' as const, slots: [{ module: 'mtp12-6lc', engraving: 'STAGE LEFT' }, { module: 'mtp12-6lc' }, { module: null }, { module: 'lc6' }] }
  it('builds ports per module with engraved names', () => {
    const p = makeFiberProduct(spec, { model: 'FOH Fiber' })
    expect(p.physical.rackUnits).toBe(1)
    const front = p.ports.filter((x) => x.face === 'front')
    expect(front).toHaveLength(18)
    expect(front[0].label).toBe('STAGE LEFT LC 1')
    expect(p.ports.filter((x) => x.connector === 'mpo12')).toHaveLength(2)
    expect(p.ports.find((x) => x.id === 's4.r1')?.connector).toBe('lcDuplex') // adapter panel: rear = front
    expect(fiberSVG(spec)).toMatch(/STAGE LEFT/)
    expect(productFace(p)?.rack).toBe(true)
  })
  it('trunks and patch cords pick single-mode cables; ships built-ins', () => {
    const pr = newProject()
    const a = addEquipment(pr, makeFiberProduct(spec, { model: 'A' }), { x: 0, y: 0 })
    const b = addEquipment(pr, makeFiberProduct(spec, { model: 'B' }), { x: 600, y: 0 })
    const v = connect(pr, { equipment: a.id, port: 's1.t1' }, { equipment: b.id, port: 's1.t1' })
    expect(v.allowed).toBe(true)
    expect(pr.cables[0].specKey).toBe('fiber.mtp12.sm')
    expect(BUILT_IN_PRODUCTS.some((x) => x.key === 'fs.fhd.1u.2x12.os2')).toBe(true)
    // Rack elevation shows the modules and engravings.
    const r = addRack(pr)
    a.rackPlacement = { rack: r.id as never, startUnit: 40, face: 'front' }
    const sheet = rackElevationSheets(pr, defaultRackPrint())[0]
    expect(sheet).toMatch(/STAGE LEFT/)
  })
})

describe('white logos on rack elevations', () => {
  it('prints light logos black', async () => {
    const { newProject, addRack, rackElevationSheets, defaultRackPrint, addAccessory } = await import('./index')
    const p = newProject(); const r = addRack(p)
    p.logos = [{ id: 'L1', name: 'w', dataUrl: 'data:image/png;base64,AAAA', light: true }]
    addAccessory(p, r.id, 'logo', 1, 10, 'front')
    const acc = p.racks[0].accessories[0]; acc.logoId = 'L1'
    const sheet = rackElevationSheets(p, defaultRackPrint())[0]
    expect(sheet).toMatch(/filter="url\(#rf-black\)"/)
  })
})

import { describe, expect, it } from 'vitest'
import { addEquipment, addPatchBay, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, connect, fittingCables, makePlateProduct, newPlateSpec, newProject, refreshLabels, resolve, splitPorts } from './index'

describe('network patch panels', () => {
  it('Leviton 48-port: 2 rows of 24, front + rear ports, wired both sides', () => {
    const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'leviton.6a586-u48')!
    expect(t.rows).toHaveLength(2)
    expect(t.rackUnits).toBe(2)
    const p = newProject()
    const bay = addPatchBay(p, t, { x: 0, y: 0 })
    const pb = p.equipment.find((e) => e.id === bay.equipment)!
    expect(pb.product.ports).toHaveLength(96)
    const front = pb.product.ports.find((x) => x.id === 'r1.c01.f')!, rear = pb.product.ports.find((x) => x.id === 'r1.c01')!
    expect(front.connector).toBe('rj45'); expect(rear.connector).toBe('idcPunchdown')
    expect(rear.signals).toContain('ethernet10G')
    expect(splitPorts(pb).left[0].id).toBe('r1.c01.f')
    // Switch → front jack (patch cord), wall plate rear → panel rear (horizontal cable).
    const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch' && x.ports.some((q) => q.connector === 'rj45'))!, { x: 0, y: 0 })
    const swPort = sw.product.ports.find((q) => q.connector === 'rj45')!
    const v1 = connect(p, { equipment: sw.id, port: swPort.id }, { equipment: pb.id, port: 'r1.c01.f' })
    expect(v1.cableId).toBeTruthy()
    const wp = addEquipment(p, makePlateProduct(newPlateSpec('wallPlate'), { model: 'WP' }), { x: 0, y: 0 })
    const wr = wp.product.ports.find((q) => q.connector === 'idcPunchdown')!
    const v2 = connect(p, { equipment: wp.id, port: wr.id }, { equipment: pb.id, port: 'r1.c01' })
    expect(v2.issues.filter((i) => i.severity === 'error')).toEqual([])
    const cable = p.cables.at(-1)!
    const fits = fittingCables(resolve(p, cable.from)!.port, resolve(p, cable.to)!.port).map((c) => c.key)
    expect(fits).toContain('cat6a.h')
    refreshLabels(bay, p)
    expect(bay.cells.find((c) => c.row === 1 && c.channel === 1)!.text).toContain(wp.tag)
  })
  it('Cat5e panels do not carry 10G', () => {
    const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'leviton.5g596-u24')!
    const p = newProject(); const bay = addPatchBay(p, t, { x: 0, y: 0 })
    expect(p.equipment[0].product.ports[0].signals).not.toContain('ethernet10G')
    expect(bay.template.termination).toBe('punchdown')
  })
})

describe('category check', () => {
  it('warns when a Cat5e cable lands on a Cat6A panel', () => {
    const p = newProject()
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'leviton.6a586-u24')!, { x: 0, y: 0 })
    const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch' && x.ports.some((q) => q.connector === 'rj45'))!, { x: 0, y: 0 })
    const v = connect(p, { equipment: sw.id, port: sw.product.ports.find((q) => q.connector === 'rj45')!.id }, { equipment: bay.equipment, port: 'r1.c01.f' }, 'cat5e')
    expect(v.issues.some((i) => i.rule === 'cable-category' && /Cat6A/.test(i.message))).toBe(true)
    expect(p.cables[0].specKey).toBe('cat5e')
  })
})

import { connectMany } from './index'
describe('patching multiples onto a two-sided panel', () => {
  it('keeps every connection on the rear when the first lands on the rear', () => {
    const p = newProject()
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'leviton.6a586-u24')!, { x: 0, y: 0 })
    const plates = Array.from({ length: 4 }, () => addEquipment(p, makePlateProduct(newPlateSpec('wallPlate'), { model: 'WP' }), { x: 0, y: 0 }))
    const srcs = plates.map((w) => ({ equipment: w.id, port: w.product.ports.find((q) => q.connector === 'idcPunchdown')!.id }))
    const res = connectMany(p, srcs, { equipment: bay.equipment, port: 'r1.c01' })
    expect(res.made.map((m) => m.to.port)).toEqual(['r1.c01', 'r1.c02', 'r1.c03', 'r1.c04'])
    const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch' && x.ports.filter((q) => q.connector === 'rj45').length > 4)!, { x: 0, y: 0 })
    const swp = sw.product.ports.filter((q) => q.connector === 'rj45').slice(0, 3).map((q) => ({ equipment: sw.id, port: q.id }))
    const res2 = connectMany(p, swp, { equipment: bay.equipment, port: 'r1.c01.f' })
    expect(res2.made.map((m) => m.to.port)).toEqual(['r1.c01.f', 'r1.c02.f', 'r1.c03.f'])
  })
})

import { describe, expect, it } from 'vitest'
import { explodeInserts, makePlateProduct, newPlateSpec, nextPid, nodeGeom, plateSVG, withLayout, addEquipment, newProject, headerHeight } from './index'

describe('plate designer', () => {
  it('explodes inserts into single jacks with stable port ids', () => {
    const spec = explodeInserts({ kind: 'wallPlate', style: '2-Gang', inserts: [{ module: 'xlrF', count: 3, rear: 'idcPunchdown', label: 'Mic' }, { module: 'rj45', count: 1, rear: 'idcPunchdown' }] })
    expect(spec.inserts.map((x) => x.pid)).toEqual(['xlrF.1', 'xlrF.2', 'xlrF.3', 'rj45.1'])
    expect(spec.inserts.map((x) => x.label)).toEqual(['Mic 1', 'Mic 2', 'Mic 3', undefined])
    // Removing the middle one keeps the others' port ids (cables stay attached).
    const removed = { ...spec, inserts: spec.inserts.filter((x) => x.pid !== 'xlrF.2') }
    const ports = makePlateProduct(removed, { model: 'P' }).ports.map((x) => x.id)
    expect(ports).toContain('xlrF.3.f')
    expect(ports).not.toContain('xlrF.2.f')
    expect(nextPid(removed, 'xlrF')).toBe('xlrF.2')
  })

  it('lays out, draws and sizes cards', () => {
    const spec = withLayout(newPlateSpec('rackPanel'))
    expect(spec.layout!.w).toBeCloseTo(482.6)
    expect(Object.keys(spec.layout!.jacks)).toHaveLength(12)
    for (const p of Object.values(spec.layout!.jacks)) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(482.6); expect(p.y).toBeGreaterThan(0) }
    expect(plateSVG(spec)).toMatch(/<svg/)
    const prod = makePlateProduct(spec, { model: 'Stage Panel' })
    expect(prod.category).toBe('connectorPanel')
    expect(prod.physical.rackUnits).toBe(1)
    const p = newProject()
    const e = addEquipment(p, prod, { x: 0, y: 0 })
    expect(headerHeight(e)).toBeGreaterThan(40)
    const small = nodeGeom({ ...e, nodeSize: 'small' })
    expect(small.width).toBe(170)
    expect(small.port(prod.ports[0].id)!.side).toBe('left')
  })
})

describe('plate drawing', () => {
  it('draws every jack of a library plate (multi-count inserts)', () => {
    const spec = { kind: 'wallBox' as const, style: '6" x 6"', inserts: [{ module: 'xlrF', count: 4, rear: 'idcPunchdown' as const }, { module: 'ethercon', count: 2, rear: 'same' as const }] }
    const svg = plateSVG(spec)
    expect((svg.match(/<g transform="translate/g) ?? []).length).toBe(6)
    expect(withLayout(spec).layout!.w).toBeCloseTo(152.4)
  })
})

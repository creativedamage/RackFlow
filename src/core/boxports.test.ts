import { describe, expect, it } from 'vitest'
import { addEquipment, audit, BUILT_IN_PRODUCTS, clearBoxPortNumbers, makePlateProduct, newProject, numberBoxPorts, refreshBoxPorts } from './index'
import type { Project } from './model'

const plate = (n: number, extra: { module: string; count: number; label?: string }[] = []) => makePlateProduct({ kind: 'wallBox', style: '8" x 8"', inserts: [{ module: 'xlrF', count: n, rear: 'idcPunchdown' }, { module: 'rj45', count: 1, rear: 'idcPunchdown' }, ...extra.map((x) => ({ ...x, rear: 'idcPunchdown' as const }))] } as never, { model: 'Box' })
const on = (p: Project, rules = {}) => { p.numbering = { name: 'x', tagDefaults: { separator: '-', digits: 3, start: 1 }, tags: {}, cableDefaults: { separator: '-', digits: 4, start: 1 }, cables: {}, boxPorts: { on: true, rules } } }
const labels = (e: { product: { ports: { label: string; face: string }[] } }) => e.product.ports.filter((x) => x.face === 'front').map((x) => x.label)

describe('box port numbers', () => {
  it('continues the sequence from box to box', () => {
    const p = newProject(); on(p)
    const a = addEquipment(p, plate(10), { x: 0, y: 0 }), b = addEquipment(p, plate(10), { x: 0, y: 400 })
    expect(labels(a)).toEqual([...Array.from({ length: 10 }, (_, i) => `M${i + 1}`), 'D1'])
    expect(labels(b)).toEqual([...Array.from({ length: 10 }, (_, i) => `M${i + 11}`), 'D2'])
    expect(b.product.ports.find((x) => x.face === 'rear')!.label).toBe('M11 (rear)')
    // Products in the library aren't touched.
    expect(BUILT_IN_PRODUCTS.some((x) => x.ports.some((q) => q.label === 'M1'))).toBe(false)
  })
  it('renumbers everything in tag order and finds duplicates', () => {
    const p = newProject(); on(p, { mic: { prefix: 'MIC', separator: '-', digits: 3 } })
    const a = addEquipment(p, plate(2), { x: 0, y: 0 }), b = addEquipment(p, plate(2), { x: 0, y: 400 })
    b.portNumbers = { ...a.portNumbers }
    expect(audit(p).some((i) => i.rule === 'dup-port-number')).toBe(true)
    numberBoxPorts(p, { all: true })
    expect(labels(a)).toEqual(['MIC-001', 'MIC-002', 'D1'])
    expect(labels(b)).toEqual(['MIC-003', 'MIC-004', 'D2'])
    expect(audit(p).some((i) => i.rule === 'dup-port-number')).toBe(false)
    expect(a.product.plate!.inserts.map((x) => x.label)).toEqual(['MIC-001', 'MIC-002', 'D1'])
    clearBoxPortNumbers(p)
    expect(labels(a)[0]).toMatch(/XLR/)
    expect(a.product.plate!.inserts.every((x) => !x.label)).toBe(true)
  })
  it('keeps custom jack names and numbers new jacks after a designer edit', () => {
    const p = newProject(); on(p)
    const a = addEquipment(p, plate(2, [{ module: 'xlrF', count: 1, label: 'Podium' }]), { x: 0, y: 0 })
    expect(labels(a)).toContain('M3')
    expect(labels(a).some((l) => /Podium/.test(l))).toBe(false)
    expect(a.product.plate!.inserts.map((x) => x.label)).toEqual(['M1', 'M2', 'D1', 'M3'])
    a.product = plate(4)
    refreshBoxPorts(p, a)
    expect(new Set(labels(a)).size).toBe(labels(a).length)
    expect(labels(a).filter((l) => l.startsWith('M'))).toHaveLength(4)
  })
})

import { withoutPortNumbers } from './index'
it('library copies of a numbered box carry the plain jack names', () => {
  const p = newProject(); on(p)
  const a = addEquipment(p, plate(2, [{ module: 'rj45', count: 1, label: 'NET 9' }]), { x: 0, y: 0 })
  expect(a.product.plate!.inserts.map((x) => x.label)).toEqual(['M1', 'M2', 'D1', 'D2'])
  const lib = withoutPortNumbers(a, a.product)
  expect(lib.plate!.inserts.map((x) => x.label)).toEqual([undefined, undefined, undefined, 'NET 9'])
  expect(lib.ports.some((x) => /^M1/.test(x.label))).toBe(false)
})

import { boxPortRows, numberSeries, setPortNumber } from './index'
describe('box ports schedule', () => {
  it('sets numbers by hand, keeps them on renumber, and flags clashes', () => {
    const p = newProject(); on(p)
    const a = addEquipment(p, plate(3), { x: 0, y: 0 }), b = addEquipment(p, plate(3), { x: 0, y: 400 })
    expect(boxPortRows(p).map((r) => r.number)).toEqual(['M1', 'M2', 'M3', 'D1', 'M4', 'M5', 'M6', 'D2'])
    expect(numberSeries('M17', 3)).toEqual(['M17', 'M18', 'M19'])
    expect(numberSeries('MIC-009', 2)).toEqual(['MIC-009', 'MIC-010'])
    const micB = b.product.ports.filter((x) => x.face === 'front' && x.connector === 'xlr3')
    numberSeries('M17', 3).forEach((n, i) => setPortNumber(p, b.id, micB[i].id, n))
    expect(labels(b).slice(0, 3)).toEqual(['M17', 'M18', 'M19'])
    expect(b.product.ports.find((x) => x.id === micB[0].id.replace('.f', '.r'))!.label).toBe('M17 (rear)')
    // Renumber everything: hand-set numbers stay, the rest fill in around them.
    numberBoxPorts(p, { all: true })
    expect(labels(b).slice(0, 3)).toEqual(['M17', 'M18', 'M19'])
    expect(labels(a).slice(0, 3)).toEqual(['M1', 'M2', 'M3'])
    // A clash is flagged on both rows.
    setPortNumber(p, a.id, a.product.ports.find((x) => x.face === 'front')!.id, 'M17')
    expect(boxPortRows(p).filter((r) => r.duplicate)).toHaveLength(2)
    // Clearing a number unlocks it.
    setPortNumber(p, a.id, a.product.ports.find((x) => x.face === 'front')!.id, '')
    expect(boxPortRows(p)[0]).toMatchObject({ number: '', locked: false })
  })
})

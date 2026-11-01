import { describe, expect, it } from 'vitest'
import { addEquipment, cardLayout, connect, makePlateProduct, newProject, nodeGeom, plateSVG, summarizeLabels } from './index'
import type { PlateInsert, Project } from './model'

describe('summarizeLabels', () => {
  it('collapses runs into ranges', () => {
    expect(summarizeLabels(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'RET 1', 'RET 2', 'RET 3', 'RET 4'])).toBe('M1-8, RET 1-4')
    expect(summarizeLabels(['M1', 'M3', 'M4', 'Talkback'])).toBe('M1, M3-4, Talkback')
    expect(summarizeLabels(['MIC-001', 'MIC-002'])).toBe('MIC-001-002')
  })
})

const jacks = (): PlateInsert[] => [
  { module: 'w1F', count: 1, rear: 'idcPunchdown', pid: 'w1F.1' },
  ...Array.from({ length: 8 }, (_, i) => ({ module: 'xlrF', count: 1, rear: 'idcPunchdown' as const, pid: `xlrF.${i + 1}`, label: `M${i + 1}`, tie: 'w1F.1' })),
  ...Array.from({ length: 4 }, (_, i) => ({ module: 'xlrM', count: 1, rear: 'idcPunchdown' as const, pid: `xlrM.${i + 1}`, label: `RET ${i + 1}`, tie: 'w1F.1' })),
  { module: 'xlrF', count: 1, rear: 'idcPunchdown', pid: 'xlrF.9', label: 'SPARE' },
]

describe('multipin ties', () => {
  it('tied jacks ride on the multipin: no own tie lines, one section, channel summary', () => {
    const prod = makePlateProduct({ kind: 'wallBox', style: '12" x 12"', inserts: jacks() } as never, { model: 'Stage box' })
    const mp = prod.ports.find((x) => x.id === 'w1F.1.f')!
    expect(mp.label).toBe('Whirlwind W1 Female · M1-8, RET 1-4')
    // Every jack keeps its rear tie line (patch bay or multipin); the tied multipin has none of its own.
    const rears = prod.ports.filter((x) => x.face === 'rear').map((x) => x.id)
    expect(rears).toHaveLength(13)
    expect(rears).not.toContain('w1F.1.r')
    const p: Project = newProject()
    const e = addEquipment(p, prod, { x: 0, y: 0 })
    const sec = cardLayout(e).sections.find((s) => s.heads)!
    expect(sec.heads).toEqual(['Channels', 'Rear · Multipin'])
    expect(sec.rows[0].right!.id).toBe('w1F.1.f')
    expect(sec.rows[0].left).toBeUndefined()
    expect(sec.rows.slice(1).map((r) => r.left?.label)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'RET 1', 'RET 2', 'RET 3', 'RET 4'])
    // Each jack's rear tie line sits beside it.
    expect(sec.rows.slice(1).every((r) => r.right!.id === r.left!.id.replace(/\.f$/, '.r'))).toBe(true)
    const g = nodeGeom(e)
    expect(g.port('w1F.1.f')!.x).toBe(g.width)
    expect(g.port('xlrF.1.r')!.y).toBe(g.port('xlrF.1.f')!.y)
    // …and a tied jack can still be wired to a patch bay-style punch-down.
    const pb = addEquipment(p, makePlateProduct({ kind: 'rackPanel', style: '1RU', inserts: [{ module: 'xlrM', count: 1, rear: 'idcPunchdown', pid: 'xlrM.1' }] } as never, { model: 'Rack panel' }), { x: 400, y: 0 })
    expect(connect(p, { equipment: e.id, port: 'xlrF.1.r' }, { equipment: pb.id, port: 'xlrM.1.r' }).cableId).toBeTruthy()
    expect(plateSVG(prod.plate!)).toContain('M1-8, RET 1-4')
  })
  it('follows box port numbers', () => {
    const p = newProject()
    p.numbering = { name: 'x', tagDefaults: { separator: '-', digits: 3, start: 1 }, tags: {}, cableDefaults: { separator: '-', digits: 4, start: 1 }, cables: {}, boxPorts: { on: true, rules: {} } }
    const e = addEquipment(p, makePlateProduct({ kind: 'wallBox', style: '12" x 12"', inserts: jacks() } as never, { model: 'Stage box' }), { x: 0, y: 0 })
    expect(e.product.ports.find((x) => x.id === 'w1F.1.f')!.label).toBe('MP1 · M1-8, L1-4')
    // and a W1 snake still plugs into it
    const other = addEquipment(p, makePlateProduct({ kind: 'wallBox', style: '6" x 6"', inserts: [{ module: 'w1M', count: 1, rear: 'idcPunchdown', pid: 'w1M.1' }] } as never, { model: 'Rack' }), { x: 400, y: 0 })
    expect(connect(p, { equipment: e.id, port: 'w1F.1.f' }, { equipment: other.id, port: 'w1M.1.f' }).cableId).toBeTruthy()
  })
})

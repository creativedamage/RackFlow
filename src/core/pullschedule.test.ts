import { expect, it } from 'vitest'
import { addEquipment, addRack, BUILT_IN_PRODUCTS, connect, newProject, pullRows, pullScheduleCSV } from './index'

const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

it('lists every cable with both ends located, plus unwired ports', () => {
  const p = newProject()
  const a = addEquipment(p, prod('generic.dsp.12x8'), { x: 0, y: 0 }); a.room = 'Control Room'
  const b = addEquipment(p, prod('generic.dsp.12x8'), { x: 400, y: 0 }); b.room = 'Stage'
  const r = addRack(p, 'AVR-1')
  a.rackPlacement = { rack: r.id, startUnit: 12, face: 'front' }
  const out = a.product.ports.find((x) => x.direction === 'output' && /Line/.test(x.label))!
  const inn = b.product.ports.find((x) => x.direction === 'input')!
  const c = connect(p, { equipment: a.id, port: out.id }, { equipment: b.id, port: inn.id })
  p.cables[0].pull = { pathway: 'C-12', pulled: true }
  const rows = pullRows(p)
  expect(rows).toHaveLength(1)
  expect(rows[0].from).toMatchObject({ tag: a.tag, room: 'Control Room', rack: 'AVR-1 U12' })
  expect(rows[0].to).toMatchObject({ tag: b.tag, room: 'Stage', port: inn.label })
  expect(c.cableId).toBeTruthy()
  const all = pullRows(p, { unwired: true })
  expect(all.length).toBe(1 + a.product.ports.length + b.product.ports.length - 2)
  const csv = pullScheduleCSV(p).split('\n')
  expect(csv[0]).toContain('Pathway')
  expect(csv[1]).toContain('C-12')
  expect(csv[1]).toContain('Yes')
})

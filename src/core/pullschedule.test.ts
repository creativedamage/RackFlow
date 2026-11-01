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

import { makePlateProduct } from './index'
it('names pulls by bulk cable and groups snake channels', () => {
  const p = newProject()
  const box = (inserts: unknown[]) => addEquipment(p, makePlateProduct({ kind: 'wallBox', style: '8" x 8"', inserts } as never, { model: 'B' }), { x: 0, y: 0 })
  const stage = box([{ module: 'xlrF', count: 10, rear: 'same' }, { module: 'rj45', count: 1, rear: 'same' }])
  const rack = box([{ module: 'xlrM', count: 10, rear: 'same' }, { module: 'rj45', count: 1, rear: 'same' }])
  const ins = stage.product.ports.filter((x) => x.face === 'rear' && x.connector === 'xlr3')
  const outs = rack.product.ports.filter((x) => x.face === 'rear' && x.connector === 'xlr3')
  ins.forEach((x, i) => connect(p, { equipment: stage.id, port: x.id }, { equipment: rack.id, port: outs[i].id }))
  expect(p.cables.every((c) => c.specKey === 'xlr3.mic')).toBe(true) // XLR is still the default
  const net = connect(p, { equipment: stage.id, port: stage.product.ports.find((x) => x.face === 'rear' && x.connector === 'rj45')!.id }, { equipment: rack.id, port: rack.product.ports.find((x) => x.face === 'rear' && x.connector === 'rj45')!.id })
  expect(pullRows(p).find((r) => r.cable?.id === net.cableId)!.type).toBe('Cat6A')
  for (const c of p.cables) if (c.specKey === 'xlr3.mic') c.specKey = 'snake.8'
  const snakes = pullRows(p).filter((r) => r.channels)
  expect(snakes.map((r) => r.channels)).toEqual([{ used: 8, of: 8 }, { used: 2, of: 8 }])
  expect(snakes[0].type).toBe('8-Channel Snake')
  expect(snakes[0].cables).toHaveLength(8)
})

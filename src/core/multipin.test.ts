import { expect, it } from 'vitest'
import { addEquipment, connect, makePlateProduct, newProject } from './index'

it('wall boxes with Whirlwind W1 multipins connect with a W1 snake', () => {
  const p = newProject()
  const box = (m: string) => addEquipment(p, makePlateProduct({ kind: 'wallBox', style: '8" x 8"', inserts: [{ module: m, count: 1, rear: 'idcPunchdown' }] } as never, { model: m }), { x: 0, y: 0 })
  const a = box('w1F'), b = box('w1M')
  const r = connect(p, { equipment: a.id, port: a.product.ports[0].id }, { equipment: b.id, port: b.product.ports[0].id })
  expect(r.cableId).toBeTruthy()
  expect(p.cables[0].specKey).toBe('multi.w1')
})

import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, newProject, nodeGeom } from './index'
import { printPositions } from './drawing/schematic'

const product = (k: string) => BUILT_IN_PRODUCTS.find((x) => x.key === k)!

describe('print positions', () => {
  it('keeps a clean layout exactly as drawn', () => {
    const p = newProject()
    const a = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const b = addEquipment(p, product('generic.amp.4ch'), { x: 800, y: 0 })
    const pos = printPositions(p, p.equipment)
    expect(pos.get(a.id)).toEqual({ x: 0, y: 0 })
    expect(pos.get(b.id)).toEqual({ x: 800, y: 0 })
  })
  it('never prints devices on top of each other', () => {
    const p = newProject()
    const ids = [0, 1, 2, 3].map(() => addEquipment(p, product('generic.amp.4ch'), { x: 0, y: 0 }).id)
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 30, y: 40 })
    for (const e of p.equipment) e.position = { x: e.id === dsp.id ? 30 : 0, y: e.id === dsp.id ? 40 : 0 }
    connect(p, { equipment: dsp.id, port: dsp.product.ports.find((x) => x.direction === 'output')!.id }, { equipment: ids[0], port: p.equipment.find((e) => e.id === ids[0])!.product.ports.find((x) => x.direction === 'input')!.id })
    const pos = printPositions(p, p.equipment)
    const r = p.equipment.map((e) => { const at = pos.get(e.id)!, g = nodeGeom(e); return { x0: at.x, y0: at.y, x1: at.x + g.width, y1: at.y + g.height } })
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], b = r[j]
      expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false)
    }
  })
})

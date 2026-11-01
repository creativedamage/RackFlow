import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, cardLayout, cardSide, connectMany, newProject, nodeGeom, sectionOf } from './index'

const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

describe('device card', () => {
  it('pairs inputs and outputs of the same group in one section', () => {
    const p = newProject()
    const e = addEquipment(p, prod('generic.dsp.12x8'), { x: 0, y: 0 })
    const L = cardLayout(e)
    const analog = L.sections.find((s) => s.name === 'Analog')!
    expect(analog.rows).toHaveLength(12)
    expect(analog.rows[0].left && analog.rows[0].right).toBeTruthy()
    expect(sectionOf({ group: 'Speaker Out' } as never)).toBe('Speaker')
    // Ports sit at the card edges, on their row.
    const g = nodeGeom(e)
    const a = g.port(analog.rows[0].left!.id)!, b = g.port(analog.rows[0].right!.id)!
    expect(a.y).toBe(b.y)
    expect(a.x).toBe(0); expect(b.x).toBe(g.width)
  })
  it('folding a section moves its ports to the section bar and shrinks the card', () => {
    const p = newProject()
    const e = addEquipment(p, prod('generic.dsp.12x8'), { x: 0, y: 0 })
    const open = nodeGeom(e).height
    const folded = { ...e, collapsed: ['Analog'] }
    const L = cardLayout(folded)
    const s = L.sections.find((x) => x.name === 'Analog')!
    expect(nodeGeom(folded).height).toBeLessThan(open)
    expect(L.ports.get(s.rows[3].left!.id)!.y).toBe(s.y + 11)
    expect(nodeGeom({ ...e, ioHidden: true }).height).toBeLessThan(nodeGeom(folded).height)
  })
  it('cascades picked ports down the side of the card', () => {
    const p = newProject()
    const a = addEquipment(p, prod('generic.dsp.12x8'), { x: 0, y: 0 })
    const b = addEquipment(p, prod('generic.dsp.12x8'), { x: 400, y: 0 })
    const outs = cardSide(a, a.product.ports.find((x) => x.direction === 'output' && /Line Out 1$/.test(x.label))!.id).slice(0, 4)
    const ins = cardSide(b, b.product.ports.find((x) => x.direction === 'input')!.id)
    const r = connectMany(p, outs.map((x) => ({ equipment: a.id, port: x.id })), { equipment: b.id, port: ins[2].id })
    expect(r.made.map((m) => m.to.port)).toEqual(ins.slice(2, 6).map((x) => x.id))
  })
})

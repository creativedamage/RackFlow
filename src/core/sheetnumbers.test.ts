import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, bumpNumber, connect, createGroup, createView, defaultSchematic, newProject, pageNumbers, schematicSheets, GENERAL_PAGE } from './index'

const product = (k: string) => BUILT_IN_PRODUCTS.find((x) => x.key === k)!

describe('sheet numbers', () => {
  it('bumps drawing numbers', () => {
    expect(bumpNumber('AV101', 0)).toBe('AV101')
    expect(bumpNumber('AV101', 2)).toBe('AV103')
    expect(bumpNumber('E-009', 1)).toBe('E-010')
    expect(bumpNumber('E-001', 2)).toBe('E-003')
    expect(bumpNumber('RACKS', 1)).toBe('RACKS.2')
  })

  it('numbers pages, general and views; custom numbers win', () => {
    const p = newProject()
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const amp = addEquipment(p, product('generic.amp.4ch'), { x: 400, y: 0 })
    addEquipment(p, product('generic.switch.24poe'), { x: 0, y: 400 })
    connect(p, { equipment: dsp.id, port: dsp.product.ports.find((x) => x.label === 'Line Out 1')!.id }, { equipment: amp.id, port: amp.product.ports.find((x) => x.label === 'Input 1')!.id })
    const a = createGroup(p, [dsp.id], { name: 'Audio' })
    const b = createGroup(p, [amp.id], { name: 'Amps' })
    const v = createView(p, { name: 'Tie Lines', domains: ['audio'] })
    expect(pageNumbers(p).size).toBe(0)
    p.diagram = { numbering: { prefix: 'AV', start: 101, step: 1 } }
    expect([...pageNumbers(p)]).toEqual([[a.id, 'AV101'], [b.id, 'AV102'], [GENERAL_PAGE, 'AV103'], [v.id, 'AV104']])
    b.number = 'AV201'
    expect(pageNumbers(p).get(b.id)).toBe('AV201')
    expect(pageNumbers(p).get(GENERAL_PAGE)).toBe('AV103')
    const sheets = schematicSheets(p, { ...defaultSchematic(p), split: 'group', wires: 'stubs' })
    expect(sheets).toHaveLength(4)
    expect(sheets[0]).toMatch(/AV101/)
    expect(sheets[0]).toMatch(/SHT AV201/)  // DSP's wire to the amp on the other page
    expect(sheets[3]).toMatch(/AV104/)
  })
})

import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, createView, defaultSchematic, layoutView, newProject, nodeGeom, schematicSheets, setInView, setPortsInView, viewMembers, viewOffFlags, viewProject } from './index'

const product = (k: string) => BUILT_IN_PRODUCTS.find((x) => x.key === k)!

describe('signal views', () => {
  const setup = () => {
    const p = newProject()
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const amp = addEquipment(p, product('generic.amp.4ch'), { x: 400, y: 0 })
    const sw = addEquipment(p, product('generic.switch.24poe'), { x: 0, y: 400 })
    const out = dsp.product.ports.find((x) => x.label === 'Line Out 1')!
    const ain = amp.product.ports.find((x) => x.label === 'Input 1')!
    connect(p, { equipment: dsp.id, port: out.id }, { equipment: amp.id, port: ain.id })
    const dante = dsp.product.ports.find((x) => /Dante Primary/.test(x.label))!
    const swp = sw.product.ports.find((x) => x.signals.some((s) => s.startsWith('ethernet')) && x.direction !== 'output')!
    connect(p, { equipment: dsp.id, port: dante.id }, { equipment: sw.id, port: swp.id })
    return { p, dsp, amp, sw }
  }

  it('shows only matching ports and cables, keeps the main diagram whole', () => {
    const { p, dsp, amp } = setup()
    const v = createView(p, { name: 'Audio', domains: ['audio'] })
    const vp = viewProject(p, v)
    expect(vp.equipment.map((e) => e.id).sort()).toEqual([dsp.id, amp.id].sort())
    const vdsp = vp.equipment.find((e) => e.id === dsp.id)!
    expect(vdsp.product.ports.every((x) => x.signals.length > 0)).toBe(true)
    expect(vdsp.product.ports.some((x) => /Power/.test(x.label))).toBe(false)
    expect(vp.cables).toHaveLength(1)
    expect(p.equipment.find((e) => e.id === dsp.id)!.product.ports.length).toBeGreaterThan(vdsp.product.ports.length)
    expect(p.cables).toHaveLength(2)
  })

  it('add / remove devices, own layout, flags and print sheet', () => {
    const { p, dsp, amp, sw } = setup()
    const v = createView(p, { name: 'Audio', domains: ['audio'] })
    setInView(p, v.id, [amp.id], false)
    expect(viewMembers(p, v).map((e) => e.id)).toEqual([dsp.id])
    // DSP Line Out 1 now goes to a device outside the view → flag.
    expect(Object.values(viewOffFlags(p, v).get(dsp.id) ?? {}).join()).toMatch(/AMP-01/)
    setInView(p, v.id, [sw.id], true)
    expect(viewMembers(p, v).map((e) => e.id).sort()).toEqual([dsp.id, sw.id].sort())
    setInView(p, v.id, [amp.id], true)
    const before = dsp.position
    expect(layoutView(p, v.id, nodeGeom)).toBe(3)
    expect(Object.keys(v.positions)).toHaveLength(3)
    expect(dsp.position).toEqual(before)
    const sheets = schematicSheets(p, { ...defaultSchematic(p), split: 'none' })
    expect(sheets).toHaveLength(2)
    expect(sheets[1]).toMatch(/AUDIO/)
    expect(schematicSheets(p, { ...defaultSchematic(p), split: 'none', views: [] })).toHaveLength(1)
  })
})

describe('signal views – hide unused', () => {
  it('shows only wired ports when asked', () => {
    const p = newProject()
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const amp = addEquipment(p, product('generic.amp.4ch'), { x: 400, y: 0 })
    connect(p, { equipment: dsp.id, port: dsp.product.ports.find((x) => x.label === 'Line Out 1')!.id }, { equipment: amp.id, port: amp.product.ports.find((x) => x.label === 'Input 1')!.id })
    const v = createView(p, { name: 'A', domains: ['audio'], hideUnused: true })
    const vp = viewProject(p, v)
    expect(vp.equipment.map((e) => e.product.ports.length)).toEqual([1, 1])
  })
})

describe('signal views – exact ports', () => {
  it('shows only picked ports; main signal decides the default', () => {
    const p = newProject()
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const v = createView(p, { name: 'A', domains: ['audio'] })
    const vp0 = viewProject(p, v).equipment[0]
    // Dante (network-first) ports don't slip into an Audio view.
    expect(vp0.product.ports.some((x) => /Dante/.test(x.label))).toBe(false)
    const lo1 = dsp.product.ports.find((x) => x.label === 'Line Out 1')!.id
    setPortsInView(p, v.id, dsp.id, vp0.product.ports.map((x) => x.id).filter((x) => x !== lo1), false)
    expect(viewProject(p, v).equipment[0].product.ports.map((x) => x.id)).toEqual([lo1])
    const dante = dsp.product.ports.find((x) => /Dante Primary/.test(x.label))!.id
    setPortsInView(p, v.id, dsp.id, [dante], true)
    expect(viewProject(p, v).equipment[0].product.ports.map((x) => x.id).sort()).toEqual([lo1, dante].sort())
  })
})

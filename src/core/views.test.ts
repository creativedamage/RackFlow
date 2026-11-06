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

import { duplicateView as dupView, viewsOf } from './index'
describe('duplicate view', () => {
  it('copies devices, ports, layout and notes under a new name, right after the original', () => {
    const p = newProject()
    const v = createView(p, { name: 'Audio', domains: ['audio'] })
    v.positions = { x1: { x: 10, y: 20 } }
    v.ports = { x1: ['a'] }
    v.number = 'AV201'
    createView(p, { name: 'Video', domains: ['video'] })
    p.annotations = [{ id: 'n1', kind: 'note', x: 0, y: 0, text: 'hi', page: v.id } as never]
    const c = dupView(p, v.id)!
    expect(viewsOf(p).map((x) => x.name)).toEqual(['Audio', 'Audio (copy)', 'Video'])
    expect(c.id).not.toBe(v.id)
    expect(c.number).toBeUndefined()
    expect(c.positions).toEqual(v.positions)
    c.ports!.x1.push('b')
    expect(v.ports!.x1).toEqual(['a'])
    expect(p.annotations!.filter((a) => a.page === c.id)).toHaveLength(1)
    expect(dupView(p, v.id)!.name).toBe('Audio (copy 2)')
  })
})

describe('keepInViews', () => {
  it('keeps an edited plate in a view even when its ports are rebuilt', async () => {
    const { keepInViews, viewProject } = await import('./views')
    const p = newProject() as any
    const ports = (pre: string) => [{ id: `${pre}1`, label: 'MIC 1', direction: 'output', connector: 'xlr3', gender: 'female', signals: ['analogMic'] }, { id: `${pre}2`, label: 'MIC 2', direction: 'output', connector: 'xlr3', gender: 'female', signals: ['analogMic'] }]
    p.equipment.push({ id: 'wp', tag: 'WP-001', position: { x: 0, y: 0 }, product: { key: 'k', manufacturer: 'x', model: 'y', category: 'wallPlate', ports: ports('a'), physical: {} } })
    p.views = [{ id: 'v', name: 'Audio', domains: ['audio'], auto: false, include: ['wp'], exclude: [], positions: {}, ports: { wp: ['a2'] } }]
    keepInViews(p, 'wp', () => { p.equipment[0].product = { ...p.equipment[0].product, ports: ports('b') } })
    const vp = viewProject(p, p.views[0])
    expect(vp.equipment.map((e: any) => e.id)).toEqual(['wp'])
    expect(vp.equipment[0].product.ports.map((x: any) => x.label)).toEqual(['MIC 2'])
  })
})

describe('removeViewConnections', () => {
  it('removes only the cables shown on the view', async () => {
    const { removeViewConnections } = await import('./views')
    const p = newProject() as any
    const ports = [{ id: 'a', label: 'A', direction: 'output', connector: 'xlr3', gender: 'female', signals: ['analogMic'] }, { id: 'n', label: 'LAN', direction: 'bidirectional', connector: 'rj45', gender: 'female', signals: ['ethernet1G'] }]
    for (const id of ['x', 'y']) p.equipment.push({ id, tag: id, position: { x: 0, y: 0 }, product: { key: id, manufacturer: '', model: '', category: 'other', ports, physical: {} } })
    p.cables = [{ id: 'c1', label: 'A1', from: { equipment: 'x', port: 'a' }, to: { equipment: 'y', port: 'a' } }, { id: 'c2', label: 'N1', from: { equipment: 'x', port: 'n' }, to: { equipment: 'y', port: 'n' } }]
    p.views = [{ id: 'v', name: 'Audio', domains: ['audio'], auto: true, include: [], exclude: [], positions: {} }]
    expect(removeViewConnections(p, 'v')).toBe(1)
    expect(p.cables.map((c: any) => c.id)).toEqual(['c2'])
  })
})

it('shows Allen & Heath ME ports in Network views', async () => {
  const { portInView, BUILT_IN_PRODUCTS } = await import('./index')
  const rack = BUILT_IN_PRODUCTS.find((x) => x.ports.some((p) => p.signals.includes('ahME')))!
  const me = rack.ports.find((p) => p.signals.includes('ahME'))!
  expect(portInView(me, ['network'])).toBe(true)
  expect(portInView(me, ['audio'])).toBe(true)
})

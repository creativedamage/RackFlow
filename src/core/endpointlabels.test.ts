import { expect, it } from 'vitest'
import { produce } from 'immer'
import { addEquipment, BUILT_IN_PRODUCTS, connect, newProject, portCode, relabelByEndpoints, syncEndpointLabels, type Project } from './index'

it('port codes', () => {
  expect(portCode('SDI Out 4')).toBe('SDI-OUT-04')
  expect(portCode('In 12')).toBe('IN-12')
  expect(portCode('Port 7 (rear)')).toBe('PORT-07-REAR')
  expect(portCode('Line Out 1–8')).toBe('LINE-OUT-01-08')
})

it('cables are labelled by their two ends and follow renames', () => {
  const p = newProject()
  p.numbering = { name: 'Ends', tagDefaults: { separator: '-', digits: 2, start: 1 }, tags: {}, cableDefaults: { separator: '-', digits: 4, start: 1 }, cables: {}, cableStyle: 'endpoints' }
  const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.direction === 'output' && q.signals.includes('sdi12G')))!, { x: 0, y: 0 })
  const dst = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.direction === 'input' && q.signals.includes('sdi12G')))!, { x: 400, y: 0 })
  sw.tag = 'SW-01'; dst.tag = 'MON-01'
  const out = sw.product.ports.find((q) => q.direction === 'output' && q.signals.includes('sdi12G'))!
  const inp = dst.product.ports.find((q) => q.direction === 'input' && q.signals.includes('sdi12G'))!
  const v = connect(p, { equipment: sw.id, port: out.id }, { equipment: dst.id, port: inp.id })
  const c = p.cables.find((x) => x.id === v.cableId)!
  expect(c.label).toBe(`SW-01_${portCode(out.label)} > MON-01_${portCode(inp.label)}`)
  const next = produce(p, (d: Project) => { d.equipment.find((e) => e.id === dst.id)!.tag = 'PB-A'; syncEndpointLabels(p, d) })
  expect(next.cables[0].label).toBe(`SW-01_${portCode(out.label)} > PB-A_${portCode(inp.label)}`)
  // a hand-typed label stays
  const typed = produce(next, (d: Project) => { d.cables[0].label = 'MAIN PGM' })
  const after = produce(typed, (d: Project) => { d.equipment.find((e) => e.id === sw.id)!.tag = 'SW-02'; syncEndpointLabels(typed, d) })
  expect(after.cables[0].label).toBe('MAIN PGM')
  const re = produce(after, (d: Project) => { relabelByEndpoints(d) })
  expect(re.cables[0].label.startsWith('SW-02_')).toBe(true)
})

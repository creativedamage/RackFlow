import { expect, it } from 'vitest'
import { autoCableTypes, cableChoices, commonCableChoices, connect, needsCableType, newProject, addEquipment, BUILT_IN_PRODUCTS, CABLE_CATALOG } from './index'

it('fills TBD and mismatched cable types with the best fit; offers types common to a selection', () => {
  const p = newProject()
  const src = BUILT_IN_PRODUCTS.find((x) => !x.plate && x.ports.filter((q) => q.connector === 'xlr3' && q.direction === 'output').length >= 2)!
  const dst = BUILT_IN_PRODUCTS.find((x) => !x.plate && x.ports.filter((q) => q.connector === 'xlr3' && q.direction === 'input').length >= 2)!
  const a = addEquipment(p, src, { x: 0, y: 0 }), b = addEquipment(p, dst, { x: 600, y: 0 })
  const outs = a.product.ports.filter((q) => q.connector === 'xlr3' && q.direction === 'output')
  const ins = b.product.ports.filter((q) => q.connector === 'xlr3' && q.direction === 'input')
  expect(outs.length && ins.length).toBeTruthy()
  for (let i = 0; i < Math.min(2, outs.length, ins.length); i++) connect(p, { equipment: a.id, port: outs[i].id }, { equipment: b.id, port: ins[i].id })
  expect(p.cables.length).toBeGreaterThan(0)
  // New cables come with a type.
  expect(p.cables.every((c) => !needsCableType(p, c))).toBe(true)
  // Break them: one TBD, one wrong.
  p.cables[0].specKey = null
  const wrong = CABLE_CATALOG.find((s) => !cableChoices(p, p.cables[0]).some((x) => x.key === s.key))!
  if (p.cables[1]) p.cables[1].specKey = wrong.key
  expect(p.cables.filter((c) => needsCableType(p, c)).length).toBe(Math.min(2, p.cables.length))
  expect(autoCableTypes(p)).toBe(Math.min(2, p.cables.length))
  expect(p.cables.every((c) => !needsCableType(p, c))).toBe(true)
  const common = commonCableChoices(p, p.cables.map((c) => c.id))
  expect(common.length).toBeGreaterThan(0)
  expect(common[0].key).toBe(p.cables[0].specKey)
})

import { expect, it } from 'vitest'
import { addEquipment, addNewCatalogPorts, BUILT_IN_PRODUCTS, connect, newProject } from './index'

const prod = (m: string) => BUILT_IN_PRODUCTS.find((x) => x.manufacturer === 'Allen & Heath' && x.model === m)!

it('dLive MixRacks have an ME port that patches to an ME-1 / ME-U', () => {
  for (const m of ['dLive DM64', 'dLive DM48', 'dLive DM32', 'dLive CDM64', 'dLive CDM48', 'dLive CDM32']) {
    const me = prod(m).ports.find((x) => x.label === 'ME Port')
    expect(me?.connector).toBe('rj45')
    expect(me?.signals).toContain('ahME')
  }
  const p = newProject()
  const rack = addEquipment(p, prod('dLive DM64'), { x: 0, y: 0 }), hub = addEquipment(p, prod('ME-U'), { x: 500, y: 0 })
  const v = connect(p, { equipment: rack.id, port: rack.product.ports.find((x) => x.label === 'ME Port')!.id }, { equipment: hub.id, port: hub.product.ports.find((x) => x.label === 'ME In')!.id })
  expect(v.allowed).toBe(true)
  expect(p.cables).toHaveLength(1)
})

it('a MixRack placed before the ME port existed gets it when the project opens', () => {
  const p = newProject()
  const rack = addEquipment(p, prod('dLive DM64'), { x: 0, y: 0 })
  rack.product.ports = rack.product.ports.filter((x) => x.label !== 'ME Port')
  expect(addNewCatalogPorts(p, BUILT_IN_PRODUCTS)).toBe(1)
  expect(rack.product.ports.some((x) => x.label === 'ME Port')).toBe(true)
  expect(addNewCatalogPorts(p, BUILT_IN_PRODUCTS)).toBe(0)
})

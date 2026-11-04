import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, cardLayout, connect, newProject, setCard, slotsOf } from './index'

it('dLive consoles and MixRacks take option cards whose ports can be wired', () => {
  const p = newProject()
  const dm64 = BUILT_IN_PRODUCTS.find((x) => x.model === 'dLive DM64')!
  const s5 = BUILT_IN_PRODUCTS.find((x) => x.model === 'dLive S5000')!
  expect(dm64.slots?.count).toBe(3)
  expect(s5.slots?.count).toBe(2)
  const rack = addEquipment(p, dm64, { x: 0, y: 0 })
  const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch')!, { x: 800, y: 0 })
  const before = rack.product.ports.length
  setCard(p, rack.id, 1, 'dlive.dante128')
  setCard(p, rack.id, 2, 'dlive.waves3')
  setCard(p, rack.id, 3, 'dlive.fibreace')
  expect(rack.product.ports.length).toBe(before + 6)
  const pri = rack.product.ports.find((x) => x.label === 'Dante Primary')!
  expect(pri.group).toBe('I/O Port 1 · Dante 128×128')
  expect(cardLayout(rack).sections.some((s) => s.name === 'I/O Port 1 · Dante 128×128')).toBe(true)
  const swPort = sw.product.ports.find((x) => x.connector === 'rj45' && !x.signals.includes('ac120V'))!
  expect(connect(p, { equipment: rack.id, port: pri.id }, { equipment: sw.id, port: swPort.id }).allowed).toBe(true)
  expect(p.cables.length).toBe(1)
  // Swapping the card removes its cables; emptying a slot removes its ports.
  setCard(p, rack.id, 1, 'dlive.gigaace')
  expect(p.cables.length).toBe(0)
  setCard(p, rack.id, 1, null)
  expect(rack.product.ports.length).toBe(before + 4)
  expect(rack.cards).toEqual({ 2: 'dlive.waves3', 3: 'dlive.fibreace' })
})

it('a dLive placed before slots existed still gets its I/O Ports', () => {
  const p = newProject()
  const s5 = { ...BUILT_IN_PRODUCTS.find((x) => x.model === 'dLive S5000')! }
  delete s5.slots
  const surf = addEquipment(p, s5, { x: 0, y: 0 })
  expect(slotsOf(surf)?.count).toBe(2)
  setCard(p, surf.id, 2, 'dlive.dante128')
  expect(surf.product.ports.some((x) => x.group === 'I/O Port 2 · Dante 128×128')).toBe(true)
})

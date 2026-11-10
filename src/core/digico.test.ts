import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, cardsFor, connect, newProject, setCard, slotGroups, validate } from './index'

const dg = (m: string) => BUILT_IN_PRODUCTS.find((p) => p.manufacturer === 'DiGiCo' && p.model === m)!

it('DiGiCo consoles take DMI cards and an Optocore option; SD-Rack takes I/O cards; Orange Box has 2 DMI slots', () => {
  const p = newProject()
  const q = addEquipment(p, dg('Quantum 338'), { x: 0, y: 0 })
  expect(slotGroups(q).map((g) => `${g.name}×${g.count}`)).toEqual(['DMI Slot×2', 'Optics×1'])
  expect(cardsFor('digico.dmi').some((c) => c.name === 'DMI-DANTE')).toBe(true)
  setCard(p, q.id, 1, 'dmi.dante')
  setCard(p, q.id, 2, 'dmi.madib')
  setCard(p, q.id, 3, 'opt.loop2.hma')
  setCard(p, q.id, 1, 'opt.loop1.hma') // wrong family for a DMI slot – ignored
  expect(q.cards).toEqual({ 1: 'dmi.dante', 2: 'dmi.madib', 3: 'opt.loop2.hma' })
  expect(q.product.ports.filter((x) => x.group?.startsWith('DMI Slot 1')).map((x) => x.label)).toEqual(['Dante Primary', 'Dante Secondary'])
  expect(q.product.ports.filter((x) => x.label.startsWith('Optocore')).length).toBe(4)

  const rack = addEquipment(p, dg('SD-Rack'), { x: 600, y: 0 })
  expect(rack.product.ports.filter((x) => x.direction === 'input' && x.connector === 'xlr3').length).toBe(56)
  expect(rack.product.ports.filter((x) => x.direction === 'output' && x.connector === 'xlr3').length).toBe(56)
  const rackLoop = rack.product.ports.find((x) => x.label === 'Optocore Loop 1 Out')!
  const qLoop = q.product.ports.find((x) => x.label === 'Optocore Loop 1 In')!
  expect(validate(p, { equipment: rack.id, port: rackLoop.id }, { equipment: q.id, port: qLoop.id }).allowed).toBe(true)

  const ob = addEquipment(p, dg('Orange Box'), { x: 0, y: 600 })
  expect(slotGroups(ob).map((g) => `${g.name}×${g.count}`)).toEqual(['DMI Slot×2'])
  setCard(p, ob.id, 1, 'dmi.madib'); setCard(p, ob.id, 2, 'dmi.dante')
  const madiOut = q.product.ports.find((x) => x.group?.startsWith('DMI Slot 2') && x.label === 'MADI Out')!
  const obIn = ob.product.ports.find((x) => x.label === 'MADI In')!
  expect(connect(p, { equipment: q.id, port: madiOut.id }, { equipment: ob.id, port: obIn.id }).allowed).toBe(true)
})

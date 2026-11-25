import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, cardsFor, cardSlotName, connect, newProject, setCard, slotGroups } from './index'

it('openGear frames take 10 AJA cards (each over two slots) whose rear-module connectors appear on the frame', () => {
  const p = newProject()
  const fr = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.model === 'OG-X-FR')!, { x: 0, y: 0 })
  expect(slotGroups(fr)[0].count).toBe(10)
  expect(cardSlotName(fr, 1)).toBe('Slots 1–2')
  expect(cardSlotName(fr, 10)).toBe('Slots 19–20')
  expect(cardsFor('opengear').length).toBeGreaterThan(30)
  setCard(p, fr.id, 1, 'og.fido-2t-12g')
  setCard(p, fr.id, 2, 'og.fido-2r-12g')
  setCard(p, fr.id, 3, 'og.ha5-12g')
  const ports = fr.product.ports
  expect(ports.filter((x) => x.group?.startsWith('Slots 1–2')).map((x) => x.label)).toEqual(['SDI In 1', 'SDI In 2', 'Fibre Out 1', 'Fibre Out 2'])
  // fibre link between two cards, and HDMI → SDI converter out into a FiDO in
  const fOut = ports.find((x) => x.id.startsWith('slot1.') && x.label === 'Fibre Out 1')!
  const fIn = ports.find((x) => x.id.startsWith('slot2.') && x.label === 'Fibre In 1')!
  expect(connect(p, { equipment: fr.id, port: fOut.id }, { equipment: fr.id, port: fIn.id }).allowed).toBe(true)
  const ha5 = ports.find((x) => x.id.startsWith('slot3.') && x.label === 'SDI Out')!
  const tin = ports.find((x) => x.id.startsWith('slot1.') && x.label === 'SDI In 1')!
  expect(connect(p, { equipment: fr.id, port: ha5.id }, { equipment: fr.id, port: tin.id }).allowed).toBe(true)
  // the Ross frame placed before slots existed also gets them
  const ross = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.model === 'openGear OG3-FR')!, { x: 0, y: 0 })
  delete ross.product.slots
  expect(slotGroups(ross)[0].count).toBe(10)
})

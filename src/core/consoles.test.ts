import { expect, it } from 'vitest'
import { BUILT_IN_PRODUCTS, ProductLibrary } from './index'

it('finds Hedgehog and Vista consoles by name', () => {
  const lib = new ProductLibrary(BUILT_IN_PRODUCTS, [])
  for (const q of ['hedgehog', 'hedge hog', 'vista ex', 'chroma-q vista', 'flex hog', 'tour hog'])
    expect(lib.search({ text: q, category: null, domain: null }).length, q).toBeGreaterThan(0)
  const tour = lib.search({ text: 'tour hog', category: null, domain: null })[0]
  expect(tour.ports.some((p) => p.connector === 'din5')).toBe(true)
  expect(tour.ports.some((p) => p.signals.includes('ltc'))).toBe(true)
})

it('Ross switchers have reference outputs that can feed a reference input', async () => {
  const { connect, newProject, addEquipment, BUILT_IN_PRODUCTS: B } = await import('./index')
  const p = newProject()
  const ross = addEquipment(p, B.find((x) => x.model === 'Carbonite Ultra')!, { x: 0, y: 0 })
  const deck = addEquipment(p, B.find((x) => x.model === 'HyperDeck Studio HD Plus')!, { x: 400, y: 0 })
  const out = ross.product.ports.find((x) => x.label === 'Ref Out')!
  const inp = deck.product.ports.find((x) => x.label === 'Ref In')!
  expect(out).toBeTruthy()
  const r = connect(p, { equipment: ross.id, port: out.id }, { equipment: deck.id, port: inp.id })
  expect(r.allowed).toBe(true)
  expect(p.cables.length).toBe(1)
})

it('TT bays can use an E3 rear', async () => {
  const { BUILT_IN_PATCH_TEMPLATES, addPatchBay, newProject, CONNECTOR_TYPES } = await import('./index')
  expect(CONNECTOR_TYPES).toContain('elcoE3')
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'bittree.tt.2x48.e3')!
  const p = newProject(); const bay = addPatchBay(p, t, { x: 0, y: 0 })
  const eq = p.equipment.find((e) => e.id === bay.equipment)!
  expect(eq.product.ports.filter((x) => x.connector === 'elcoE3').length).toBe(96)
})

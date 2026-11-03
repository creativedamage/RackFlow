import { expect, it } from 'vitest'
import { addEquipment, addPatchBay, addRack, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, drawingSet, newProject } from './index'

it('lists every drawing as a sheet that renders to SVG', () => {
  const p = newProject('Set')
  const r = addRack(p)
  const amp = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.physical.rackUnits)!, { x: 0, y: 0 }); amp.rackPlacement = { rack: r.id, startUnit: 10, face: 'front' }
  addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.plate)!, { x: 400, y: 0 })
  addPatchBay(p, BUILT_IN_PATCH_TEMPLATES[0], { x: 800, y: 0 })
  const set = drawingSet(p)
  expect(new Set(set.map((s) => s.group))).toEqual(new Set(['Wiring', 'Racks', 'Wall boxes & panels', 'Patch labels']))
  for (const s of set) { const pages = s.render(); expect(pages.length).toBeGreaterThan(0); expect(pages[0].svg).toContain('<svg') }
})

it('names multi-page sheets (rack Front / Rear)', () => {
  const p = newProject('Set')
  const r = addRack(p)
  const amp = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.physical.rackUnits)!, { x: 0, y: 0 }); amp.rackPlacement = { rack: r.id, startUnit: 10, face: 'front' }
  const rack = drawingSet(p).find((s) => s.group === 'Racks')!
  expect(rack.render().map((x) => x.name)).toEqual(['Front', 'Rear'])
})

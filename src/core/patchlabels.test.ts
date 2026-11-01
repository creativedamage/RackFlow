import { expect, it } from 'vitest'
import { addEquipment, addPatchBay, BUILT_IN_PATCH_TEMPLATES, connect, makePlateProduct, newProject, refreshLabels } from './index'

it('patch bay labels show just the box port number (no device tag, no "(rear)")', () => {
  const p = newProject()
  p.numbering = { name: 'x', tagDefaults: { separator: '-', digits: 3, start: 1 }, tags: {}, cableDefaults: { separator: '-', digits: 4, start: 1 }, cables: {}, boxPorts: { on: true, rules: {} } }
  const wp = addEquipment(p, makePlateProduct({ kind: 'wallPlate', style: '2-Gang', inserts: [{ module: 'rj45', count: 2, rear: 'idcPunchdown' }] } as never, { model: 'WP' }), { x: 0, y: 0 })
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.key === 'leviton.6a586-u48')!
  const bay = addPatchBay(p, t, { x: 400, y: 0 })
  const eq = p.equipment.find((e) => e.id === bay.equipment)!
  const rear = wp.product.ports.find((x) => x.face === 'rear')!
  const target = eq.product.ports.find((x) => connect({ ...p, cables: [] }, { equipment: wp.id, port: rear.id }, { equipment: eq.id, port: x.id }).allowed)
  expect(target).toBeTruthy()
  expect(wp.product.ports.find((x) => x.face === 'rear')!.label).toBe('D1 (rear)')
  connect(p, { equipment: wp.id, port: rear.id }, { equipment: eq.id, port: target.id })
  const b = p.patchBays.find((x) => x.id === bay.id)!
  refreshLabels(b, p)
  expect(b.cells.map((c) => c.text).filter(Boolean)).toEqual(['D1'])
})

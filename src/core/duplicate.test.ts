import { expect, it } from 'vitest'
import { addEquipment, addPatchBay, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, connect, duplicateDevices, newProject, refreshLabels, resetToWiring, setNet } from './index'

it('duplicates a device next to it: new tag, same page and room, unwired, no IP', () => {
  const p = newProject()
  const prod = BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.signals.includes('dante')) && x.category !== 'networkSwitch')!
  const a = addEquipment(p, prod, { x: 100, y: 100 }); a.room = 'FOH'; a.groupId = 'pg1'
  const port = a.product.ports.find((q) => q.signals.includes('dante'))!
  setNet(a, port.id, { ip: '10.0.0.5', vlan: '20' })
  const [c] = duplicateDevices(p, [a.id])
  expect(c.id).not.toBe(a.id)
  expect(c.tag).not.toBe(a.tag)
  expect(c.room).toBe('FOH'); expect(c.groupId).toBe('pg1')
  expect(c.position).toEqual({ x: 160, y: 160 })
  expect(c.network?.[port.id]).toEqual({ vlan: '20' })
  expect(p.cables.some((x) => x.from.equipment === c.id || x.to.equipment === c.id)).toBe(false)
})

it('duplicating a patch bay gives it its own blank label sheet; Reset selected overrides typed labels', () => {
  const p = newProject()
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.rows.length >= 2)!
  const bay = addPatchBay(p, t, { x: 0, y: 0 })
  const [copy] = duplicateDevices(p, [bay.equipment])
  const nb = p.patchBays.find((b) => b.equipment === copy.id)!
  expect(nb.name).toBe(copy.tag)
  expect(nb.id).not.toBe(bay.id)
  // Typed text survives From wiring, Reset selected replaces it.
  const b = p.patchBays.find((x) => x.id === bay.id)!
  const mic = BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.connector === b.template.rows[0].rearConnector))
  const cell = b.cells.find((x) => x.row === t.rows[0].id && x.channel === 1)!
  cell.text = 'Right'; cell.manual = true
  if (mic) {
    const m = addEquipment(p, mic, { x: 500, y: 0 })
    const mp = m.product.ports.find((q) => q.connector === b.template.rows[0].rearConnector)!
    connect(p, { equipment: b.equipment, port: 'r1.c01' }, { equipment: m.id, port: mp.id })
  }
  refreshLabels(b, p)
  expect(cell.text).toBe('Right')
  resetToWiring(b, p, { row: t.rows[0].id, a: 1, b: 1 })
  expect(cell.manual).toBe(false)
  expect(cell.text).not.toBe('Right')
})

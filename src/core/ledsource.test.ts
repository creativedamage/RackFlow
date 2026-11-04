import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, LED_PANELS, newLedWall, newProject, syncLedWallDevice, wallSources, ledSheets, defaultLedPrint } from './index'

it("shows which processor output feeds each data port of an LED wall", () => {
  const p = newProject()
  const w = newLedWall(p, LED_PANELS[0], 8, 4)
  const wall = syncLedWallDevice(p, w.id)!
  const proc = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.model === 'MX40 Pro')!, { x: -600, y: 0 })
  const outs = proc.product.ports.filter((q) => /^Output \d/.test(q.label))
  expect(outs.length).toBeGreaterThan(2)
  const v1 = connect(p, { equipment: proc.id, port: outs[0].id }, { equipment: wall.id, port: 'data.1' })
  expect(v1.allowed).toBe(true)
  connect(p, { equipment: proc.id, port: outs[2].id }, { equipment: wall.id, port: 'data.2' })
  const src = wallSources(p, w, 'data')
  expect(src.get(1)).toBe(`${proc.tag} · ${outs[0].label}`)
  expect(src.get(2)).toBe(`${proc.tag} · ${outs[2].label}`)
  const sheet = ledSheets(p, { ...defaultLedPrint(), views: ['data'] }).join('')
  expect(sheet).toContain('PROCESSOR OUTPUTS')
  expect(sheet).toContain(`${proc.tag} · ${outs[2].label}`.toUpperCase())
})

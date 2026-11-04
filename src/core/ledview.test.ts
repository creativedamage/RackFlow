import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, createView, LED_PANELS, newLedWall, newProject, syncLedWallDevice, viewMembers, viewPortIds, viewProject, viewsOf } from './index'

it('Video views show LED processor outputs and LED wall data inputs (not other network ports)', () => {
  const p = newProject()
  const w = newLedWall(p, LED_PANELS[0], 8, 4)
  const wall = syncLedWallDevice(p, w.id)!
  const proc = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.model === 'MX40 Pro')!, { x: -600, y: 0 })
  const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch')!, { x: -1200, y: 0 })
  const out1 = proc.product.ports.find((q) => q.label === 'Output 1')!
  connect(p, { equipment: proc.id, port: out1.id }, { equipment: wall.id, port: 'data.1' })
  createView(p, { name: 'Video', domains: ['video'] })
  const v = viewsOf(p).find((x) => x.name === 'Video')!
  const members = viewMembers(p, v).map((e) => e.id)
  expect(members).toContain(wall.id)
  expect(members).toContain(proc.id)
  expect(members).not.toContain(sw.id)
  const wp = viewPortIds(v, wall), pp = viewPortIds(v, proc)
  expect(wp.has('data.1')).toBe(true)
  expect([...wp].some((id) => id.startsWith('power.'))).toBe(false)
  expect(pp.has(out1.id)).toBe(true)
  // the processor's control LAN stays out
  const ctl = proc.product.ports.find((q) => /^LAN/i.test(q.label) && !/output/i.test(q.label))
  if (ctl) expect(pp.has(ctl.id)).toBe(false)
  // and the cable between them is drawn in the view
  expect(viewProject(p, v).cables.length).toBe(1)
})

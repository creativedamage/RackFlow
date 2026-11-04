import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, newProject, networkRows, rowVlan, setNet, switchPortRows, validVlans, vlanTag } from './index'

it('switch ports carry VLANs that the wired device inherits', () => {
  const p = newProject()
  const swp = BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch')!
  const dev = BUILT_IN_PRODUCTS.find((x) => x.category !== 'networkSwitch' && x.ports.filter((q) => q.signals.some((s) => s.startsWith('ethernet'))).length === 1)!
  const sw = addEquipment(p, swp, { x: 0, y: 0 }), d = addEquipment(p, dev, { x: 400, y: 0 })
  const sp = swp.ports.find((q) => q.signals.some((s) => s.startsWith('ethernet')))!
  const dp = dev.ports.find((q) => q.signals.some((s) => s.startsWith('ethernet')))!
  connect(p, { equipment: d.id, port: dp.id }, { equipment: sw.id, port: sp.id })
  setNet(p.equipment.find((e) => e.id === sw.id)!, sp.id, { vlan: '20', mode: 'access' })
  const rows = switchPortRows(p)
  const row = rows.find((r) => r.port.id === sp.id)!
  expect(row.device?.eq.id).toBe(d.id)
  expect(row.info.vlan).toBe('20')
  const dr = networkRows(p).find((r) => r.eq.id === d.id)!
  expect(rowVlan(dr)).toEqual({ vlan: '20', inherited: true })
  expect(vlanTag({ vlan: '20' })).toBe('V20')
  expect(vlanTag({ mode: 'trunk', tagged: '10,20' })).toBe('T 10,20')
  expect(validVlans('10, 20,100-110')).toBe(true)
  expect(validVlans('0')).toBe(false)
  expect(validVlans('5000')).toBe(false)
})

import { defaultSchematic as _ds, portVlanText as _pvt, schematicSheets as _ss } from './index'
it('prints the VLAN under a switch port on the schematic', () => {
  expect(_pvt({ vlan: '20' }, [{ vlan: '20', name: 'Audio', gateway: '10.10.20.1', prefix: 24 }])).toBe('VLAN 20 · AUDIO')
  expect(_pvt({ mode: 'trunk', tagged: '10,20', vlan: '1' })).toBe('TRUNK 10,20 (NATIVE 1)')
  expect(_pvt({})).toBe('')
  const p = newProject()
  const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch')!, { x: 0, y: 0 })
  const port = sw.product.ports.find((x) => x.connector === 'rj45')!
  sw.network = { [port.id]: { vlan: '30' } }
  expect(_ss(p, _ds(p)).join('')).toContain('VLAN 30')
})

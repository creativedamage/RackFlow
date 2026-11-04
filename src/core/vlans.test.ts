import { expect, it } from 'vitest'
import { addEquipment, autoAssignByVlan, BUILT_IN_PRODUCTS, ipVlanIssue, networkRows, newProject, setNet, subnetOf } from './index'

it('works out subnets from gateway and prefix', () => {
  expect(subnetOf({ gateway: '10.10.20.1', prefix: 24 })).toMatchObject({ network: '10.10.20.0', broadcast: '10.10.20.255', mask: '255.255.255.0', hosts: 254, cidr: '10.10.20.0/24' })
  expect(subnetOf({ gateway: '10.10.20.1', prefix: 22 })).toMatchObject({ network: '10.10.20.0', last: '10.10.23.254', mask: '255.255.252.0', hosts: 1022 })
  expect(subnetOf({ gateway: '10.10.21.1', prefix: 22 })!.network).toBe('10.10.20.0')
  expect(subnetOf({ gateway: 'nope', prefix: 24 })).toBeNull()
})

it('assigns each interface an address in its own VLAN, skipping the gateway and used ones', () => {
  const p = newProject()
  const dev = BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.signals.includes('dante')) && x.category !== 'networkSwitch')!
  const eqs = [0, 1, 2].map((i) => addEquipment(p, dev, { x: i * 400, y: 0 }))
  const rows = () => networkRows(p).filter((r) => !r.isSwitch)
  const keys = rows().map((r) => r.key)
  const [r0, r1, r2] = rows()
  setNet(eqs.find((e) => e.id === r0.eq.id)!, r0.portId, { vlan: '20' })
  setNet(eqs.find((e) => e.id === r1.eq.id)!, r1.portId, { vlan: '20', ip: '10.10.20.10' })
  setNet(eqs.find((e) => e.id === r2.eq.id)!, r2.portId, { vlan: '30' })
  p.vlans = [{ vlan: '20', gateway: '10.10.20.1', prefix: 24 }, { vlan: '30', name: 'Video', gateway: '10.10.30.1', prefix: 22, start: '10.10.31.5' }]
  const res = autoAssignByVlan(p, keys)
  const ip = (k: string) => networkRows(p).find((r) => r.key === k)!.info.ip
  expect(ip(r0.key)).toBe('10.10.20.11')
  expect(ip(r1.key)).toBe('10.10.20.10')
  expect(ip(r2.key)).toBe('10.10.31.5')
  expect(res.assigned).toBeGreaterThanOrEqual(2)
  expect(ipVlanIssue(p, '10.10.21.4', '20')).toMatch(/Outside VLAN 20/)
  expect(ipVlanIssue(p, '10.10.20.1', '20')).toMatch(/gateway/)
  expect(ipVlanIssue(p, '10.10.20.50', '20')).toBeNull()
})

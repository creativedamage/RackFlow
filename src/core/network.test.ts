import { describe, expect, it } from 'vitest'
import { addEquipment, addPatchBay, autoAssignIps, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, connect, duplicateIps, makePlateProduct, networkRows, newPlateSpec, newProject, rowSwitch, rowSwitchPort, setNet, validIp } from './index'

describe('network sheet', () => {
  it('traces device → wall plate → patch panel → switch', () => {
    const p = newProject()
    const sw = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.category === 'networkSwitch' && x.ports.filter((q) => q.connector === 'rj45').length > 4)!, { x: 0, y: 0 })
    const dsp = addEquipment(p, BUILT_IN_PRODUCTS.find((x) => x.key === 'generic.dsp.12x8')!, { x: 0, y: 0 })
    const wp = addEquipment(p, makePlateProduct(newPlateSpec('wallPlate'), { model: 'WP' }), { x: 0, y: 0 })
    const bay = addPatchBay(p, BUILT_IN_PATCH_TEMPLATES.find((t) => t.key === 'leviton.6a586-u24')!, { x: 0, y: 0 })
    const lan = dsp.product.ports.find((q) => q.connector === 'rj45')!
    const wf = wp.product.ports.find((q) => q.connector === 'rj45' && q.face === 'front')!
    const wr = wp.product.ports.find((q) => q.connector === 'idcPunchdown')!
    const swp = sw.product.ports.filter((q) => q.connector === 'rj45')[3]
    expect(connect(p, { equipment: dsp.id, port: lan.id }, { equipment: wp.id, port: wf.id }).cableId).toBeTruthy()
    expect(connect(p, { equipment: wp.id, port: wr.id }, { equipment: bay.equipment, port: 'r1.c05' }).cableId).toBeTruthy()
    expect(connect(p, { equipment: bay.equipment, port: 'r1.c05.f' }, { equipment: sw.id, port: swp.id }).cableId).toBeTruthy()
    const rows = networkRows(p)
    const r = rows.find((x) => x.eq.id === dsp.id && x.portId === lan.id)!
    expect(rowSwitch(r)).toBe(sw.tag)
    expect(rowSwitchPort(r)).toBe(swp.label)
    expect(r.link!.via).toHaveLength(2)
    expect(rows.some((x) => x.eq.id === sw.id && x.isSwitch)).toBe(true)
    expect(rows.some((x) => x.eq.product.category === 'patchBay')).toBe(false)
    // Manual override and IPs
    setNet(dsp, lan.id, { ip: '10.0.0.5', switchPort: 'Gi1/0/4' })
    expect(rowSwitchPort(networkRows(p).find((x) => x.key === r.key)!)).toBe('Gi1/0/4')
    expect(validIp('10.0.0.5')).toBe(true); expect(validIp('10.0.0.300')).toBe(false); expect(validIp('10.0.0.5/24')).toBe(true)
    const keys = networkRows(p).map((x) => x.key)
    const n = autoAssignIps(p, keys, '10.0.0.4')
    expect(n).toBe(keys.length - 1)
    const ips = networkRows(p).map((x) => x.info.ip)
    expect(new Set(ips).size).toBe(ips.length)
    expect(duplicateIps(networkRows(p)).size).toBe(0)
  })
})

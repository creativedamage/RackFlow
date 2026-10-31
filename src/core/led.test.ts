import { describe, expect, it } from 'vitest'
import { chains, LED_PANELS, ledSheets, newLedWall, newProject, orderCells, syncLedWallDevice, wallStats, defaultLedPrint } from './index'

describe('LED walls', () => {
  it('orders, chains and sizes a wall', () => {
    const p = newProject()
    const panel = LED_PANELS.find((x) => x.model === 'Black Pearl BP2V2')!
    const w = newLedWall(p, panel, 10, 5)
    expect(panel.pxW).toBe(176)
    // vertical snake from bottom-left: first column goes up, second comes down
    const o = orderCells(w, w.data)
    expect(o.slice(0, 6)).toEqual([{ c: 0, r: 4 }, { c: 0, r: 3 }, { c: 0, r: 2 }, { c: 0, r: 1 }, { c: 0, r: 0 }, { c: 1, r: 0 }])
    const d = chains(w, 'data')
    // 650k / (176*176) = 20 panels → whole columns of 5 → 4 columns per port
    expect(d[0].cells).toHaveLength(20)
    expect(d.reduce((a, c) => a + c.cells.length, 0)).toBe(50)
    const pw = chains(w, 'power') // 20A*0.8*120 / 190 = 10 panels → 2 columns per circuit
    expect(pw[0].cells).toHaveLength(10)
    const st = wallStats(w)
    expect(st.pxW).toBe(1760); expect(st.dataPorts).toBe(3); expect(st.circuits).toBe(5)
    w.removed = ['0,0', '9,0']
    expect(wallStats(w).panels).toBe(48)
    const eq = syncLedWallDevice(p, w.id)!
    expect(eq.product.ports.filter((x) => x.group === 'Data')).toHaveLength(3)
    expect(ledSheets(p, defaultLedPrint())).toHaveLength(2)
  })
})

import { moveToPage, nodeGeom, createGroup, addEquipment, BUILT_IN_PRODUCTS, newProject as np2 } from './index'
describe('moveToPage', () => {
  it('moves devices onto a page in free space and keeps their spacing', () => {
    const p = np2()
    const prod = BUILT_IN_PRODUCTS.find((x) => x.key === 'generic.dsp.12x8')!
    const a = addEquipment(p, prod, { x: 0, y: 0 }), b = addEquipment(p, prod, { x: 400, y: 0 }), c = addEquipment(p, prod, { x: 400, y: 300 })
    const g = createGroup(p, [a.id], { name: 'Stage' })
    expect(moveToPage(p, [b.id, c.id], g.id, nodeGeom)).toBe(2)
    expect(b.groupId).toBe(g.id)
    expect(c.position.y - b.position.y).toBe(300)
    expect(c.position.x).toBe(b.position.x)
    expect(b.position.x).toBeGreaterThanOrEqual(a.position.x + nodeGeom(a).width + 150)
    moveToPage(p, [c.id], null, nodeGeom)
    expect(c.groupId).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { addEquipment, autoArrange, binding, BUILT_IN_PRODUCTS, connect, makePlateProduct, newPlateSpec, newProject, nextPid, panelBayLayout, syncPanelBay, withLayout } from './index'

const panel = (patchBay: boolean) => {
  const spec = withLayout(newPlateSpec('rackPanel'))
  spec.inserts = []
  for (let i = 0; i < 8; i++) spec.inserts.push({ module: 'xlrF', count: 1, rear: 'same', pid: nextPid(spec, 'xlrF') })
  for (let i = 0; i < 4; i++) spec.inserts.push({ module: 'rj45', count: 1, rear: 'same', pid: nextPid(spec, 'rj45') })
  spec.layout!.jacks = autoArrange(spec, { w: spec.layout!.w, h: spec.layout!.h, ru: 1 })
  if (patchBay) spec.patchBay = true
  return makePlateProduct(spec, { model: 'Stage Panel' })
}

describe('rack panels as patch panels', () => {
  it('only panels set as patch panels get a bay', () => {
    const p = newProject()
    addEquipment(p, panel(false), { x: 0, y: 0 })
    expect(p.patchBays).toHaveLength(0)
    const e = addEquipment(p, panel(true), { x: 0, y: 0 })
    expect(p.patchBays).toHaveLength(1)
    const bay = p.patchBays[0]
    expect(bay.equipment).toBe(e.id)
    const cells = bay.template.rows.reduce((a, r) => a + r.strip.channelCount, 0)
    expect(cells).toBe(12)
    expect(Object.keys(bay.portMap!)).toHaveLength(12)
  })

  it('cells are left to right and labels read the panel wiring', () => {
    const p = newProject()
    const e = addEquipment(p, panel(true), { x: 0, y: 0 })
    const bay = p.patchBays[0]
    const lay = panelBayLayout(e.product)!
    const xs = lay.template.rows[0].strip.cellWidthsMM!
    expect(xs.every((w) => w > 0)).toBe(true)
    const mic = BUILT_IN_PRODUCTS.find((x) => x.ports.some((q) => q.connector === 'xlr3' && q.direction === 'input'))!
    const dev = addEquipment(p, mic, { x: 400, y: 0 })
    const base = bay.portMap!['1.1']
    const inPort = dev.product.ports.find((q) => q.connector === 'xlr3' && q.direction === 'input')!
    connect(p, { equipment: e.id, port: `${base}.r` }, { equipment: dev.id, port: inPort.id })
    const row = Number(Object.keys(bay.portMap!).find((k) => bay.portMap![k] === base)!.split('.')[0])
    const b = binding(bay, row, 1, p)
    expect(b?.remote.equipment.id).toBe(dev.id)
  })

  it('unticking the option removes the bay; editing keeps labels on their jacks', () => {
    const p = newProject()
    const e = addEquipment(p, panel(true), { x: 0, y: 0 })
    const bay = p.patchBays[0]
    const cell = bay.cells.find((c) => bay.portMap![`${c.row}.${c.channel}`] === bay.portMap!['1.2'])!
    cell.text = 'KEEP'; cell.manual = true
    const kept = bay.portMap!['1.2']
    // Remove the first jack and re-sync: the label follows its jack.
    const spec = structuredClone(e.product.plate!)
    spec.inserts = spec.inserts.filter((x) => x.pid !== bay.portMap!['1.1'])
    e.product = makePlateProduct(spec, { key: e.product.key, model: 'Stage Panel' })
    syncPanelBay(p, e)
    const k = Object.entries(p.patchBays[0].portMap!).find(([, v]) => v === kept)![0]
    const [r, c] = k.split('.').map(Number)
    expect(p.patchBays[0].cells.find((x) => x.row === r && x.channel === c)?.text).toBe('KEEP')
    delete e.product.plate!.patchBay
    syncPanelBay(p, e)
    expect(p.patchBays).toHaveLength(0)
    expect(p.equipment).toHaveLength(1)
  })
})

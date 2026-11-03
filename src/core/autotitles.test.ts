import { expect, it } from 'vitest'
import { addEquipment, addPatchBay, BUILT_IN_PATCH_TEMPLATES, BUILT_IN_PRODUCTS, connect, newProject, patchPortId, refreshLabels } from './index'

it('patch bays title channels by the wall box they come from, and keep your own titles', () => {
  const p = newProject()
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.format === 'ttBantam')!
  const bay = addPatchBay(p, t, { x: 0, y: 0 })
  const wpProd = BUILT_IN_PRODUCTS.find((x) => x.category === 'wallPlate' && x.ports.filter((q) => q.signals.includes('analogMic')).length >= 2)!
  const wp1 = addEquipment(p, wpProd, { x: 500, y: 0 }), wp2 = addEquipment(p, wpProd, { x: 500, y: 300 })
  wp1.room = 'Stage Left'
  const mics = (e: typeof wp1) => e.product.ports.filter((q) => q.signals.includes('analogMic')).slice(0, 2)
  const row = t.rows[0].id
  mics(wp1).forEach((q, i) => connect(p, { equipment: wp1.id, port: q.id }, { equipment: bay.equipment, port: patchPortId(row, i + 1) }))
  mics(wp2).forEach((q, i) => connect(p, { equipment: wp2.id, port: q.id }, { equipment: bay.equipment, port: patchPortId(row, i + 3) }))
  const b = p.patchBays[0]
  refreshLabels(b, p)
  const titles = b.spans.filter((s) => s.row === row).map((s) => [s.start, s.end, s.text])
  expect(titles).toEqual([[1, 2, `${wp1.tag} · STAGE LEFT`], [3, 4, wp2.tag]])
  // Make the first one yours: it survives the next refresh.
  const first = b.spans.find((s) => s.start === 1)!; first.text = 'PODIUM'; delete first.auto
  refreshLabels(b, p)
  expect(b.spans.filter((s) => s.row === row).map((s) => s.text)).toEqual(['PODIUM', wp2.tag])
})

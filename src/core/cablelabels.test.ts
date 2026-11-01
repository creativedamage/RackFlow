import { expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, DEFAULT_CONTENT, LABEL_TEMPLATES, labelSheets, labelsFor, newProject, pullRows } from './index'

const prod = (k: string) => BUILT_IN_PRODUCTS.find((p) => p.key === k)!

it('prints the cable number on each label, two per cable, across as many sheets as needed', () => {
  const p = newProject()
  const a = addEquipment(p, prod('generic.dsp.12x8'), { x: 0, y: 0 }), b = addEquipment(p, prod('generic.dsp.12x8'), { x: 400, y: 0 })
  const outs = a.product.ports.filter((x) => x.direction === 'output' && /Line/.test(x.label))
  const ins = b.product.ports.filter((x) => x.direction === 'input')
  outs.forEach((o, i) => connect(p, { equipment: a.id, port: o.id }, { equipment: b.id, port: ins[i].id }))
  const labels = labelsFor(pullRows(p), { copies: 2, content: DEFAULT_CONTENT })
  expect(labels).toHaveLength(outs.length * 2)
  expect(labels[0]).toEqual({ big: p.cables[0].label, lines: [] })
  const t = LABEL_TEMPLATES.find((x) => x.id === 'sl-2x1.5')! // 8 per sheet
  const pages = labelSheets(t, labels, { copies: 2, content: DEFAULT_CONTENT, skip: 3 })
  expect(pages).toHaveLength(Math.ceil((labels.length + 3) / 8))
  expect(pages[0]).toContain(p.cables[0].label)
  expect(pages[0]).toContain('width="8.5in"')
})

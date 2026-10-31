import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, connect, defaultNumberingStandard, newProject, nextTag, renumberDevices } from './index'

const product = (k: string) => BUILT_IN_PRODUCTS.find((x) => x.key === k)!

describe('numbering standards', () => {
  it('builds tags and cable labels from the standard', () => {
    const p = newProject()
    const s = defaultNumberingStandard()
    s.tags.dsp = { prefix: 'DSP', digits: 3 }
    s.tagDefaults = { separator: '-', digits: 3, start: 1 }
    s.cables.audio = { prefix: 'AUD', digits: 3, start: 100 }
    s.cableDefaults = { separator: '.', digits: 4, start: 1 }
    p.numbering = s
    const dsp = addEquipment(p, product('generic.dsp.12x8'), { x: 0, y: 0 })
    const amp = addEquipment(p, product('generic.amp.4ch'), { x: 400, y: 0 })
    expect(dsp.tag).toBe('DSP-001')
    expect(amp.tag).toBe('AMP-001')
    connect(p, { equipment: dsp.id, port: dsp.product.ports.find((x) => x.label === 'Line Out 1')!.id }, { equipment: amp.id, port: amp.product.ports.find((x) => x.label === 'Input 1')!.id })
    expect(p.cables[0].label).toBe('AUD.100')
    expect(nextTag(p, 'dsp')).toBe('DSP-002')
  })

  it('renumbers devices top-to-bottom per category', () => {
    const p = newProject()
    const a = addEquipment(p, product('generic.amp.4ch'), { x: 0, y: 500 })
    const b = addEquipment(p, product('generic.amp.4ch'), { x: 0, y: 0 })
    p.numbering = { ...defaultNumberingStandard(), tags: { amplifier: { prefix: 'PA', digits: 3 } } }
    expect(renumberDevices(p)).toBe(2)
    expect(b.tag).toBe('PA-001')
    expect(a.tag).toBe('PA-002')
  })
})

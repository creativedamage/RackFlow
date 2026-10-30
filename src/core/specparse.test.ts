import { describe, expect, it } from 'vitest'
import { BUILT_IN_MANUFACTURERS, BUILT_IN_PRODUCTS, draftFromJSON, draftToProduct, fuzzyFind, htmlToText, ManufacturerDirectory, parseSpecText, productProblems, ProductLibrary, splitMakerModel } from './index'

const URSA = `Connections
SDI Video Outputs
1 x 12G-SDI, 1 x 3G-SDI monitoring
SDI Video Inputs
1 x 12G-SDI for program return
Analog Audio Inputs
2 x XLR analog switchable between mic, line and AES audio. Phantom power support.
Analog Audio Outputs
1 x 3.5mm headphone jack
Reference Inputs
Tri-Sync/Black Burst/Timecode
Remote Control
1 x 2.5mm LANC input
Computer Interface
1 x USB Type-C
Ethernet
1 x 10G Ethernet
Power
1 x 4-pin XLR 12V DC input
Power Consumption
Approximately 33W
Weight
2.62 kg`

const sum = (d: ReturnType<typeof parseSpecText>) => d.ports.map((p) => `${p.count}×${p.label}|${p.connector}|${p.direction}`)

describe('spec parser', () => {
  it('reads a heading/value camera spec sheet', () => {
    const d = parseSpecText(URSA)
    const s = sum(d)
    expect(s).toContain('1×12G-SDI Out|bnc|output')
    expect(s).toContain('1×3G-SDI Out|bnc|output')
    expect(s).toContain('1×12G-SDI In|bnc|input')
    expect(s.some((x) => x.startsWith('2×') && x.includes('|xlr3|input'))).toBe(true)
    expect(s).toContain('1×Headphones Out|trs3_5|output')
    expect(s.some((x) => x.includes('Ref') && x.includes('bnc|input'))).toBe(true)
    expect(s).toContain('1×LANC In|trs3_5|input')
    expect(s.some((x) => x.includes('usbC'))).toBe(true)
    expect(s.some((x) => x.includes('10G Ethernet|rj45|bidirectional'))).toBe(true)
    expect(s).toContain('1×DC In|xlr4|input')
    expect(d.typicalWatts).toBe(33)
    expect(d.weightKG).toBe(2.62)
    const p = draftToProduct({ ...d, manufacturer: 'Blackmagic Design', model: 'URSA Broadcast G2' })
    expect(p.category).toBe('camera')
    expect(p.physical.rackUnits).toBeNull()
    expect(p.power.acceptedVoltages).toEqual(['dc12V'])
    expect(productProblems(p)).toEqual([])
    expect(p.ports.filter((x) => x.connector === 'xlr3')).toHaveLength(2)
  })

  it('reads a pasted one-line list', () => {
    const d = parseSpecText('4 x 12G-SDI In, 2 x 12G-SDI Out, 1 x HDMI Out, 2 x XLR Line Out, Ethernet, IEC power')
    expect(sum(d)).toEqual(['4×12G-SDI In|bnc|input', '2×12G-SDI Out|bnc|output', '1×HDMI Out|hdmi|output', '2×Audio Out|xlr3|output', '1×Ethernet|rj45|bidirectional', '1×AC In|iecC13C14|input'])
    const p = draftToProduct(d)
    expect(p.ports.map((x) => x.label).slice(0, 5)).toEqual(['12G-SDI In 1', '12G-SDI In 2', '12G-SDI In 3', '12G-SDI In 4', '12G-SDI Out 1'])
    expect(productProblems({ ...p, manufacturer: 'X' })).toEqual([])
  })

  it('ignores format lines', () => {
    expect(parseSpecText('SDI Rates: 1.5G, 3G, 6G, 12G\nSDI Compliance: SMPTE 292M').ports).toHaveLength(0)
  })

  it('cleans HTML and AI JSON', () => {
    expect(htmlToText('<tr><td>SDI Video Outputs</td><td>2 &times; 12G-SDI</td></tr><script>x</script>')).toContain('SDI Video Outputs : 2 × 12G-SDI')
    const d = draftFromJSON({ model: 'X', category: 'camera', ports: [{ label: 'SDI Out', count: 2, connector: 'bnc', direction: 'output', signals: ['sdi12G'] }, { label: 'Weird thing' }, { label: 'Mic In', connector: 'mini-xlr' }] })
    expect(d.ports.map((p) => p.connector)).toEqual(['bnc', 'miniXlr'])
    expect(d.unmatched).toEqual(['Weird thing'])
  })

  it('splits maker and model, finds near-misses', () => {
    const makers = new ManufacturerDirectory(BUILT_IN_MANUFACTURERS)
    expect(splitMakerModel('Blackmagic URSA Broadcast G2', makers).manufacturer).toBe('Blackmagic Design')
    const lib = new ProductLibrary(BUILT_IN_PRODUCTS, [])
    const hits = fuzzyFind(lib, 'blackmagic smartview 4k')
    expect(hits[0].product.model).toContain('SmartView 4K')
    expect(fuzzyFind(lib, 'smartveiw duo')[0].product.model).toContain('SmartView Duo')
  })
})

// Custom wall plates, floor boxes and stage pockets: passive connection points
// built from standard inserts. Each insert gives a front jack (what you plug into
// in the room) and a rear termination (the tie line back to the rack).

import { makeFiberProduct } from './fiber'
import { newId, type PlateInsert, type PlateKind, type PlateSpec, type PortTemplate, type ProductDefinition } from './model'
import type { ConnectorType, Gender, SignalType } from './signals'

export interface PlateModule {
  name: string
  connector: ConnectorType
  gender: Gender
  signals: SignalType[]
  /** Default rear termination. */
  rear: PlateInsert['rear']
  /** Power receptacle: an outlet fed by the box's circuit, no tie line. */
  power?: boolean
  group: string
}

const M = (name: string, connector: ConnectorType, gender: Gender, signals: SignalType[], group: string, rear: PlateInsert['rear'] = 'same', power = false): PlateModule =>
  ({ name, connector, gender, signals, group, rear, power })

const AUDIO: SignalType[] = ['analogMic', 'analogLine', 'aes3']
const NET: SignalType[] = ['ethernet1G', 'ethernet100M', 'dante', 'aes67', 'ndi', 'sacn', 'artNet', 'ipControl', 'hdbaseT']

export const PLATE_MODULES: Record<string, PlateModule> = {
  xlrF: M('XLR-3 Female (mic/line in)', 'xlr3', 'female', AUDIO, 'Audio', 'idcPunchdown'),
  xlrM: M('XLR-3 Male (line out)', 'xlr3', 'male', AUDIO, 'Audio', 'idcPunchdown'),
  trs: M('1/4" TRS', 'trs6_35', 'female', ['analogLine', 'analogMic'], 'Audio', 'idcPunchdown'),
  mini: M('3.5 mm Stereo', 'trs3_5', 'female', ['analogLine'], 'Audio', 'euroblock'),
  rca: M('RCA', 'rca', 'female', ['analogLine', 'analogComposite'], 'Audio', 'same'),
  nl4: M('speakON NL4', 'speakonNL4', 'female', ['speakerLowZ', 'speaker70V', 'speaker100V'], 'Speaker', 'euroblock'),
  binding: M('Binding Posts', 'bindingPost', 'female', ['speakerLowZ', 'speaker70V', 'speaker100V'], 'Speaker', 'euroblock'),
  dmx: M('DMX XLR-5', 'xlr5', 'female', ['dmx512'], 'Lighting', 'idcPunchdown'),
  hdmi: M('HDMI', 'hdmi', 'female', ['hdmi20', 'hdmi14', 'dviD'], 'Video'),
  usbc: M('USB-C', 'usbC', 'female', ['usb3', 'usb2'], 'Video'),
  usbA: M('USB-A', 'usbA', 'female', ['usb3', 'usb2'], 'Data'),
  usbB: M('USB-B', 'usbB', 'female', ['usb3', 'usb2'], 'Data'),
  dp: M('DisplayPort', 'displayPort', 'female', ['displayPort14', 'displayPort12'], 'Video'),
  vga: M('VGA (HD15)', 'hd15', 'female', ['analogComposite'], 'Video'),
  bnc: M('BNC (SDI)', 'bnc', 'female', ['sdi12G', 'sdi6G', 'sdi3G', 'sdiHD', 'analogComposite'], 'Video'),
  rj45: M('RJ45 (Cat6A)', 'rj45', 'female', NET, 'Network', 'idcPunchdown'),
  ethercon: M('etherCON', 'etherCON', 'female', NET, 'Network'),
  fiber: M('Fiber LC Duplex', 'lcDuplex', 'female', ['ethernet10G', 'ethernet1G', 'st2110', 'dante', 'ndi'], 'Network'),
  opticalcon: M('opticalCON DUO', 'opticalCON', 'female', ['ethernet10G', 'ethernet1G'], 'Network'),
  w1F: M('Whirlwind W1 Female (39-pin, 12 pr)', 'whirlwindW1', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  w1M: M('Whirlwind W1 Male (39-pin, 12 pr)', 'whirlwindW1', 'male', AUDIO, 'Multipin', 'idcPunchdown'),
  w2F: M('Whirlwind W2 Female (61-pin, 20 pr)', 'whirlwindW2', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  w2M: M('Whirlwind W2 Male (61-pin, 20 pr)', 'whirlwindW2', 'male', AUDIO, 'Multipin', 'idcPunchdown'),
  amp57F: M('Amphenol 57 Female (50-pin, 25 pr)', 'amphenol57', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  socaF: M('Socapex 19-pin Female', 'socapex19', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  socaM: M('Socapex 19-pin Male', 'socapex19', 'male', AUDIO, 'Multipin', 'idcPunchdown'),
  edac56: M('EDAC 56-pin', 'edac56', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  edac90: M('EDAC 90-pin', 'edac90', 'female', AUDIO, 'Multipin', 'idcPunchdown'),
  db9: M('DB9 (RS-232)', 'db9', 'female', ['rs232'], 'Control', 'euroblock'),
  euro: M('Euroblock (control)', 'euroblock', 'female', ['rs232', 'rs485', 'ir', 'gpio', 'contactClosure', 'analogLine'], 'Control', 'same'),
  pwr515: M('Duplex 5-15R (power)', 'nema5_15', 'female', ['ac120V'], 'Power', 'none', true),
  pwr520: M('Duplex 5-20R (power)', 'nema5_20', 'female', ['ac120V'], 'Power', 'none', true),
  pwrL530: M('L5-30R (power)', 'nemaL5_30', 'female', ['ac120V'], 'Power', 'none', true),
  pwrTrue1: M('powerCON TRUE1 (power)', 'powerCONTrue1', 'female', ['ac120V', 'ac230V'], 'Power', 'none', true),
  pwrSchuko: M('Schuko (power)', 'schuko', 'female', ['ac230V'], 'Power', 'none', true),
}
export const PLATE_MODULE_KEYS = Object.keys(PLATE_MODULES)

export const PLATE_STYLES: Record<PlateKind, string[]> = {
  wallPlate: ['1-Gang', '2-Gang', '3-Gang', '4-Gang', 'Decora 1-Gang', 'Decora 2-Gang', 'Custom'],
  floorBox: ['2-Compartment', '4-Compartment', '6-Compartment', '8-Compartment', 'Poke-Thru', 'Stage Pocket', 'Custom'],
  wallBox: ['UCP 3.5" x 3.5"', '6" x 6"', '8" x 8"', '10" x 10"', '12" x 12"', '8.5" x 5.75"', '5.75" x 8.5"', '8.5" x 7.5"', '7.5" x 8.5"', '14.5" x 7.5"', '7.5" x 14.5"', '14.5" x 10.5"', '10.5" x 14.5"', '17" x 7.5"', '7.5" x 17"', '17" x 10.5"', '10.5" x 17"', 'Custom'],
  rackPanel: ['1RU', '2RU', '3RU', '4RU'],
}

const REAR_NAME: Record<Exclude<PlateInsert['rear'], 'same' | 'none'>, ConnectorType> = { idcPunchdown: 'idcPunchdown', euroblock: 'euroblock' }

/** Ports for a plate: front jacks (left on the diagram) and rear tie lines (right). */
export function platePorts(spec: PlateSpec): PortTemplate[] {
  const ports: PortTemplate[] = []
  const used = new Map<string, number>()
  for (const ins of spec.inserts) {
    const m = PLATE_MODULES[ins.module]
    if (!m) continue
    for (let i = 0; i < Math.max(1, ins.count); i++) {
      const n = (used.get(ins.module) ?? 0) + 1
      used.set(ins.module, n)
      const base = ins.label?.trim() || shortName(m)
      const label = ins.label?.trim() && ins.count === 1 ? base : ins.count > 1 || n > 1 ? `${base} ${n}` : base
      const id = ins.pid && ins.count === 1 ? ins.pid : `${ins.module}.${n}`
      if (m.power) {
        ports.push({ id: `${id}.out`, label, connector: m.connector, gender: m.gender, direction: 'output', signals: [...m.signals], group: 'Power',
          face: 'front', maxConnections: 2, powerCapacityWatts: (spec.power?.volts ?? 120) * (spec.power?.amps ?? 20) })
        continue
      }
      ports.push({ id: `${id}.f`, label, connector: m.connector, gender: m.gender, direction: 'bidirectional', signals: [...m.signals], group: m.group, face: 'front', maxConnections: 1 })
      if (ins.rear !== 'none') {
        const rc = ins.rear === 'same' ? m.connector : REAR_NAME[ins.rear]
        ports.push({ id: `${id}.r`, label: `${label} (rear)`, connector: rc, gender: ins.rear === 'same' ? m.gender === 'male' ? 'male' : 'female' : 'female',
          direction: 'bidirectional', signals: [...m.signals], group: m.group, face: 'rear', maxConnections: 1 })
      }
    }
  }
  return ports
}

const KIND_LABEL: Record<PlateKind, string> = { wallBox: 'wall box', wallPlate: 'wall plate', floorBox: 'floor box', rackPanel: 'rack connector panel' }

const shortName = (m: PlateModule) => m.name.replace(/\s*\(.*\)$/, '')

export function plateSummary(spec: PlateSpec): string {
  const parts = spec.inserts.filter((i) => PLATE_MODULES[i.module]).map((i) => `${i.count}× ${shortName(PLATE_MODULES[i.module])}`)
  return `${spec.style} ${KIND_LABEL[spec.kind]}: ${parts.join(', ') || 'empty'}`
}

/** Builds (or rebuilds) the product for a plate spec. */
export function makePlateProduct(spec: PlateSpec, meta: { key?: string; manufacturer?: string; model: string }): ProductDefinition {
  const hasPower = spec.inserts.some((i) => PLATE_MODULES[i.module]?.power)
  return {
    key: meta.key ?? `user.plate.${newId()}`,
    manufacturer: meta.manufacturer?.trim() || 'Custom',
    model: meta.model.trim() || ({ wallBox: 'Wall Box', floorBox: 'Floor Box', rackPanel: 'Connector Panel', wallPlate: 'Wall Plate' } as const)[spec.kind],
    summary: plateSummary(spec),
    category: spec.kind === 'rackPanel' ? 'connectorPanel' : spec.kind,
    tags: ['plate', KIND_LABEL[spec.kind], 'connection point', spec.style.toLowerCase()],
    physical: spec.kind === 'rackPanel'
      ? { rackUnits: Math.max(1, parseInt(spec.style, 10) || 1), halfWidth: false, widthMM: 482.6, heightMM: 44.45 * (parseInt(spec.style, 10) || 1), depthMM: 50, weightKG: 1, mounting: 'rack' }
      : { rackUnits: null, halfWidth: false, widthMM: spec.layout?.w ?? 120, heightMM: spec.layout?.h ?? 120, depthMM: spec.kind === 'floorBox' ? 100 : spec.kind === 'wallBox' ? 101.6 : 60, weightKG: spec.kind === 'wallBox' ? 1.4 : 0.4, mounting: spec.kind === 'floorBox' ? 'floor' : 'wall' },
    power: { acceptedVoltages: [], typicalWatts: 0, maxWatts: 0, publishedBTU: null, efficiency: null, poweredByPoE: false },
    ports: platePorts(spec),
    source: 'user',
    revision: 1,
    supply: hasPower ? { volts: spec.power?.volts ?? 120, amps: spec.power?.amps ?? 20, phases: 1 } : undefined,
    plate: structuredClone(spec),
  }
}

export const newPlateSpec = (kind: PlateKind = 'wallPlate'): PlateSpec => kind === 'wallPlate'
  ? { kind, style: '1-Gang', inserts: [{ module: 'hdmi', count: 1, rear: 'same' }, { module: 'rj45', count: 1, rear: 'idcPunchdown' }] }
  : kind === 'wallBox'
  ? { kind, style: '6" x 6"', inserts: [{ module: 'xlrF', count: 4, rear: 'idcPunchdown' }, { module: 'ethercon', count: 2, rear: 'same' }] }
  : kind === 'rackPanel'
  ? { kind, style: '1RU', inserts: [{ module: 'xlrF', count: 8, rear: 'idcPunchdown' }, { module: 'rj45', count: 4, rear: 'idcPunchdown' }] }
  : { kind, style: '4-Compartment', inserts: [{ module: 'pwr520', count: 2, rear: 'none' }, { module: 'rj45', count: 2, rear: 'idcPunchdown' }, { module: 'hdmi', count: 1, rear: 'same' }], power: { volts: 120, amps: 20 } }

/** Built-in starting points (generic). */
export const PLATE_PRODUCTS: ProductDefinition[] = [
  { ...makeFiberProduct({ enclosure: 'fhd-1u', fiberType: 'OS2', slots: [{ module: 'mtp12-6lc' }, { module: 'mtp12-6lc' }, { module: null }, { module: null }] }, { key: 'fs.fhd.1u.2x12.os2', manufacturer: 'FS.com', model: 'FHD 1U enclosure, 2× MTP-12 → 6× LC cassettes (24F OS2)' }), source: 'builtIn', verified: false },
  { ...makeFiberProduct({ enclosure: 'fhd-1u', fiberType: 'OM4', slots: [{ module: 'mtp12-6lc' }, { module: 'mtp12-6lc' }, { module: null }, { module: null }] }, { key: 'fs.fhd.1u.2x12.om4', manufacturer: 'FS.com', model: 'FHD 1U enclosure, 2× MTP-12 → 6× LC cassettes (24F OM4)' }), source: 'builtIn', verified: false },
  { ...makeFiberProduct({ enclosure: 'fhd-1u', fiberType: 'OS2', slots: [{ module: 'lc12' }, { module: 'lc12' }, { module: 'lc12' }, { module: 'lc12' }] }, { key: 'fs.fhd.1u.4x12lc.os2', manufacturer: 'FS.com', model: 'FHD 1U enclosure, 4× 12-LC adapter panels (96F OS2)' }), source: 'builtIn', verified: false },
  { ...makePlateProduct({ kind: 'wallPlate', style: '1-Gang', inserts: [{ module: 'hdmi', count: 1, rear: 'same' }, { module: 'usbc', count: 1, rear: 'same' }, { module: 'rj45', count: 1, rear: 'idcPunchdown' }] },
    { key: 'generic.plate.av1', manufacturer: 'Generic', model: 'AV Wall Plate: HDMI + USB-C + RJ45' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'wallPlate', style: '2-Gang', inserts: [{ module: 'xlrF', count: 4, rear: 'idcPunchdown' }] },
    { key: 'generic.plate.xlr4', manufacturer: 'Generic', model: 'Audio Wall Plate: 4× XLR F' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'wallPlate', style: '2-Gang', inserts: [{ module: 'xlrF', count: 2, rear: 'idcPunchdown' }, { module: 'xlrM', count: 2, rear: 'idcPunchdown' }, { module: 'rj45', count: 2, rear: 'idcPunchdown' }] },
    { key: 'generic.plate.av2', manufacturer: 'Generic', model: 'Stage Wall Plate: 2× XLR F, 2× XLR M, 2× RJ45' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'wallPlate', style: '1-Gang', inserts: [{ module: 'nl4', count: 2, rear: 'euroblock' }] },
    { key: 'generic.plate.nl4', manufacturer: 'Generic', model: 'Speaker Wall Plate: 2× NL4' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'wallPlate', style: '1-Gang', inserts: [{ module: 'bnc', count: 4, rear: 'same' }] },
    { key: 'generic.plate.bnc4', manufacturer: 'Generic', model: 'Video Wall Plate: 4× BNC' }), source: 'builtIn' },
  { ...makePlateProduct(newPlateSpec('wallBox'), { key: 'generic.wallbox.6x6', manufacturer: 'Generic', model: 'Wall Box 6" x 6": 4× XLR-F, 2× etherCON' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'wallBox', style: '17" x 10.5"', inserts: [{ module: 'xlrF', count: 12, rear: 'idcPunchdown' }, { module: 'xlrM', count: 4, rear: 'idcPunchdown' }, { module: 'ethercon', count: 2, rear: 'same' }, { module: 'bnc', count: 2, rear: 'same' }] }, { key: 'generic.wallbox.17x10', manufacturer: 'Generic', model: 'Stage Wall Box 17" x 10.5": 12× XLR-F, 4× XLR-M, 2× etherCON, 2× BNC' }), source: 'builtIn' },
  { ...makePlateProduct(newPlateSpec('floorBox'), { key: 'generic.floorbox.4', manufacturer: 'Generic', model: 'Floor Box: 2× 5-20R, 2× RJ45, HDMI' }), source: 'builtIn' },
  { ...makePlateProduct({ kind: 'floorBox', style: 'Stage Pocket', power: { volts: 120, amps: 20 }, inserts: [
    { module: 'xlrF', count: 8, rear: 'idcPunchdown' }, { module: 'xlrM', count: 4, rear: 'idcPunchdown' }, { module: 'nl4', count: 2, rear: 'euroblock' },
    { module: 'dmx', count: 1, rear: 'idcPunchdown' }, { module: 'ethercon', count: 2, rear: 'same' }, { module: 'pwr520', count: 1, rear: 'none' }] },
    { key: 'generic.floorbox.stagepocket', manufacturer: 'Generic', model: 'Stage Pocket: 8× XLR F, 4× XLR M, 2× NL4, DMX, 2× etherCON, 5-20R' }), source: 'builtIn' },
]

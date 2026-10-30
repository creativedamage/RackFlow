// Product helpers, the generic seed catalog, search and product validation.
//
// DATA POLICY: GENERIC_PRODUCTS are brand-neutral with representative specs.
// Manufacturer products live in ./catalog/*: real model names and I/O from the
// published ranges, flagged verified:false with a dataNote because weight,
// depth and power are approximate. Users verify against the spec sheet.

import { CATALOG_PRODUCTS } from './catalog/index'
import { PLATE_PRODUCTS } from './plates'
import {
  CATEGORIES, newId,
  type EquipmentCategory, type MountType, type PanelFace, type PortDirection, type PortTemplate, type ProductDefinition,
} from './model'
import { RACK_UNIT_MM } from './project'
import { SIGNALS, type ConnectorType, type Gender, type SignalDomain, type SignalType } from './signals'

export function port(id: string, label: string, connector: ConnectorType, gender: Gender, direction: PortDirection,
  signals: SignalType[], group?: string, extra: Partial<PortTemplate> = {}): PortTemplate {
  return { id, label, connector, gender, direction, signals, group, face: 'rear', maxConnections: 1, ...extra }
}

/** Bulk-create numbered ports – "Add 16 × Mic In {n}". */
export function series(idPrefix: string, pattern: string, count: number, connector: ConnectorType, gender: Gender,
  direction: PortDirection, signals: SignalType[], group?: string, start = 1, face: PanelFace = 'rear'): PortTemplate[] {
  const width = Math.max(2, String(start + count - 1).length)
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const n = start + i
    return { id: `${idPrefix}.${String(n).padStart(width, '0')}`, label: pattern.replaceAll('{n}', String(n)), connector, gender, direction, signals: [...signals], group, face, maxConnections: 1 }
  })
}

export const productName = (p: ProductDefinition) => `${p.manufacturer} ${p.model}`.trim()
export const productDomains = (p: ProductDefinition): Set<SignalDomain> =>
  new Set(p.ports.flatMap((x) => (x.signals[0] ? [SIGNALS[x.signals[0]].domain] : [])))

export function newCustomProduct(): ProductDefinition {
  return {
    key: `user.${newId()}`, manufacturer: '', model: 'New Product', summary: '', category: 'other', tags: [],
    physical: { rackUnits: 1, halfWidth: false, widthMM: 482.6, heightMM: RACK_UNIT_MM, depthMM: 250, weightKG: 2, mounting: 'rack' },
    power: { acceptedVoltages: ['ac120V', 'ac230V'], typicalWatts: 20, maxWatts: 30, publishedBTU: null, efficiency: null, poweredByPoE: false },
    ports: [port('pwr.in', 'AC In', 'iecC13C14', 'male', 'input', ['ac120V', 'ac230V'], 'Power')],
    source: 'user', revision: 1,
  }
}

// MARK: Seed catalog

const hdmiIn = (id: string, label: string) => port(id, label, 'hdmi', 'female', 'input', ['hdmi20'], 'Video In')
const lan = (id = 'lan', label = 'LAN') => port(id, label, 'rj45', 'female', 'bidirectional', ['ethernet1G', 'ipControl'], 'Network')
const rs232 = () => port('rs232', 'RS-232', 'db9', 'female', 'bidirectional', ['rs232'], 'Control')
const acIn = (connector: ConnectorType = 'iecC13C14', signals: SignalType[] = ['ac120V', 'ac230V']) =>
  port('pwr.in', 'Power In', connector, 'male', 'input', signals, 'Power')

interface Seed {
  key: string; model: string; category: EquipmentCategory; summary: string; ru: number | null; depth: number; kg: number
  typical: number; max: number; efficiency?: number; mounting?: MountType; poe?: boolean; voltages?: SignalType[]; ports: PortTemplate[]
}

const seed = (s: Seed): ProductDefinition => ({
  key: s.key, manufacturer: 'Generic', model: s.model, summary: s.summary, category: s.category, tags: [],
  physical: { rackUnits: s.ru, halfWidth: false, widthMM: 482.6, heightMM: (s.ru ?? 1) * RACK_UNIT_MM, depthMM: s.depth, weightKG: s.kg, mounting: s.ru == null ? s.mounting ?? 'shelf' : 'rack' },
  power: { acceptedVoltages: s.poe ? [] : s.voltages ?? ['ac120V', 'ac230V'], typicalWatts: s.typical, maxWatts: s.max, publishedBTU: null, efficiency: s.efficiency ?? null, poweredByPoE: !!s.poe },
  ports: s.ports, source: 'builtIn', revision: 1,
})

/** Generic, brand-neutral starting points. */
export const GENERIC_PRODUCTS: ProductDefinition[] = [
  seed({ key: 'generic.projector.laser.4k', model: '4K Laser Projector', category: 'projector', summary: 'Laser projector with HDBaseT and 12G-SDI', ru: null, depth: 550, kg: 24, typical: 650, max: 780, mounting: 'ceiling',
    ports: [hdmiIn('in.hdmi.1', 'HDMI 1'), hdmiIn('in.hdmi.2', 'HDMI 2'), port('in.hdbt', 'HDBaseT In', 'rj45', 'female', 'input', ['hdbaseT'], 'Video In'),
      port('in.sdi', '12G-SDI In', 'bnc', 'female', 'input', ['sdi12G'], 'Video In'), lan(), rs232(), acIn()] }),
  seed({ key: 'generic.display.86', model: '86" 4K Display', category: 'display', summary: 'Commercial 4K display', ru: null, depth: 80, kg: 55, typical: 280, max: 420, mounting: 'wall',
    ports: [hdmiIn('in.hdmi.1', 'HDMI 1'), hdmiIn('in.hdmi.2', 'HDMI 2'), hdmiIn('in.hdmi.3', 'HDMI 3'), lan(), rs232(), acIn()] }),
  seed({ key: 'generic.matrix.8x8', model: '8×8 HDMI Matrix', category: 'matrixSwitcher', summary: '4K60 HDMI matrix switcher', ru: 2, depth: 300, kg: 6, typical: 60, max: 90,
    ports: [...series('in.hdmi', 'In {n}', 8, 'hdmi', 'female', 'input', ['hdmi20'], 'Inputs'), ...series('out.hdmi', 'Out {n}', 8, 'hdmi', 'female', 'output', ['hdmi20'], 'Outputs'), lan(), rs232(), acIn()] }),
  seed({ key: 'generic.hdbt.tx', model: 'HDBaseT Transmitter', category: 'extender', summary: 'HDMI over HDBaseT TX (PoH)', ru: null, depth: 100, kg: 0.4, typical: 6, max: 8, mounting: 'desk', poe: true,
    ports: [hdmiIn('in.hdmi', 'HDMI In'), port('out.hdbt', 'HDBaseT Out', 'rj45', 'female', 'output', ['hdbaseT'])] }),
  seed({ key: 'generic.sdi.router.12x12', model: '12×12 12G-SDI Router', category: 'videoSwitcher', summary: '12G-SDI router', ru: 1, depth: 250, kg: 3.5, typical: 40, max: 55,
    ports: [...series('in.sdi', 'SDI In {n}', 12, 'bnc', 'female', 'input', ['sdi12G'], 'Inputs'), ...series('out.sdi', 'SDI Out {n}', 12, 'bnc', 'female', 'output', ['sdi12G'], 'Outputs'), lan(), acIn()] }),
  seed({ key: 'generic.camera.ptz', model: 'PTZ Camera', category: 'camera', summary: '1080p PTZ with 3G-SDI/HDMI/NDI, PoE+', ru: null, depth: 180, kg: 1.6, typical: 15, max: 22, mounting: 'wall', poe: true,
    ports: [port('out.sdi', '3G-SDI Out', 'bnc', 'female', 'output', ['sdi3G'], 'Video Out'), port('out.hdmi', 'HDMI Out', 'hdmi', 'female', 'output', ['hdmi14'], 'Video Out'),
      port('lan', 'LAN (PoE+)', 'rj45', 'female', 'bidirectional', ['ethernet1G', 'ndi', 'ipControl'], 'Network')] }),
  seed({ key: 'generic.dsp.12x8', model: '12×8 Dante DSP', category: 'dsp', summary: 'Conferencing DSP with AEC and Dante', ru: 1, depth: 260, kg: 3, typical: 35, max: 50,
    ports: [...series('in.mic', 'Mic/Line In {n}', 12, 'euroblock', 'male', 'input', ['analogMic', 'analogLine'], 'Analog In'),
      ...series('out.line', 'Line Out {n}', 8, 'euroblock', 'male', 'output', ['analogLine'], 'Analog Out'),
      port('dante.pri', 'Dante Primary', 'rj45', 'female', 'bidirectional', ['dante', 'aes67', 'ethernet1G'], 'Network'),
      port('dante.sec', 'Dante Secondary', 'rj45', 'female', 'bidirectional', ['dante', 'aes67', 'ethernet1G'], 'Network'), lan('lan', 'Control LAN'), acIn()] }),
  seed({ key: 'generic.amp.4ch', model: '4-Channel Amplifier', category: 'amplifier', summary: '4×600 W @ 4Ω / 70V / 100V, Dante', ru: 2, depth: 400, kg: 11, typical: 300, max: 1200, efficiency: 0.8,
    ports: [...series('in.line', 'Input {n}', 4, 'euroblock', 'male', 'input', ['analogLine'], 'Inputs'),
      ...series('out.spk', 'Output {n}', 4, 'euroblock', 'male', 'output', ['speakerLowZ', 'speaker70V', 'speaker100V'], 'Speaker Out'),
      port('dante', 'Dante', 'rj45', 'female', 'bidirectional', ['dante', 'ethernet1G'], 'Network'), acIn('iecC19C20')] }),
  seed({ key: 'generic.speaker.ceiling70v', model: 'Ceiling Speaker 70V', category: 'loudspeaker', summary: '8" ceiling speaker, 70/100V taps', ru: null, depth: 250, kg: 3.2, typical: 0, max: 0, mounting: 'ceiling', voltages: [],
    ports: [port('in.spk', 'Speaker In', 'euroblock', 'male', 'input', ['speaker70V', 'speaker100V'], undefined, { maxConnections: 2 })] }),
  seed({ key: 'generic.mic.wireless.rx', model: 'Wireless Mic Receiver (2ch)', category: 'wirelessReceiver', summary: 'UHF dual receiver', ru: 1, depth: 280, kg: 3, typical: 15, max: 20,
    ports: [port('out.1', 'Ch 1 Out', 'xlr3', 'male', 'output', ['analogMic', 'analogLine'], 'Audio Out'), port('out.2', 'Ch 2 Out', 'xlr3', 'male', 'output', ['analogMic', 'analogLine'], 'Audio Out'),
      port('ant.a', 'Antenna A', 'bnc', 'female', 'input', ['rfUHF'], 'RF'), port('ant.b', 'Antenna B', 'bnc', 'female', 'input', ['rfUHF'], 'RF'), lan(), acIn()] }),
  seed({ key: 'generic.switch.24poe', model: '24-Port PoE+ Switch', category: 'networkSwitch', summary: 'AV-tuned managed switch, 370 W PoE budget', ru: 1, depth: 300, kg: 4.5, typical: 60, max: 450,
    ports: [...series('port', 'Port {n}', 24, 'rj45', 'female', 'bidirectional', ['ethernet1G', 'ethernet100M'], 'Access'),
      ...series('sfp', 'SFP+ {n}', 4, 'lcDuplex', 'female', 'bidirectional', ['ethernet10G'], 'Uplink'), acIn()] }),
  seed({ key: 'generic.control.processor', model: 'Control Processor', category: 'controlProcessor', summary: 'IP / serial / IR / relay controller', ru: 1, depth: 200, kg: 1.5, typical: 12, max: 18, voltages: ['dc12V'],
    ports: [lan(), ...series('com', 'COM {n}', 4, 'euroblock', 'male', 'bidirectional', ['rs232', 'rs485'], 'Serial'),
      ...series('ir', 'IR {n}', 4, 'euroblock', 'male', 'output', ['ir'], 'IR'), ...series('relay', 'Relay {n}', 4, 'euroblock', 'male', 'output', ['contactClosure'], 'Relay'),
      acIn('dcBarrel', ['dc12V'])] }),
  seed({ key: 'generic.pdu.8', model: '8-Outlet Rack PDU (120V 15A)', category: 'pdu', summary: 'Switched PDU, 8× NEMA 5-15R', ru: 1, depth: 180, kg: 2.5, typical: 5, max: 10, voltages: ['ac120V'],
    ports: [...series('out', 'Outlet {n}', 8, 'nema5_15', 'female', 'output', ['ac120V'], 'Outlets').map((x) => ({ ...x, powerCapacityWatts: 1440 })),
      port('in', 'Line In', 'nema5_15', 'male', 'input', ['ac120V'], 'Power')] }),
  seed({ key: 'generic.fixture.ledwash', model: 'LED Wash Fixture', category: 'lightingFixture', summary: 'RGBW wash, DMX/RDM', ru: null, depth: 220, kg: 7, typical: 180, max: 220, mounting: 'truss',
    ports: [port('dmx.in', 'DMX In', 'xlr5', 'male', 'input', ['dmx512'], 'DMX'), port('dmx.thru', 'DMX Thru', 'xlr5', 'female', 'output', ['dmx512'], 'DMX'), acIn('powerCONTrue1')] }),
  seed({ key: 'generic.dmx.node.4', model: '4-Universe sACN/Art-Net Node', category: 'dmxNode', summary: 'Ethernet-to-DMX gateway (PoE)', ru: 1, depth: 150, kg: 1.2, typical: 8, max: 12, poe: true,
    ports: [port('lan', 'Ethernet', 'etherCON', 'female', 'bidirectional', ['sacn', 'artNet', 'ethernet1G'], 'Network'),
      ...series('dmx', 'Universe {n}', 4, 'xlr5', 'female', 'output', ['dmx512'], 'DMX Out')] }),
]

// MARK: Building power sources (receptacles, panel feeds, generators)

const src = (key: string, model: string, summary: string, conn: ConnectorType, count: number, volts: number, amps: number,
  opts: { phases?: 1 | 3; label?: string; mounting?: MountType; signal?: SignalType } = {}): ProductDefinition => {
  const signal = opts.signal ?? (volts > 130 ? 'ac230V' : 'ac120V')
  const label = opts.label ?? 'Receptacle'
  const ports = count === 1
    ? [port('out.1', label, conn, 'female', 'output', [signal], 'Outlets', { powerCapacityWatts: volts * amps })]
    : series('out', `${label} {n}`, count, conn, 'female', 'output', [signal], 'Outlets').map((x) => ({ ...x, powerCapacityWatts: volts * amps }))
  return {
    ...seed({ key, model, category: 'powerSource', summary, ru: null, depth: 60, kg: 0.3, typical: 0, max: 0, mounting: opts.mounting ?? 'wall', voltages: [], ports }),
    tags: ['building power', 'receptacle', 'circuit', 'wall', 'house power', 'shore power'],
    supply: { volts, amps, phases: opts.phases ?? 1 },
  }
}

/** Where power comes from: wall/floor receptacles, panel feeds, generators. */
export const POWER_SOURCES: ProductDefinition[] = [
  src('generic.power.515.duplex', 'Duplex Receptacle NEMA 5-15R (15 A)', 'Wall outlet on a 15 A, 120 V branch circuit', 'nema5_15', 2, 120, 15),
  src('generic.power.520.duplex', 'Duplex Receptacle NEMA 5-20R (20 A)', 'Wall outlet on a 20 A, 120 V branch circuit', 'nema5_20', 2, 120, 20),
  src('generic.power.520.quad', 'Quad Receptacle NEMA 5-20R (20 A)', 'Four outlets on one 20 A, 120 V circuit', 'nema5_20', 4, 120, 20),
  src('generic.power.520.floor', 'Floor Box NEMA 5-20R (20 A)', 'Floor box outlets on a 20 A, 120 V circuit', 'nema5_20', 2, 120, 20, { mounting: 'floor' }),
  src('generic.power.l520', 'Twist-Lock Receptacle NEMA L5-20R (20 A)', 'Locking 20 A, 120 V receptacle', 'nemaL5_20', 1, 120, 20),
  src('generic.power.l530', 'Twist-Lock Receptacle NEMA L5-30R (30 A)', 'Locking 30 A, 120 V receptacle', 'nemaL5_30', 1, 120, 30),
  src('generic.power.l620', 'Twist-Lock Receptacle NEMA L6-20R (20 A, 208/240 V)', 'Locking 20 A, 208/240 V receptacle', 'nemaL6_20', 1, 208, 20),
  src('generic.power.l630', 'Twist-Lock Receptacle NEMA L6-30R (30 A, 208/240 V)', 'Locking 30 A, 208/240 V receptacle', 'nemaL6_30', 1, 208, 30),
  src('generic.power.l1430', 'Twist-Lock Receptacle NEMA L14-30R (30 A, 120/240 V)', 'Locking 30 A split-phase receptacle', 'nemaL14_30', 1, 240, 30, { signal: 'ac120V' }),
  src('generic.power.l2130', 'Twist-Lock Receptacle NEMA L21-30R (30 A, 3-phase)', 'Locking 30 A, 120/208 V three-phase receptacle', 'nemaL21_30', 1, 208, 30, { phases: 3, signal: 'ac120V' }),
  src('generic.power.camlok.200', 'Company Switch 200 A (Cam-Lok)', '200 A, 120/208 V three-phase show power tie-in', 'camlok', 1, 208, 200, { phases: 3, label: 'Cam-Lok Feed', signal: 'ac120V' }),
  src('generic.power.camlok.400', 'Company Switch 400 A (Cam-Lok)', '400 A, 120/208 V three-phase show power tie-in', 'camlok', 1, 208, 400, { phases: 3, label: 'Cam-Lok Feed', signal: 'ac120V' }),
  src('generic.power.generator.100', 'Generator 100 A (Cam-Lok)', 'Mobile generator, 120/208 V three-phase', 'camlok', 1, 208, 100, { phases: 3, label: 'Cam-Lok Out', mounting: 'floor', signal: 'ac120V' }),
  src('generic.power.schuko', 'Schuko Wall Socket (16 A, 230 V)', 'Wall socket on a 16 A, 230 V circuit', 'schuko', 2, 230, 16),
  // Show power distribution (fed from a company switch or generator)
  { ...seed({ key: 'generic.distro.camlok.l2130', model: 'Power Distro: Cam-Lok In → 6× L21-30R', category: 'pdu', summary: '200 A distro with Cam-Lok in/thru and six L21-30 outputs',
    ru: null, depth: 600, kg: 45, typical: 5, max: 10, mounting: 'floor', voltages: ['ac120V'],
    ports: [port('in.camlok', 'Cam-Lok In', 'camlok', 'male', 'input', ['ac120V'], 'Power'),
      port('thru.camlok', 'Cam-Lok Thru', 'camlok', 'female', 'output', ['ac120V'], 'Outlets', { powerCapacityWatts: 72000 }),
      ...series('out', 'L21-30 {n}', 6, 'nemaL21_30', 'female', 'output', ['ac120V'], 'Outlets').map((x) => ({ ...x, powerCapacityWatts: 10800 }))] }), tags: ['distro', 'show power'] },
  { ...seed({ key: 'generic.distro.l2130.520', model: 'Power Distro: L21-30P In → 6× 5-20R', category: 'pdu', summary: 'Stage/rack drop: L21-30 input to six 20 A circuits',
    ru: 2, depth: 300, kg: 9, typical: 5, max: 10, voltages: ['ac120V'],
    ports: [port('in.l2130', 'L21-30 In', 'nemaL21_30', 'male', 'input', ['ac120V'], 'Power'),
      ...series('out', 'Circuit {n}', 6, 'nema5_20', 'female', 'output', ['ac120V'], 'Outlets').map((x) => ({ ...x, powerCapacityWatts: 2400 }))] }), tags: ['distro', 'show power'] },
  { ...seed({ key: 'generic.pdu.l530.8', model: '8-Outlet Rack PDU (L5-30P, 30 A)', category: 'pdu', summary: '30 A rack PDU with L5-30P plug, 8× 5-20R', ru: 1, depth: 200, kg: 3, typical: 5, max: 10, voltages: ['ac120V'],
    ports: [...series('out', 'Outlet {n}', 8, 'nema5_20', 'female', 'output', ['ac120V'], 'Outlets').map((x) => ({ ...x, powerCapacityWatts: 2400 })),
      port('in', 'Line In', 'nemaL5_30', 'male', 'input', ['ac120V'], 'Power')] }), tags: ['pdu'] },
  src('generic.power.c19', 'Hardwired Feed to C19 (20 A)', 'Dedicated 20 A circuit terminated in a C19 inlet cord', 'iecC19C20', 1, 120, 20),
]

/** Everything shipped with the app: generic gear plus the manufacturer catalog. */
export const BUILT_IN_PRODUCTS: ProductDefinition[] = [...GENERIC_PRODUCTS, ...POWER_SOURCES, ...PLATE_PRODUCTS, ...CATALOG_PRODUCTS]

// MARK: Library (built-in + user) and search

export interface ProductQuery { text?: string; category?: EquipmentCategory | null; domain?: SignalDomain | null; rackOnly?: boolean }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Merges built-ins with user inventory (user keys shadow built-ins) and
 *  provides token-AND search with simple relevance. Fine to ~10k products. */
export class ProductLibrary {
  readonly products: ProductDefinition[]
  private readonly haystack: string[]
  private readonly byKey: Map<string, ProductDefinition>

  constructor(builtIn: ProductDefinition[], user: ProductDefinition[]) {
    const byKey = new Map<string, ProductDefinition>()
    for (const p of [...builtIn, ...user]) byKey.set(p.key, p)
    this.byKey = byKey
    this.products = [...byKey.values()].sort((a, b) => productName(a).localeCompare(productName(b)))
    this.haystack = this.products.map((p) => fold([p.manufacturer, p.model, p.summary, CATEGORIES[p.category].name, ...p.tags].join(' ')))
  }

  get(key: string) { return this.byKey.get(key) }

  /** Product count per manufacturer (case-insensitive name). */
  countsByMaker(): Map<string, number> {
    const m = new Map<string, number>()
    for (const p of this.products) { const k = p.manufacturer.toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }

  search(q: ProductQuery): ProductDefinition[] {
    const tokens = fold(q.text ?? '').split(/\s+/).filter(Boolean)
    const hits: [number, ProductDefinition][] = []
    this.products.forEach((p, i) => {
      if (q.category && p.category !== q.category) return
      if (q.domain && !productDomains(p).has(q.domain)) return
      if (q.rackOnly && p.physical.rackUnits == null) return
      if (!tokens.every((t) => this.haystack[i].includes(t))) return
      const model = fold(p.model), mfr = fold(p.manufacturer)
      hits.push([tokens.reduce((a, t) => a + (model.startsWith(t) ? 3 : mfr.startsWith(t) ? 2 : 1), 0), p])
    })
    return hits.sort((a, b) => b[0] - a[0]).map(([, p]) => p)
  }
}

/** Checks behind the product builder's Save button. */
export function productProblems(p: ProductDefinition): string[] {
  const out: string[] = []
  if (!p.manufacturer.trim()) out.push('Choose a manufacturer (or add a new one).')
  if (!p.model.trim()) out.push('Model name is required.')
  if (p.physical.rackUnits != null && (p.physical.rackUnits < 1 || p.physical.rackUnits > 20)) out.push('Rack units must be between 1 and 20.')
  if (p.physical.weightKG < 0) out.push('Weight cannot be negative.')
  if (p.physical.depthMM <= 0) out.push('Depth must be positive.')
  if (p.power.maxWatts < p.power.typicalWatts) out.push('Max power must be ≥ typical power.')
  const ids = p.ports.map((x) => x.id)
  if (new Set(ids).size !== ids.length) out.push('Port identifiers must be unique.')
  if (p.ports.some((x) => !x.label.trim())) out.push('Every port needs a label.')
  for (const x of p.ports) {
    if (x.signals.length === 0) out.push(`Port “${x.label}” has no signal type.`)
    const ds = new Set(x.signals.map((s) => SIGNALS[s].domain))
    if (ds.size > 1 && ds.has('power')) out.push(`Port “${x.label}” mixes power and signal types.`)
  }
  return out
}

/** Keys of products shipped with the app (a user product with one of these keys is an edited override). */
export const BUILT_IN_KEYS: ReadonlySet<string> = new Set(BUILT_IN_PRODUCTS.map((p) => p.key))

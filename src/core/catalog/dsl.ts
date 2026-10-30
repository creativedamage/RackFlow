// Compact language for writing hundreds of catalog products.
//
//   P('Blackmagic Design', 'ATEM Mini Pro', 'videoSwitcher', '4-input HDMI live switcher with streaming',
//     '4 hdmiIn, hdmiOut, 2 mic35In, usbc, lan, dc12', { mount: 'desk', w: 18 })
//
// I/O string: comma-separated tokens "[count] code[:Label]". Ports are named
// "<Label> <n>" when count > 1. Power tokens (iec, iec2, c20, true1In, powercon,
// dc12, dc24, nema) add the inlet; "poe" marks PoE-powered; "nopower" = passive.
// If no power token is given, an IEC C14 inlet is added for powered categories.

import { RACK_UNIT_MM } from '../project'
import type { EquipmentCategory, MountType, PortDirection, PortTemplate, ProductDefinition } from '../model'
import type { ConnectorType, Gender, SignalType } from '../signals'

type PortDef = [label: string, connector: ConnectorType, gender: Gender, dir: PortDirection, signals: SignalType[], group: string]

const V = (s: string) => s.split(' ') as SignalType[]
const HDMI = V('hdmi20'), HDMI21 = V('hdmi21'), HDMI14 = V('hdmi14')
const SDI12 = V('sdi12G'), SDI3 = V('sdi3G'), SDI6 = V('sdi6G')
const ETH = V('ethernet1G ipControl')
const DANTE = V('dante aes67 ethernet1G')
const MICLINE = V('analogMic analogLine'), LINE = V('analogLine')
const SPK = V('speakerLowZ'), SPK_ALL = V('speakerLowZ speaker70V speaker100V')
const AC = V('ac120V ac230V')

export const PORTS: Record<string, PortDef> = {
  // Video
  hdmiIn: ['HDMI In', 'hdmi', 'female', 'input', HDMI, 'Video In'],
  hdmiOut: ['HDMI Out', 'hdmi', 'female', 'output', HDMI, 'Video Out'],
  hdmi21In: ['HDMI 2.1 In', 'hdmi', 'female', 'input', HDMI21, 'Video In'],
  hdmi21Out: ['HDMI 2.1 Out', 'hdmi', 'female', 'output', HDMI21, 'Video Out'],
  hdmi14In: ['HDMI In', 'hdmi', 'female', 'input', HDMI14, 'Video In'],
  hdmi14Out: ['HDMI Out', 'hdmi', 'female', 'output', HDMI14, 'Video Out'],
  sdiIn: ['12G-SDI In', 'bnc', 'female', 'input', SDI12, 'Video In'],
  sdiOut: ['12G-SDI Out', 'bnc', 'female', 'output', SDI12, 'Video Out'],
  sdi6In: ['6G-SDI In', 'bnc', 'female', 'input', SDI6, 'Video In'],
  sdi6Out: ['6G-SDI Out', 'bnc', 'female', 'output', SDI6, 'Video Out'],
  sdi3In: ['3G-SDI In', 'bnc', 'female', 'input', SDI3, 'Video In'],
  sdi3Out: ['3G-SDI Out', 'bnc', 'female', 'output', SDI3, 'Video Out'],
  refIn: ['Ref In', 'bnc', 'female', 'input', V('analogComposite'), 'Sync'],
  dpIn: ['DisplayPort In', 'displayPort', 'female', 'input', V('displayPort14'), 'Video In'],
  dpOut: ['DisplayPort Out', 'displayPort', 'female', 'output', V('displayPort14'), 'Video Out'],
  dviIn: ['DVI In', 'dvi', 'female', 'input', V('dviD'), 'Video In'],
  dviOut: ['DVI Out', 'dvi', 'female', 'output', V('dviD'), 'Video Out'],
  vgaIn: ['VGA In', 'hd15', 'female', 'input', V('analogComposite'), 'Video In'],
  hdbtIn: ['HDBaseT In', 'rj45', 'female', 'input', V('hdbaseT'), 'Video In'],
  hdbtOut: ['HDBaseT Out', 'rj45', 'female', 'output', V('hdbaseT'), 'Video Out'],
  // Network / IP
  lan: ['LAN', 'rj45', 'female', 'bidirectional', ETH, 'Network'],
  lanPoe: ['Port', 'rj45', 'female', 'bidirectional', V('ethernet1G ethernet100M'), 'Network'],
  sfp: ['SFP+', 'lcDuplex', 'female', 'bidirectional', V('ethernet10G st2110'), 'Network'],
  st2110: ['ST 2110', 'lcDuplex', 'female', 'bidirectional', V('st2110 ethernet10G'), 'Network'],
  dante: ['Dante', 'rj45', 'female', 'bidirectional', DANTE, 'Network'],
  danteSec: ['Dante Secondary', 'rj45', 'female', 'bidirectional', DANTE, 'Network'],
  avb: ['AVB/Milan', 'etherCON', 'female', 'bidirectional', V('avbMilan ethernet1G'), 'Network'],
  ndi: ['LAN (NDI)', 'rj45', 'female', 'bidirectional', V('ndi ethernet1G ipControl'), 'Network'],
  ethercon: ['Ethernet', 'etherCON', 'female', 'bidirectional', V('sacn artNet ethernet1G'), 'Network'],
  ethLan: ['Ethernet', 'rj45', 'female', 'bidirectional', V('sacn artNet ethernet1G'), 'Network'],
  fiber: ['Fiber', 'opticalCON', 'female', 'bidirectional', V('ethernet10G'), 'Network'],
  aes67: ['AES67', 'rj45', 'female', 'bidirectional', V('aes67 ethernet1G'), 'Network'],
  // USB
  usbc: ['USB-C', 'usbC', 'female', 'bidirectional', V('usb3'), 'USB'],
  usbB: ['USB-B', 'usbB', 'female', 'bidirectional', V('usb2'), 'USB'],
  usbA: ['USB-A', 'usbA', 'female', 'bidirectional', V('usb2'), 'USB'],
  // Analog / digital audio
  xlrIn: ['Mic/Line In', 'xlr3', 'female', 'input', MICLINE, 'Audio In'],
  xlrLineIn: ['Line In', 'xlr3', 'female', 'input', LINE, 'Audio In'],
  xlrOut: ['Line Out', 'xlr3', 'male', 'output', LINE, 'Audio Out'],
  xlrMicOut: ['Mic Out', 'xlr3', 'male', 'output', V('analogMic'), 'Audio Out'],
  xlrMicLineOut: ['Audio Out', 'xlr3', 'male', 'output', MICLINE, 'Audio Out'],
  xlrLink: ['Link Out', 'xlr3', 'male', 'output', LINE, 'Audio Out'],
  trsIn: ['Line In', 'trs6_35', 'female', 'input', LINE, 'Audio In'],
  trsOut: ['Line Out', 'trs6_35', 'female', 'output', LINE, 'Audio Out'],
  comboIn: ['Mic/Line In', 'xlr3', 'female', 'input', MICLINE, 'Audio In'],
  rcaIn: ['RCA In', 'rca', 'female', 'input', LINE, 'Audio In'],
  rcaOut: ['RCA Out', 'rca', 'female', 'output', LINE, 'Audio Out'],
  mic35In: ['3.5mm Mic In', 'trs3_5', 'female', 'input', MICLINE, 'Audio In'],
  out35: ['3.5mm Out', 'trs3_5', 'female', 'output', LINE, 'Audio Out'],
  hpOut: ['Headphones', 'trs6_35', 'female', 'output', LINE, 'Monitor'],
  euroIn: ['Mic/Line In', 'euroblock', 'male', 'input', MICLINE, 'Audio In'],
  euroLineIn: ['Line In', 'euroblock', 'male', 'input', LINE, 'Audio In'],
  euroOut: ['Line Out', 'euroblock', 'male', 'output', LINE, 'Audio Out'],
  aesIn: ['AES In', 'xlr3', 'female', 'input', V('aes3'), 'Digital Audio'],
  aesOut: ['AES Out', 'xlr3', 'male', 'output', V('aes3'), 'Digital Audio'],
  madiIn: ['MADI In', 'bnc', 'female', 'input', V('madi'), 'Digital Audio'],
  madiOut: ['MADI Out', 'bnc', 'female', 'output', V('madi'), 'Digital Audio'],
  madiOptIn: ['MADI Optical In', 'scDuplex', 'female', 'input', V('madi'), 'Digital Audio'],
  madiOptOut: ['MADI Optical Out', 'scDuplex', 'female', 'output', V('madi'), 'Digital Audio'],
  partyline: ['Party Line', 'xlr3', 'female', 'bidirectional', LINE, 'Intercom'],
  headset: ['Headset', 'xlr5', 'female', 'bidirectional', V('analogMic analogLine'), 'Intercom'],
  // Speaker level
  spkOut: ['Speaker Out', 'speakonNL4', 'female', 'output', SPK, 'Speaker Out'],
  spkEuroOut: ['Speaker Out', 'euroblock', 'male', 'output', SPK_ALL, 'Speaker Out'],
  spkIn: ['Speaker In', 'speakonNL4', 'female', 'input', SPK, 'Speaker'],
  spkLink: ['Speaker Link', 'speakonNL4', 'female', 'output', SPK, 'Speaker'],
  spk70In: ['70/100V In', 'euroblock', 'male', 'input', V('speaker70V speaker100V speakerLowZ'), 'Speaker'],
  spkEuroIn: ['Speaker In', 'euroblock', 'male', 'input', SPK, 'Speaker'],
  // RF
  ant: ['Antenna', 'bnc', 'female', 'input', V('rfUHF'), 'RF'],
  antOut: ['Antenna Out', 'bnc', 'female', 'output', V('rfUHF'), 'RF'],
  // Lighting
  dmxIn: ['DMX In', 'xlr5', 'male', 'input', V('dmx512'), 'DMX'],
  dmxThru: ['DMX Thru', 'xlr5', 'female', 'output', V('dmx512'), 'DMX'],
  dmxOut: ['DMX Out', 'xlr5', 'female', 'output', V('dmx512'), 'DMX'],
  // Control
  rs232: ['RS-232', 'db9', 'female', 'bidirectional', V('rs232'), 'Control'],
  rs232e: ['RS-232', 'euroblock', 'male', 'bidirectional', V('rs232'), 'Control'],
  rs485: ['RS-485', 'euroblock', 'male', 'bidirectional', V('rs485'), 'Control'],
  ir: ['IR Out', 'euroblock', 'male', 'output', V('ir'), 'Control'],
  gpio: ['GPIO', 'euroblock', 'male', 'bidirectional', V('gpio'), 'Control'],
  gpi: ['GPI/Tally', 'db25', 'female', 'bidirectional', V('gpio'), 'Control'],
  relay: ['Relay', 'euroblock', 'male', 'output', V('contactClosure'), 'Control'],
  // Power
  iec: ['Power In', 'iecC13C14', 'male', 'input', AC, 'Power'],
  c20: ['Power In', 'iecC19C20', 'male', 'input', AC, 'Power'],
  true1In: ['Power In', 'powerCONTrue1', 'male', 'input', AC, 'Power'],
  true1Out: ['Power Thru', 'powerCONTrue1', 'female', 'output', AC, 'Power'],
  powercon: ['Power In', 'powerCON', 'male', 'input', AC, 'Power'],
  dc12: ['DC 12V In', 'dcBarrel', 'female', 'input', V('dc12V'), 'Power'],
  dc24: ['DC 24V In', 'dcBarrel', 'female', 'input', V('dc24V'), 'Power'],
  dc48: ['DC 48V In', 'dcBarrel', 'female', 'input', V('dc48V'), 'Power'],
  nema: ['Line In', 'nema5_15', 'male', 'input', V('ac120V'), 'Power'],
  nemaOut: ['Outlet', 'nema5_15', 'female', 'output', V('ac120V'), 'Outlets'],
  c13Out: ['Outlet', 'iecC13C14', 'female', 'output', AC, 'Outlets'],
}

const POWER_TOKENS = new Set(['iec', 'iec2', 'c20', 'true1In', 'powercon', 'dc12', 'dc24', 'dc48', 'nema', 'poe', 'nopower'])

/** Categories that need no mains inlet unless one is given. */
const PASSIVE: EquipmentCategory[] = ['loudspeaker', 'microphone', 'patchBay', 'rackAccessory']

export interface Spec {
  ru?: number | null
  half?: boolean
  mount?: MountType
  d?: number
  kg?: number
  /** Typical watts. */
  w?: number
  /** Max watts (defaults to 1.3 × typical). */
  max?: number
  eff?: number
  btu?: number
  tags?: string
}

const DEFAULT_W: Partial<Record<EquipmentCategory, number>> = {
  projector: 600, display: 250, ledProcessor: 80, videoSwitcher: 80, matrixSwitcher: 70, scaler: 30, extender: 8, encoder: 15, decoder: 15,
  camera: 25, mediaPlayer: 60, dsp: 40, mixer: 120, amplifier: 300, loudspeaker: 0, microphone: 0, wirelessReceiver: 20, audioInterface: 30,
  networkSwitch: 60, controlProcessor: 15, touchPanel: 12, lightingConsole: 250, lightingFixture: 400, dimmer: 50, dmxNode: 10,
  intercom: 30, conferencing: 30, recorder: 40, converter: 10, patchBay: 0, pdu: 5, ups: 60, computer: 200, rackAccessory: 0, other: 30,
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const CATALOG_NOTE = 'RackFlow catalog entry: model and I/O from the manufacturer’s published range; weight, depth and power are approximate. Check the current spec sheet before ordering or load calculations.'

export function parseIO(io: string): { ports: PortTemplate[]; poe: boolean; passive: boolean; hasPower: boolean } {
  const ports: PortTemplate[] = []
  const used = new Map<string, number>()
  let poe = false, passive = false, hasPower = false
  for (const raw of io.split(',').map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\d+)\s+(\w+)(?::(.+))?$|^(\w+)(?::(.+))?$/.exec(raw)
    if (!m) throw new Error(`Bad port token "${raw}"`)
    const count = m[1] ? +m[1] : 1
    const code = (m[2] ?? m[4])!
    const custom = m[3] ?? m[5]
    if (code === 'poe') { poe = true; hasPower = true; continue }
    if (code === 'nopower') { passive = true; hasPower = true; continue }
    if (POWER_TOKENS.has(code)) hasPower = true
    if (code === 'iec2') {
      for (const ab of ['A', 'B']) ports.push(mk(PORTS.iec, `pwr.in.${ab.toLowerCase()}`, `Power In ${ab}`))
      continue
    }
    const def = PORTS[code]
    if (!def) throw new Error(`Unknown port code "${code}" in "${raw}"`)
    const base = custom ?? def[0]
    for (let i = 1; i <= count; i++) {
      const n = (used.get(code) ?? 0) + 1
      used.set(code, n)
      const id = `${code}.${n}`
      ports.push(mk(def, id, count > 1 ? `${base} ${i}` : base))
    }
  }
  return { ports, poe, passive, hasPower }
}

function mk(def: PortDef, id: string, label: string): PortTemplate {
  return { id, label, connector: def[1], gender: def[2], direction: def[3], signals: [...def[4]], group: def[5], face: 'rear', maxConnections: def[1] === 'euroblock' && def[4].includes('speaker70V') && def[3] === 'input' ? 2 : 1 }
}

/** Define one catalog product. */
export function P(maker: string, model: string, category: EquipmentCategory, summary: string, io: string, spec: Spec = {}): ProductDefinition {
  const parsed = parseIO(io)
  const ports = parsed.ports
  const passive = parsed.passive || (!parsed.hasPower && PASSIVE.includes(category))
  if (!parsed.hasPower && !PASSIVE.includes(category)) ports.push(mk(PORTS.iec, 'iec.1', 'Power In'))
  const ru = spec.ru === undefined ? null : spec.ru
  const w = passive ? 0 : spec.w ?? (parsed.poe ? 12 : DEFAULT_W[category] ?? 30)
  const dcOnly = ports.some((p) => p.group === 'Power' && p.connector === 'dcBarrel') && !ports.some((p) => p.group === 'Power' && p.connector !== 'dcBarrel')
  return {
    key: `cat.${slug(maker)}.${slug(model)}`,
    manufacturer: maker,
    model,
    summary,
    category,
    tags: spec.tags ? spec.tags.split(',').map((t) => t.trim()) : [],
    physical: {
      rackUnits: ru,
      halfWidth: !!spec.half,
      widthMM: ru ? (spec.half ? 215 : 482.6) : 300,
      heightMM: ru ? ru * RACK_UNIT_MM : 100,
      depthMM: spec.d ?? (ru ? 250 + ru * 40 : 150),
      weightKG: spec.kg ?? (ru ? Math.round((2 + ru * 3) * 10) / 10 : 2),
      mounting: ru ? 'rack' : spec.mount ?? 'shelf',
    },
    power: {
      acceptedVoltages: passive || parsed.poe ? [] : dcOnly ? ports.filter((p) => p.connector === 'dcBarrel').flatMap((p) => p.signals) : ['ac120V', 'ac230V'],
      typicalWatts: w,
      maxWatts: spec.max ?? Math.round(w * 1.3),
      publishedBTU: spec.btu ?? null,
      efficiency: spec.eff ?? (category === 'amplifier' ? 0.75 : null),
      poweredByPoE: parsed.poe,
    },
    ports,
    source: 'builtIn',
    revision: 1,
    verified: false,
    dataNote: CATALOG_NOTE,
  }
}

/** Shorthand helpers for common families. */
export const passiveSpeaker = (maker: string, model: string, summary: string, spec: Spec = {}, io = 'spkIn, spkLink') =>
  P(maker, model, 'loudspeaker', summary, `${io}, nopower`, { mount: 'truss', ...spec })
export const poweredSpeaker = (maker: string, model: string, summary: string, spec: Spec = {}, io = 'xlrIn:Input, xlrLink, powercon') =>
  P(maker, model, 'loudspeaker', summary, io, { mount: 'truss', w: 150, ...spec })
export const installSpeaker = (maker: string, model: string, summary: string, spec: Spec = {}) =>
  P(maker, model, 'loudspeaker', summary, 'spk70In, nopower', { mount: 'ceiling', ...spec })
export const mic = (maker: string, model: string, summary: string, spec: Spec = {}, io = 'xlrMicOut') =>
  P(maker, model, 'microphone', summary, `${io}, nopower`, { mount: 'desk', kg: 0.3, ...spec })
export const fixture = (maker: string, model: string, summary: string, w: number, spec: Spec = {}, io = 'dmxIn, dmxThru, ethercon, true1In, true1Out') =>
  P(maker, model, 'lightingFixture', summary, io, { mount: 'truss', w, ...spec })

import type { PortTemplate } from './model'
import { CONNECTORS, connectorIsPower, connectorName, connectorsMate, mateGender, type ConnectorType, type Gender, type SignalType } from './signals'

export interface CableEnd { connector: ConnectorType; gender: Gender }

/** A cable type (catalog item). */
export interface CableSpec {
  key: string
  name: string
  endA: CableEnd
  endB: CableEnd
  /** Empty = passive conductor rated for anything its connectors carry. */
  ratedSignals: SignalType[]
  maxLengthMeters: number | null
  labelPrefix: string
  /** Not a separate cable: the device's attached plug goes straight into the outlet. */
  direct?: boolean
  /** What the crew pulls – the bulk cable ("Cat6A", "12-Channel Snake"). Defaults to the name. */
  pull?: string
  /** Multi-channel (snake): connections between the same two devices share one cable, this many per snake. */
  channels?: number
}

/** The bulk-cable name used on pull schedules. */
export const pullName = (s: CableSpec | undefined) => (s ? s.pull ?? s.name : 'TBD')

/** Plugs that are accepted by a receptacle of another type (NEMA T-slot receptacles). */
const PLUG_ACCEPTS: Partial<Record<ConnectorType, ConnectorType[]>> = {
  nema5_20: ['nema5_15'], // a 5-20R receptacle takes 5-15P and 5-20P plugs
}

export function endMates(end: CableEnd, port: PortTemplate): boolean {
  if (mateGender(end.gender) !== port.gender) return false
  if (connectorsMate(end.connector, port.connector)) return true
  return end.gender === 'male' && port.gender === 'female' && (PLUG_ACCEPTS[port.connector]?.includes(end.connector) ?? false)
}

/** A plug on one port goes straight into a receptacle on the other (power only). */
export function plugsInto(a: PortTemplate, b: PortTemplate): boolean {
  if (!connectorIsPower(a.connector) || !connectorIsPower(b.connector)) return false
  const [plug, rec] = a.gender === 'male' && b.gender === 'female' ? [a, b] : b.gender === 'male' && a.gender === 'female' ? [b, a] : [null, null]
  if (!plug || !rec) return false
  return connectorsMate(plug.connector, rec.connector) || (PLUG_ACCEPTS[rec.connector]?.includes(plug.connector) ?? false)
}

export function orientation(spec: CableSpec, from: PortTemplate, to: PortTemplate): 'aToB' | 'bToA' | null {
  if (spec.direct) return plugsInto(from, to) ? 'aToB' : null
  if (endMates(spec.endA, from) && endMates(spec.endB, to)) return 'aToB'
  if (endMates(spec.endB, from) && endMates(spec.endA, to)) return 'bToA'
  return null
}

export const carries = (spec: CableSpec, signal: SignalType) =>
  spec.ratedSignals.length === 0 || spec.ratedSignals.includes(signal)

const e = (connector: ConnectorType, gender: Gender): CableEnd => ({ connector, gender })
const cable = (key: string, name: string, endA: CableEnd, endB: CableEnd, ratedSignals: SignalType[],
  maxLengthMeters: number | null, labelPrefix: string): CableSpec => ({ key, name, endA, endB, ratedSignals, maxLengthMeters, labelPrefix })

/** Standard cable types. Lengths are conservative passive-copper rules of thumb
 *  and surface as warnings (except Ethernet's 100 m, which is a standard). */
export const DIRECT_PLUG: CableSpec = {
  key: 'direct', name: 'Plugged in directly (attached cord)', endA: e('nema5_15', 'male'), endB: e('nema5_15', 'female'),
  ratedSignals: [], maxLengthMeters: null, labelPrefix: 'P', direct: true,
}

/** A snake: N channels share one cable (fan-outs at both ends). */
const snake = (c: CableSpec, n: number): CableSpec => ({ ...c, channels: n, pull: `${n}-Channel Snake` })

const CAT5E: SignalType[] = ['ethernet100M', 'ethernet1G', 'dante', 'aes67', 'ndi', 'sacn', 'artNet', 'ipControl', 'hdbaseT', 'avbMilan']

export const CABLE_CATALOG: CableSpec[] = [
  DIRECT_PLUG,
  cable('hdmi.uhs', 'HDMI Ultra High Speed', e('hdmi', 'male'), e('hdmi', 'male'), ['hdmi14', 'hdmi20', 'hdmi21', 'dviD'], 5, 'V'),
  cable('hdmi.premium', 'HDMI Premium High Speed', e('hdmi', 'male'), e('hdmi', 'male'), ['hdmi14', 'hdmi20', 'dviD'], 10, 'V'),
  cable('dp.14', 'DisplayPort 1.4', e('displayPort', 'male'), e('displayPort', 'male'), ['displayPort12', 'displayPort14'], 3, 'V'),
  cable('sdi.12g', '12G-SDI Coax (RG6)', e('bnc', 'male'), e('bnc', 'male'), ['sdiHD', 'sdi3G', 'sdi6G', 'sdi12G'], 70, 'V'),
  cable('sdi.3g', '3G-SDI Coax (RG59)', e('bnc', 'male'), e('bnc', 'male'), ['sdiHD', 'sdi3G', 'analogComposite'], 100, 'V'),
  cable('ref.coax', 'Reference Coax (RG59, 75Ω)', e('bnc', 'male'), e('bnc', 'male'), ['refSync', 'analogComposite'], 300, 'V'),
  cable('cat6a', 'Cat6A Shielded (U/FTP) – patch', e('rj45', 'male'), e('rj45', 'male'), [], 100, 'N'),
  cable('cat5e', 'Cat5e – patch', e('rj45', 'male'), e('rj45', 'male'), CAT5E, 100, 'N'),
  cable('cat6', 'Cat6 – patch', e('rj45', 'male'), e('rj45', 'male'), [], 100, 'N'),
  cable('cat6.stp', 'Cat6 Shielded (F/UTP) – patch', e('rj45', 'male'), e('rj45', 'male'), [], 100, 'N'),
  cable('cat6a.utp', 'Cat6A – patch', e('rj45', 'male'), e('rj45', 'male'), [], 100, 'N'),
  cable('cat8', 'Cat8 – patch', e('rj45', 'male'), e('rj45', 'male'), [], 30, 'N'),
  // Audio tie lines: single pair or multi-pair snake, punched down at both ends.
  cable('audio.pair', 'Audio Cable, 1-pair shielded – punch-down', e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), ['analogMic', 'analogLine', 'aes3'], 300, 'A'),
  ...[4, 8, 12, 16, 24, 32, 48].map((n) => snake(cable(`snake.${n}.h`, `${n}-Channel Snake (multi-pair) – punch-down`, e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), ['analogMic', 'analogLine', 'aes3'], 300, 'A'), n)),
  // DB25 (TASCAM analog, 8 channels) snakes and fan-outs – patch-bay and console rear panels.
  snake(cable('db25.db25', 'DB25 Snake, 8-ch (TASCAM) – DB25 to DB25', e('db25', 'male'), e('db25', 'male'), ['analogMic', 'analogLine', 'aes3'], 100, 'A'), 8),
  snake(cable('db25.xlrm', 'DB25 Fan-out, 8-ch (TASCAM) – DB25 to XLR Male', e('db25', 'male'), e('xlr3', 'male'), ['analogMic', 'analogLine', 'aes3'], 100, 'A'), 8),
  snake(cable('db25.xlrf', 'DB25 Fan-out, 8-ch (TASCAM) – DB25 to XLR Female', e('db25', 'male'), e('xlr3', 'female'), ['analogMic', 'analogLine', 'aes3'], 100, 'A'), 8),
  snake(cable('db25.trs', 'DB25 Fan-out, 8-ch (TASCAM) – DB25 to 1/4" TRS', e('db25', 'male'), e('trs6_35', 'male'), ['analogMic', 'analogLine'], 100, 'A'), 8),
  snake(cable('db25.punch', 'DB25 Snake, 8-ch (TASCAM) – DB25 to punch-down', e('db25', 'male'), e('idcPunchdown', 'male'), ['analogMic', 'analogLine', 'aes3'], 300, 'A'), 8),
  cable('dmx.punch', 'DMX Cable (120Ω) – XLR-5 Male to punch-down', e('xlr5', 'male'), e('idcPunchdown', 'male'), ['dmx512'], 300, 'L'),
  cable('cat5e.h', 'Cat5e – punch-down both ends', e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), CAT5E, 90, 'N'),
  cable('cat6.h', 'Cat6 – punch-down both ends', e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), [], 90, 'N'),
  cable('cat6a.h', 'Cat6A – punch-down both ends', e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), [], 90, 'N'),
  cable('cat6a.h.stp', 'Cat6A Shielded – punch-down both ends', e('idcPunchdown', 'male'), e('idcPunchdown', 'male'), [], 90, 'N'),
  cable('cat6.plug', 'Cat6 – punch-down to RJ45', e('idcPunchdown', 'male'), e('rj45', 'male'), [], 90, 'N'),
  cable('cat6a.plug', 'Cat6A – punch-down to RJ45', e('idcPunchdown', 'male'), e('rj45', 'male'), [], 90, 'N'),
  cable('cat6a.ethercon', 'Cat6A – etherCON', e('etherCON', 'male'), e('etherCON', 'male'), [], 100, 'N'),
  cable('fiber.lc.sm', 'Singlemode Fiber LC-LC (OS2)', e('lcDuplex', 'male'), e('lcDuplex', 'male'), [], 10000, 'F'),
  cable('fiber.lc.mm', 'Multimode Fiber LC-LC (OM4)', e('lcDuplex', 'male'), e('lcDuplex', 'male'), [], 400, 'F'),
  cable('fiber.sc.sm', 'Singlemode Fiber SC-SC (OS2)', e('scDuplex', 'male'), e('scDuplex', 'male'), [], 10000, 'F'),
  cable('fiber.sc.mm', 'Multimode Fiber SC-SC (OM4)', e('scDuplex', 'male'), e('scDuplex', 'male'), [], 400, 'F'),
  cable('fiber.lcsc.sm', 'Singlemode Fiber LC-SC (OS2)', e('lcDuplex', 'male'), e('scDuplex', 'male'), [], 10000, 'F'),
  cable('fiber.mdc.sm', 'Singlemode Fiber MDC-MDC (OS2)', e('mdc', 'male'), e('mdc', 'male'), [], 10000, 'F'),
  cable('fiber.mdclc.sm', 'Singlemode Fiber MDC-LC (OS2)', e('mdc', 'male'), e('lcDuplex', 'male'), [], 10000, 'F'),
  cable('fiber.mtp12.sm', 'MTP-12 Trunk (OS2)', e('mpo12', 'male'), e('mpo12', 'male'), [], 10000, 'F'),
  cable('fiber.mtp12.mm', 'MTP-12 Trunk (OM4)', e('mpo12', 'male'), e('mpo12', 'male'), [], 400, 'F'),
  cable('fiber.mtp24.sm', 'MTP-24 Trunk (OS2)', e('mpo24', 'male'), e('mpo24', 'male'), [], 10000, 'F'),
  cable('fiber.mtp24.mm', 'MTP-24 Trunk (OM4)', e('mpo24', 'male'), e('mpo24', 'male'), [], 400, 'F'),
  cable('fiber.mtp8.sm', 'MTP-8 Trunk (OS2)', e('mpo8', 'male'), e('mpo8', 'male'), [], 10000, 'F'),
  cable('fiber.mtp8.mm', 'MTP-8 Trunk (OM4)', e('mpo8', 'male'), e('mpo8', 'male'), [], 400, 'F'),
  cable('multi.w1', '12-Channel Snake – Whirlwind W1', e('whirlwindW1', 'male'), e('whirlwindW1', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('multi.w2', '20-Channel Snake – Whirlwind W2', e('whirlwindW2', 'male'), e('whirlwindW2', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('multi.soca', '6-Channel Snake – Socapex 19-pin', e('socapex19', 'male'), e('socapex19', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('multi.amp57', '24-Channel (25-pair) Cable – Amphenol 57', e('amphenol57', 'male'), e('amphenol57', 'male'), ['analogMic', 'analogLine', 'aes3'], 100, 'A'),
  cable('multi.edac56', '18-Channel Snake – EDAC 56', e('edac56', 'male'), e('edac56', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('multi.e3', 'E3 Multicore (EDAC / ELCO)', e('elcoE3', 'male'), e('elcoE3', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('multi.edac90', '28-Channel Snake – EDAC 90', e('edac90', 'male'), e('edac90', 'female'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'),
  cable('xlr3.mic', 'XLR Cable', e('xlr3', 'female'), e('xlr3', 'male'), ['analogMic', 'analogLine', 'aes3', 'ltc'], 100, 'A'),
  cable('midi.din', 'MIDI Cable (5-pin DIN)', e('din5', 'male'), e('din5', 'male'), ['midi'], 15, 'A'),
  ...[4, 8, 12, 16, 24, 32, 48].map((n) => snake(cable(`snake.${n}`, `${n}-Channel Snake (XLR fan-outs)`, e('xlr3', 'female'), e('xlr3', 'male'), ['analogMic', 'analogLine', 'aes3'], 150, 'A'), n)),
  cable('xlr3.trs', 'XLR-3 Male to 1/4" TRS', e('xlr3', 'female'), e('trs6_35', 'male'), ['analogMic', 'analogLine'], 50, 'A'),
  cable('xlr5.dmx', 'DMX 5-pin (120Ω)', e('xlr5', 'female'), e('xlr5', 'male'), ['dmx512'], 300, 'L'),
  cable('euro.pair', 'Shielded Pair (Euroblock)', e('euroblock', 'female'), e('euroblock', 'female'),
    ['analogMic', 'analogLine', 'rs232', 'rs485', 'ir', 'gpio', 'contactClosure'], null, 'A'),
  cable('spk.nl4', 'Speaker Cable NL4 (12 AWG)', e('speakonNL4', 'male'), e('speakonNL4', 'male'), ['speakerLowZ', 'speaker70V', 'speaker100V'], null, 'S'),
  cable('spk.euro', 'Speaker Wire (Euroblock)', e('euroblock', 'female'), e('euroblock', 'female'), ['speakerLowZ', 'speaker70V', 'speaker100V'], null, 'S'),
  cable('pwr.c13.515', 'Power Cord NEMA 5-15P → C13', e('nema5_15', 'male'), e('iecC13C14', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c13.c14', 'Jumper Cord C14 → C13', e('iecC13C14', 'male'), e('iecC13C14', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.c19.515', 'Power Cord NEMA 5-15P → C19', e('nema5_15', 'male'), e('iecC19C20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.true1.515', 'Power Cord NEMA 5-15P → TRUE1', e('nema5_15', 'male'), e('powerCONTrue1', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c13.520', 'Power Cord NEMA 5-20P → C13', e('nema5_20', 'male'), e('iecC13C14', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c19.520', 'Power Cord NEMA 5-20P → C19', e('nema5_20', 'male'), e('iecC19C20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c13.l520', 'Power Cord NEMA L5-20P → C13', e('nemaL5_20', 'male'), e('iecC13C14', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c19.l520', 'Power Cord NEMA L5-20P → C19', e('nemaL5_20', 'male'), e('iecC19C20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c13.l530', 'Power Cord NEMA L5-30P → C13', e('nemaL5_30', 'male'), e('iecC13C14', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c19.l530', 'Power Cord NEMA L5-30P → C19', e('nemaL5_30', 'male'), e('iecC19C20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c19.l620', 'Power Cord NEMA L6-20P → C19', e('nemaL6_20', 'male'), e('iecC19C20', 'female'), ['ac230V'], null, 'P'),
  cable('pwr.c19.l630', 'Power Cord NEMA L6-30P → C19', e('nemaL6_30', 'male'), e('iecC19C20', 'female'), ['ac230V'], null, 'P'),
  cable('pwr.camlok.feeder', 'Cam-Lok Feeder Set (5-wire)', e('camlok', 'male'), e('camlok', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.ext.l2130', 'Extension NEMA L21-30P → L21-30R', e('nemaL21_30', 'male'), e('nemaL21_30', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.ext.l530', 'Extension NEMA L5-30P → L5-30R', e('nemaL5_30', 'male'), e('nemaL5_30', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.ext.l520', 'Extension NEMA L5-20P → L5-20R', e('nemaL5_20', 'male'), e('nemaL5_20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.ext.520', 'Extension NEMA 5-20P → 5-20R', e('nema5_20', 'male'), e('nema5_20', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.ext.515', 'Extension NEMA 5-15P → 5-15R', e('nema5_15', 'male'), e('nema5_15', 'female'), ['ac120V'], null, 'P'),
  cable('pwr.c19.c20', 'Jumper Cord C20 → C19', e('iecC19C20', 'male'), e('iecC19C20', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.c13.c20', 'Jumper Cord C20 → C13', e('iecC19C20', 'male'), e('iecC13C14', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.true1.c14', 'Jumper Cord C14 → TRUE1', e('iecC13C14', 'male'), e('powerCONTrue1', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.true1.link', 'powerCON TRUE1 Link', e('powerCONTrue1', 'male'), e('powerCONTrue1', 'female'), ['ac120V', 'ac230V'], null, 'P'),
  cable('pwr.powercon.515', 'Power Cord NEMA 5-15P → powerCON', e('nema5_15', 'male'), e('powerCON', 'female'), ['ac120V'], null, 'P'),
  cable('usb.c', 'USB-C to USB-C', e('usbC', 'male'), e('usbC', 'male'), ['usb2', 'usb3'], 2, 'U'),
]

// Pull-schedule names: what the crew actually pulls.
for (const c of CABLE_CATALOG) {
  if (c.pull) continue
  const cat = /^cat(5e|6a|6|8)/.exec(c.key)
  if (cat) c.pull = `Cat${cat[1].toUpperCase().replace('E', 'e')}`
  else if (/^fiber\.(lc|sc|mdc|lcsc|mdclc)\.sm$/.test(c.key)) c.pull = 'Singlemode Fiber (OS2)'
  else if (/^fiber\.(lc|sc|mdc|lcsc|mdclc)\.mm$/.test(c.key)) c.pull = 'Multimode Fiber (OM4)'
  else if (c.key === 'xlr3.mic') c.pull = 'XLR Cable'
  else if (c.key === 'audio.pair') c.pull = 'Audio Cable (1-pair)'
  else if (c.key.startsWith('multi.')) c.pull = c.name.replace(' – ', ' (') + ')'
}

// MARK: Exact-fit custom cables
//
// When nothing in the catalog fits a pair of connectors, the user can pick a
// cable built from the two ports themselves. Its key encodes both ends
// ("custom:nemaL5_30/male~iecC13C14/female") so it round-trips in project files
// without a separate cable table.

const ENDS: Partial<Record<ConnectorType, [male: string, female: string]>> = {
  iecC13C14: ['C14', 'C13'], iecC19C20: ['C20', 'C19'],
  nema5_15: ['NEMA 5-15P', 'NEMA 5-15R'], nema5_20: ['NEMA 5-20P', 'NEMA 5-20R'],
  nemaL5_20: ['NEMA L5-20P', 'NEMA L5-20R'], nemaL5_30: ['NEMA L5-30P', 'NEMA L5-30R'],
  nemaL6_20: ['NEMA L6-20P', 'NEMA L6-20R'], nemaL6_30: ['NEMA L6-30P', 'NEMA L6-30R'],
  nemaL14_30: ['NEMA L14-30P', 'NEMA L14-30R'], nemaL21_30: ['NEMA L21-30P', 'NEMA L21-30R'],
  powerCONTrue1: ['TRUE1 (in)', 'TRUE1 (out)'],
  camlok: ['Cam-Lok (male)', 'Cam-Lok (female)'],
}

/** Human name for one cable end, e.g. "NEMA L5-30P", "C13", "XLR-3 (F)". */
export function endName(end: CableEnd): string {
  const named = ENDS[end.connector]
  if (named && end.gender !== 'genderless') return named[end.gender === 'male' ? 0 : 1]
  const g = end.gender === 'male' ? ' (M)' : end.gender === 'female' ? ' (F)' : ''
  return `${connectorName(end.connector)}${g}`
}

const CUSTOM = 'custom:'
const endKey = (e: CableEnd) => `${e.connector}/${e.gender}`

/** A cable whose ends are made to fit `from` and `to` exactly. */
export function exactFitCable(from: PortTemplate, to: PortTemplate): CableSpec {
  // Put the plug (male) end first for power cords so names read "plug → connector".
  let a: CableEnd = { connector: from.connector, gender: mateGender(from.gender) }
  let b: CableEnd = { connector: to.connector, gender: mateGender(to.gender) }
  if (connectorIsPower(a.connector) && a.gender !== 'male' && b.gender === 'male') [a, b] = [b, a]
  return customCable(a, b)
}

function customCable(a: CableEnd, b: CableEnd): CableSpec {
  const power = connectorIsPower(a.connector) || connectorIsPower(b.connector)
  return {
    key: `${CUSTOM}${endKey(a)}~${endKey(b)}`,
    name: `${power ? 'Power Cord' : 'Custom Cable'} ${endName(a)} → ${endName(b)}`,
    endA: a, endB: b, ratedSignals: [], maxLengthMeters: null, labelPrefix: power ? 'P' : 'X',
  }
}

function parseCustom(key: string): CableSpec | undefined {
  const [ka, kb] = key.slice(CUSTOM.length).split('~')
  const parse = (k?: string): CableEnd | null => {
    const [c, g] = (k ?? '').split('/')
    if (!c || !(c in CONNECTORS) || !['male', 'female', 'genderless'].includes(g)) return null
    return { connector: c as ConnectorType, gender: g as Gender }
  }
  const a = parse(ka), b = parse(kb)
  return a && b ? customCable(a, b) : undefined
}

export const isCustomCable = (key: string | null | undefined) => !!key?.startsWith(CUSTOM)

export const cableSpec = (key: string | null | undefined): CableSpec | undefined =>
  !key ? undefined : key.startsWith(CUSTOM) ? parseCustom(key) : CABLE_CATALOG.find((c) => c.key === key)

/** 0 when both ends are the ports' own connector types; higher for looser fits (5-15P in a 5-20R). */
export function fitLooseness(spec: CableSpec, from: PortTemplate, to: PortTemplate): number {
  const o = orientation(spec, from, to)
  if (!o) return Infinity
  if (spec.direct) return -1
  const [ea, eb] = o === 'aToB' ? [spec.endA, spec.endB] : [spec.endB, spec.endA]
  return (ea.connector === from.connector ? 0 : 1) + (eb.connector === to.connector ? 0 : 1)
}

const sameEnds = (x: CableSpec, y: CableSpec) => {
  const k = (e: CableEnd) => `${e.connector}/${e.gender}`
  return (k(x.endA) === k(y.endA) && k(x.endB) === k(y.endB)) || (k(x.endA) === k(y.endB) && k(x.endB) === k(y.endA))
}

/** Every cable that physically fits, closest fit first. Includes a made-to-fit
 *  cable unless a catalog cable already has exactly those ends. */
export function fittingCables(from: PortTemplate, to: PortTemplate): CableSpec[] {
  const fit = CABLE_CATALOG.filter((s) => orientation(s, from, to) != null)
    .sort((a, b) => fitLooseness(a, from, to) - fitLooseness(b, from, to))
  const exact = exactFitCable(from, to)
  return fit.some((c) => sameEnds(c, exact)) ? fit : [...fit, exact]
}

/** Common jacket colours (name → swatch). */
export const CABLE_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1d1d1f' }, { name: 'White', hex: '#f5f5f5' }, { name: 'Gray', hex: '#8e8e93' }, { name: 'Red', hex: '#d62828' },
  { name: 'Orange', hex: '#f77f00' }, { name: 'Yellow', hex: '#f2c500' }, { name: 'Green', hex: '#2f9e44' }, { name: 'Blue', hex: '#1c64f2' },
  { name: 'Purple', hex: '#7b2cbf' }, { name: 'Violet', hex: '#9d4edd' }, { name: 'Pink', hex: '#f06595' }, { name: 'Brown', hex: '#8b5a2b' },
  { name: 'Aqua', hex: '#22b8cf' }, { name: 'Lime', hex: '#94d82d' }, { name: 'Tan', hex: '#d2b48c' },
]
export const cableColorHex = (name?: string) => {
  const t = name?.trim().toLowerCase()
  if (!t) return undefined
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(t)) return t
  return CABLE_COLORS.find((c) => c.name.toLowerCase() === t || (t === 'grey' && c.name === 'Gray'))?.hex
}
/** True for jacket colours that vanish on a white or dark page (white, black…) – drawn with a thin outline. */
export const needsCasing = (hex: string) => {
  const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255)
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.82 || l < 0.12
}
/** Matches typed / pasted text to a colour name (any other text is kept as typed). */
export const normalizeColor = (v: string) => { const t = v.trim(); if (!t) return undefined; return CABLE_COLORS.find((c) => c.name.toLowerCase() === t.toLowerCase() || (t.toLowerCase() === 'grey' && c.name === 'Gray'))?.name ?? t }

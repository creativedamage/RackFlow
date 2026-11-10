// Option cards: consoles and MixRacks with I/O slots (e.g. Allen & Heath dLive
// "I/O Ports") take cards – Dante, Waves SoundGrid, fibreACE… Fitting a card adds
// its connectors to that device on the wiring diagram (grouped "I/O Port 2 ·
// Dante 128×128"); taking it out removes them and their cables.

import type { EquipmentInstance, PortTemplate, Project } from './model'
import type { ConnectorType, SignalType } from './signals'

export interface OptionCard {
  key: string
  family: string
  name: string
  /** Order code, e.g. M-DL-DANT128-A. */
  model: string
  summary: string
  ports: { id: string; label: string; connector: ConnectorType; signals: SignalType[]; direction?: 'input' | 'output' | 'bidirectional'; gender?: 'male' | 'female' }[]
  /** Says where the specs came from / what to check. */
  note?: string
}

const AH_DLIVE = 'dlive'

/** Cards by family. Specs from Allen & Heath's published card details – verify against the current datasheet. */
export const CARD_CATALOG: OptionCard[] = [
  {
    key: 'dlive.dante128', family: AH_DLIVE, name: 'Dante 128×128', model: 'M-DL-DANT128-A',
    summary: '128×128 Dante at 96 kHz, redundant primary / secondary',
    ports: [
      { id: 'pri', label: 'Dante Primary', connector: 'etherCON', signals: ['dante', 'aes67', 'ethernet1G'] },
      { id: 'sec', label: 'Dante Secondary', connector: 'etherCON', signals: ['dante', 'aes67', 'ethernet1G'] },
    ],
  },
  {
    key: 'dlive.dante64', family: AH_DLIVE, name: 'Dante 64×64', model: 'M-DL-DANT64-A',
    summary: '64×64 Dante at 96 kHz, redundant primary / secondary',
    ports: [
      { id: 'pri', label: 'Dante Primary', connector: 'etherCON', signals: ['dante', 'aes67', 'ethernet1G'] },
      { id: 'sec', label: 'Dante Secondary', connector: 'etherCON', signals: ['dante', 'aes67', 'ethernet1G'] },
    ],
  },
  {
    key: 'dlive.waves3', family: AH_DLIVE, name: 'Waves V3 128×128', model: 'M-DL-WAVES3-A',
    summary: '128×128 Waves SoundGrid, redundant ports',
    ports: [
      { id: 'pri', label: 'SoundGrid Primary', connector: 'etherCON', signals: ['soundGrid', 'ethernet1G'] },
      { id: 'sec', label: 'SoundGrid Secondary', connector: 'etherCON', signals: ['soundGrid', 'ethernet1G'] },
    ],
  },
  {
    key: 'dlive.fibreace', family: AH_DLIVE, name: 'fibreACE 128×128', model: 'M-DL-GOPT-A',
    summary: '128×128 at 96 kHz over fibre, dual redundant opticalCON',
    ports: [
      { id: 'a', label: 'fibreACE A', connector: 'opticalCON', signals: ['ethernet10G'] },
      { id: 'b', label: 'fibreACE B', connector: 'opticalCON', signals: ['ethernet10G'] },
    ],
  },
  {
    key: 'dlive.gigaace', family: AH_DLIVE, name: 'gigaACE 128×128', model: 'M-DL-GACE-A',
    summary: '128×128 gigaACE, redundant',
    ports: [
      { id: 'a', label: 'gigaACE A', connector: 'etherCON', signals: ['ethernet1G'] },
      { id: 'b', label: 'gigaACE B', connector: 'etherCON', signals: ['ethernet1G'] },
    ],
  },
]


// ── DiGiCo ──
// DMI cards (SD12, Quantum consoles, Orange Box…). Channel counts and connectors from DiGiCo's
// console pages and the KLANG DMI card list – verify the exact card variant before ordering.
const DMI = 'digico.dmi', SDR = 'digico.sdr', OPT = 'digico.optics'
const D = (k: string, name: string, model: string, summary: string, ports: OptionCard['ports'], family = DMI): OptionCard => ({ key: `${family === DMI ? 'dmi' : family === SDR ? 'sdr' : 'opt'}.${k}`, family, name, model, summary, ports })
const pair = (base: string, label: string, connector: ConnectorType, signals: SignalType[]): OptionCard['ports'] => [
  { id: `${base}a`, label: `${label} Primary`, connector, signals }, { id: `${base}b`, label: `${label} Secondary`, connector, signals }]
const xlrs = (n: number, label: string, dir: 'input' | 'output', signals: SignalType[]): OptionCard['ports'] =>
  Array.from({ length: n }, (_, i) => ({ id: `${dir === 'input' ? 'in' : 'out'}${i + 1}`, label: `${label} ${i + 1}`, connector: 'xlr3' as ConnectorType, signals, direction: dir, gender: dir === 'input' ? 'female' as const : 'male' as const }))
CARD_CATALOG.push(
  D('dante', 'DMI-DANTE', 'DMI-DANTE', '64×64 Dante at 48 kHz (32×32 at 96 kHz), redundant', pair('d', 'Dante', 'etherCON', ['dante', 'aes67', 'ethernet1G'])),
  D('dante96', 'DMI-DANTE64@96', 'DMI-DANTE64@96', '64×64 Dante at 48 and 96 kHz, redundant + control', [...pair('d', 'Dante', 'etherCON', ['dante', 'aes67', 'ethernet1G']), { id: 'ctl', label: 'Control', connector: 'rj45', signals: ['ethernet1G', 'ipControl'] }]),
  D('madib', 'DMI-MADI-B', 'DMI-MADI-B', '64×64 MADI on BNC (48 / 96 kHz)', [{ id: 'in', label: 'MADI In', connector: 'bnc', signals: ['madi'], direction: 'input' }, { id: 'out', label: 'MADI Out', connector: 'bnc', signals: ['madi'], direction: 'output' }]),
  D('madic', 'DMI-MADI-C', 'DMI-MADI-C', '64×64 MADI over Cat cable (rack mode for DiGiCo racks)', pair('m', 'MADI', 'etherCON', ['madi'])),
  D('opto.hma', 'DMI-OPTO (HMA multi-mode)', 'DMI-OPTO', 'Optical link, up to 64 channels – HMA multi-mode', pair('o', 'Optical', 'hma', ['optocore', 'madi'])),
  D('opto.ocon', 'DMI-OPTO (opticalCON single-mode)', 'DMI-OPTO', 'Optical link, up to 64 channels – opticalCON single-mode', pair('o', 'Optical', 'opticalCON', ['optocore', 'madi'])),
  D('opto.st', 'DMI-OPTO (ST single-mode)', 'DMI-OPTO', 'Optical link, up to 64 channels – ST single-mode', pair('o', 'Optical', 'stFiber', ['optocore', 'madi'])),
  D('waves', 'DMI-WAVES', 'DMI-WAVES', '64×64 Waves SoundGrid at 48 / 96 kHz, redundant', pair('w', 'SoundGrid', 'etherCON', ['soundGrid', 'ethernet1G'])),
  D('avb', 'DMI-AVB', 'DMI-AVB', '64×64 AVB / Milan at 48 / 96 kHz', pair('a', 'AVB', 'etherCON', ['avbMilan', 'ethernet1G'])),
  D('hydra2', 'DMI-HYDRA 2', 'DMI-HYDRA2', '56×56 Calrec Hydra2 at 48 kHz, redundant', pair('h', 'Hydra2', 'lcDuplex', ['hydra2'])),
  D('aes', 'DMI-AES', 'DMI-AES', '16 in / 16 out AES (8 pairs each way), SRC on inputs', [{ id: 'in', label: 'AES In 1–8 (pairs)', connector: 'db25', signals: ['aes3'], direction: 'input' }, { id: 'out', label: 'AES Out 1–8 (pairs)', connector: 'db25', signals: ['aes3'], direction: 'output' }]),
  D('adc', 'DMI-ADC', 'DMI-ADC', '16 analogue line inputs (+22 dBu max)', [{ id: 'in1', label: 'Line In 1–8', connector: 'db25', signals: ['analogLine'], direction: 'input' }, { id: 'in2', label: 'Line In 9–16', connector: 'db25', signals: ['analogLine'], direction: 'input' }]),
  D('dac', 'DMI-DAC', 'DMI-DAC', '16 analogue line outputs (+22 dBu max)', [{ id: 'out1', label: 'Line Out 1–8', connector: 'db25', signals: ['analogLine'], direction: 'output' }, { id: 'out2', label: 'Line Out 9–16', connector: 'db25', signals: ['analogLine'], direction: 'output' }]),
  D('mic', 'DMI-MIC', 'DMI-MIC', '8 mic preamp inputs with gain and phantom', [{ id: 'in', label: 'Mic In 1–8', connector: 'db25', signals: ['analogMic', 'analogLine'], direction: 'input' }]),
  D('klang', 'DMI-KLANG', 'DMI-KLANG', 'KLANG immersive in-ear mixing: 64 in, 16 stereo mixes + cue (Orange Box: slot 2)', [...pair('k', 'KLANG', 'etherCON', ['ethernet1G']), { id: 'ctl', label: 'Control', connector: 'rj45', signals: ['ethernet1G', 'ipControl'] }]),
  D('me', 'DMI-ME', 'DMI-ME', '40 outputs to Allen & Heath ME-1 / ME-500 (via ME-U)', [{ id: 'me', label: 'ME Out', connector: 'etherCON', signals: ['ahME'], direction: 'output' }]),
  D('aviom', 'DMI-AVIOM', 'DMI-AVIOM', '16 outputs to Aviom A-Net Pro16 personal mixers', [{ id: 'anet', label: 'A-Net Out', connector: 'etherCON', signals: ['aNet'], direction: 'output' }]),
  D('amm', 'DMI-AMM', 'DMI-AMM', 'Automatic mic mixing, up to 64 channels (DSP only – no connectors)', []),
  // SD-Rack I/O cards (14 slots, 8 channels each). Check the card list for your rack before ordering.
  D('mic8', 'SDR Mic/Line In (8)', 'SDR mic input', '8 mic / line inputs, XLR', xlrs(8, 'Mic In', 'input', ['analogMic', 'analogLine']), SDR),
  D('out8', 'SDR Line Out (8)', 'SDR line output', '8 line outputs, XLR', xlrs(8, 'Line Out', 'output', ['analogLine']), SDR),
  D('aes8', 'SDR AES I/O (4 + 4 pairs)', 'SDR AES', '4 AES pairs in, 4 AES pairs out, XLR', [...xlrs(4, 'AES In', 'input', ['aes3']), ...xlrs(4, 'AES Out', 'output', ['aes3'])], SDR),
  // Console / rack optics (Optocore loops) – the factory option, not a DMI card.
  D('loop1.hma', 'Optocore – single loop (HMA)', 'Optics option', 'One Optocore loop, HMA multi-mode (in / out)', [{ id: 'l1in', label: 'Optocore Loop 1 In', connector: 'hma', signals: ['optocore'] }, { id: 'l1out', label: 'Optocore Loop 1 Out', connector: 'hma', signals: ['optocore'] }], OPT),
  D('loop2.hma', 'Optocore – dual loop (HMA)', 'Optics option', 'Two Optocore loops, HMA multi-mode (redundant)', [1, 2].flatMap((n) => [{ id: `l${n}in`, label: `Optocore Loop ${n} In`, connector: 'hma' as ConnectorType, signals: ['optocore'] as SignalType[] }, { id: `l${n}out`, label: `Optocore Loop ${n} Out`, connector: 'hma' as ConnectorType, signals: ['optocore'] as SignalType[] }]), OPT),
  D('loop1.ocon', 'Optocore – single loop (opticalCON)', 'Optics option', 'One Optocore loop, opticalCON (in / out)', [{ id: 'l1in', label: 'Optocore Loop 1 In', connector: 'opticalCON', signals: ['optocore'] }, { id: 'l1out', label: 'Optocore Loop 1 Out', connector: 'opticalCON', signals: ['optocore'] }], OPT),
  D('loop2.ocon', 'Optocore – dual loop (opticalCON)', 'Optics option', 'Two Optocore loops, opticalCON (redundant)', [1, 2].flatMap((n) => [{ id: `l${n}in`, label: `Optocore Loop ${n} In`, connector: 'opticalCON' as ConnectorType, signals: ['optocore'] as SignalType[] }, { id: `l${n}out`, label: `Optocore Loop ${n} Out`, connector: 'opticalCON' as ConnectorType, signals: ['optocore'] as SignalType[] }]), OPT),
)

const G = (family: string, count: number, name: string) => ({ family, count, name })
/** DiGiCo slots: DMI cards plus the console's optics (Optocore) option; the SD-Rack's 14 I/O card slots. */
export const DIGICO_SLOTS: Record<string, { family: string; count: number; name: string }[]> = {
  'Quantum 7': [G(DMI, 2, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'Quantum 5': [G(DMI, 2, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'Quantum 338': [G(DMI, 2, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'Quantum 225': [G(DMI, 2, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'Quantum 852': [G(DMI, 4, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'SD12': [G(DMI, 2, 'DMI Slot'), G(OPT, 1, 'Optics')],
  'Orange Box': [G(DMI, 2, 'DMI Slot')],
  'SD-Rack': [G(SDR, 14, 'I/O Card'), G(OPT, 1, 'Optics')],
}

/** dLive option I/O ports per model (S Class 2, C Class 1, MixRacks 2–3). */
export const DLIVE_SLOTS: Record<string, number> = { 'dLive S7000': 2, 'dLive S5000': 2, 'dLive S3000': 2, 'dLive C3500': 1, 'dLive C2500': 1, 'dLive C1500': 1, 'dLive DM64': 3, 'dLive DM48': 3, 'dLive DM32': 2, 'dLive DM0': 3 }

export interface SlotGroup { family: string; count: number; name: string; first: number }

/** A device's option slots – from its product, or (for one placed before slots existed) its model. */
export function slotsOf(eq: EquipmentInstance): { family: string; count: number; name?: string; groups?: { family: string; count: number; name: string }[] } | undefined {
  if (eq.product.slots) return eq.product.slots
  const model = eq.product.model.replace(/\s*\(.*\)$/, '')
  const n = eq.product.manufacturer === 'Allen & Heath' ? DLIVE_SLOTS[model] : undefined
  if (n) return { family: 'dlive', count: n, name: 'I/O Port' }
  const dg = eq.product.manufacturer === 'DiGiCo' ? DIGICO_SLOTS[model] : undefined
  return dg ? { family: dg[0].family, count: dg.reduce((t, g) => t + g.count, 0), name: dg[0].name, groups: dg } : undefined
}

/** The slot groups of a device, with the number of each group's first slot (slots count 1…N across groups). */
export function slotGroups(eq: EquipmentInstance): SlotGroup[] {
  const sl = slotsOf(eq)
  if (!sl) return []
  const gs = sl.groups?.length ? sl.groups : [{ family: sl.family, count: sl.count, name: sl.name ?? 'Slot' }]
  let first = 1
  return gs.map((g) => { const out = { ...g, first }; first += g.count; return out })
}
export const groupOfSlot = (eq: EquipmentInstance, n: number) => slotGroups(eq).find((g) => n >= g.first && n < g.first + g.count)

export const cardsFor = (family: string) => CARD_CATALOG.filter((c) => c.family === family)
export const cardByKey = (key: string | undefined) => CARD_CATALOG.find((c) => c.key === key)

/** Option-slot ports are named "slotN.…", so they can be told apart from the device's own. */
export const SLOT_PREFIX = 'slot'
export const isSlotPort = (portId: string) => /^slot\d+\./.test(portId)
export const cardSlotName = (eq: EquipmentInstance, n: number) => { const g = groupOfSlot(eq, n); return g ? (g.count > 1 ? `${g.name} ${n - g.first + 1}` : g.name) : `Slot ${n}` }

/** The ports a fitted card adds to a device. */
export function cardPorts(eq: EquipmentInstance, slot: number, card: OptionCard): PortTemplate[] {
  return card.ports.map((x) => ({
    id: `${SLOT_PREFIX}${slot}.${card.key.split(".").pop()}.${x.id}`, label: x.label, connector: x.connector, gender: x.gender ?? 'female', direction: x.direction ?? 'bidirectional',
    signals: x.signals, group: `${cardSlotName(eq, slot)} · ${card.name}`, face: 'rear', maxConnections: 1,
  }))
}

/** Rebuilds a device's card ports from what's fitted (after fitting a card, or when its product was replaced). */
export function applyCards(eq: EquipmentInstance) {
  const own = eq.product.ports.filter((x) => !isSlotPort(x.id))
  const count = slotsOf(eq)?.count ?? 0
  const added: PortTemplate[] = []
  for (let n = 1; n <= count; n++) {
    const card = cardByKey(eq.cards?.[String(n)])
    if (card) added.push(...cardPorts(eq, n, card))
  }
  eq.product.ports = [...own, ...added]
}

/** Fits a card in a slot (null = empty the slot). Cables on ports that go away are removed. */
export function setCard(p: Project, eqId: string, slot: number, cardKey: string | null) {
  const eq = p.equipment.find((e) => e.id === eqId)
  const sl = eq && slotsOf(eq)
  if (!eq || !sl || slot < 1 || slot > sl.count) return
  const want = cardKey ? cardByKey(cardKey) : undefined
  if (cardKey && (!want || want.family !== groupOfSlot(eq, slot)?.family)) return
  eq.product.slots = sl
  const cards = { ...(eq.cards ?? {}) }
  const card = cardKey ? cardByKey(cardKey) : undefined
  if (card && card.family === groupOfSlot(eq, slot)?.family) cards[String(slot)] = card.key
  else delete cards[String(slot)]
  eq.cards = Object.keys(cards).length ? cards : undefined
  applyCards(eq)
  const ids = new Set(eq.product.ports.map((x) => x.id))
  p.cables = p.cables.filter((c) => !((c.from.equipment === eqId && !ids.has(c.from.port)) || (c.to.equipment === eqId && !ids.has(c.to.port))))
}

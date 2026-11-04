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
  ports: { id: string; label: string; connector: ConnectorType; signals: SignalType[] }[]
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

/** dLive option I/O ports per model (S Class 2, C Class 1, MixRacks 2–3). */
export const DLIVE_SLOTS: Record<string, number> = { 'dLive S7000': 2, 'dLive S5000': 2, 'dLive S3000': 2, 'dLive C3500': 1, 'dLive C2500': 1, 'dLive C1500': 1, 'dLive DM64': 3, 'dLive DM48': 3, 'dLive DM32': 2, 'dLive DM0': 3 }

/** A device's option slots – from its product, or (for one placed before slots existed) its model. */
export function slotsOf(eq: EquipmentInstance): { family: string; count: number; name?: string } | undefined {
  if (eq.product.slots) return eq.product.slots
  const n = eq.product.manufacturer === 'Allen & Heath' ? DLIVE_SLOTS[eq.product.model.replace(/\s*\(.*\)$/, '')] : undefined
  return n ? { family: 'dlive', count: n, name: 'I/O Port' } : undefined
}

export const cardsFor = (family: string) => CARD_CATALOG.filter((c) => c.family === family)
export const cardByKey = (key: string | undefined) => CARD_CATALOG.find((c) => c.key === key)

/** Option-slot ports are named "slotN.…", so they can be told apart from the device's own. */
export const SLOT_PREFIX = 'slot'
export const isSlotPort = (portId: string) => /^slot\d+\./.test(portId)
export const cardSlotName = (eq: EquipmentInstance, n: number) => `${slotsOf(eq)?.name ?? 'Slot'} ${n}`

/** The ports a fitted card adds to a device. */
export function cardPorts(eq: EquipmentInstance, slot: number, card: OptionCard): PortTemplate[] {
  return card.ports.map((x) => ({
    id: `${SLOT_PREFIX}${slot}.${card.key.split(".").pop()}.${x.id}`, label: x.label, connector: x.connector, gender: 'female', direction: 'bidirectional',
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
  eq.product.slots = sl
  const cards = { ...(eq.cards ?? {}) }
  if (cardKey && cardByKey(cardKey)) cards[String(slot)] = cardKey
  else delete cards[String(slot)]
  eq.cards = Object.keys(cards).length ? cards : undefined
  applyCards(eq)
  const ids = new Set(eq.product.ports.map((x) => x.id))
  p.cables = p.cables.filter((c) => !((c.from.equipment === eqId && !ids.has(c.from.port)) || (c.to.equipment === eqId && !ids.has(c.to.port))))
}

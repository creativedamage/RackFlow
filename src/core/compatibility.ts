import { SIGNALS, signalName, type SignalType } from './signals'

/** Result of feeding one signal format into a sink that expects another. */
export type SignalMatch =
  | { kind: 'exact' }
  | { kind: 'degraded'; reason: string }
  | { kind: 'incompatible'; reason: string }

const exact: SignalMatch = { kind: 'exact' }
const degraded = (reason: string): SignalMatch => ({ kind: 'degraded', reason })
const incompatible = (reason: string): SignalMatch => ({ kind: 'incompatible', reason })

export const isUsable = (m: SignalMatch) => m.kind !== 'incompatible'
const score = (m: SignalMatch) => (m.kind === 'exact' ? 2 : m.kind === 'degraded' ? 1 : 0)

const slower = (a: SignalType, b: SignalType) => (SIGNALS[a].tier <= SIGNALS[b].tier ? a : b)

/**
 * The compatibility matrix. `source` leaves an output (or either side of a
 * bidirectional link); `sink` is what the receiving port accepts. Rules are
 * written from the point of view of what an engineer would see on site.
 */
export function evaluate(source: SignalType, sink: SignalType): SignalMatch {
  if (source === sink) return exact
  const a = SIGNALS[source], b = SIGNALS[sink]
  const pair = `${a.family}>${b.family}`
  const n = signalName

  switch (pair) {
    case 'hdmi>hdmi':
      return a.tier < b.tier ? exact : degraded(`${n(source)} source will negotiate down to ${n(sink)} capabilities.`)
    case 'hdmi>dvi':
    case 'dvi>hdmi':
      return degraded('HDMI ↔ DVI-D passes video only (no embedded audio, limited HDCP).')
    case 'displayPort>displayPort':
      return a.tier < b.tier ? exact : degraded(`DisplayPort will negotiate down to ${n(sink)}.`)
    case 'displayPort>hdmi':
    case 'displayPort>dvi':
      return degraded('Requires a DP++ (dual-mode) source or an active adapter.')
    case 'hdmi>displayPort':
    case 'dvi>displayPort':
      return incompatible('HDMI/DVI → DisplayPort requires an active converter device.')
    case 'sdi>sdi':
      // SDI does not negotiate: a higher-rate signal into a lower-rate input fails.
      return a.tier < b.tier ? exact : incompatible(`${n(source)} exceeds the ${n(sink)} input's data rate.`)
    case 'analogAudio>analogAudio':
      return source === 'analogMic'
        ? degraded('Mic-level source into line input: expect ~40 dB too little gain.')
        : degraded('Line-level source into mic input: risk of clipping; use a pad.')
    case 'speakerLowZ>speakerCV':
    case 'speakerCV>speakerLowZ':
      return incompatible('Low-Z and constant-voltage (70/100V) speaker systems cannot be mixed without a transformer.')
    case 'speakerCV>speakerCV':
      return a.tier < b.tier ? exact : degraded('100V line into 70V-tapped loudspeaker: check tap wattage (≈2× power).')
    case 'ethernet>ethernet':
      return degraded(`Link will auto-negotiate to ${n(slower(source, sink))}.`)
    case 'ipProtocol>ethernet':
    case 'ethernet>ipProtocol':
      return exact // IP protocols ride on Ethernet; a switch port carries any of them.
    case 'ipProtocol>ipProtocol':
      return ipMatch(source, sink)
    case 'usb>usb':
      return degraded(`USB link will run at ${n(slower(source, sink))} speed.`)
    case 'acMains>acMains':
    case 'dc>dc':
      return incompatible(`Voltage mismatch: ${n(source)} supply into ${n(sink)} inlet.`)
    case 'acMains>dc':
    case 'dc>acMains':
      return incompatible('AC and DC power cannot be connected directly.')
  }

  if (a.family === 'speakerLowZ' || a.family === 'speakerCV')
    return incompatible('Speaker-level output must not feed a line/mic/digital input.')
  if (b.family === 'speakerLowZ' || b.family === 'speakerCV')
    return incompatible('Only amplifier outputs can drive a loudspeaker input.')
  if ((source === 'dmx512' && (sink === 'sacn' || sink === 'artNet')) || (sink === 'dmx512' && (source === 'sacn' || source === 'artNet')))
    return incompatible(`DMX ↔ ${n(source === 'dmx512' ? sink : source)} needs a DMX/Ethernet node.`)
  if (a.domain === 'power' || b.domain === 'power') return incompatible('Power cannot connect to a signal port.')
  if (a.domain !== b.domain) return incompatible(`${a.domain} signal cannot feed a ${b.domain} port.`)
  return incompatible(`${n(source)} is not compatible with ${n(sink)}; a converter is required.`)
}

function ipMatch(a: SignalType, b: SignalType): SignalMatch {
  const has = (x: SignalType, y: SignalType) => (a === x && b === y) || (a === y && b === x)
  if (has('dante', 'aes67')) return degraded('Dante ↔ AES67 requires AES67 mode enabled on the Dante device (multicast, PTPv2).')
  if (has('aes67', 'st2110')) return degraded('AES67 interoperates with ST 2110-30 with matching packet time/PTP profile.')
  if (has('sacn', 'artNet')) return incompatible('sACN and Art-Net are different protocols; a merger/gateway is required.')
  return incompatible(`${signalName(a)} and ${signalName(b)} are not interoperable protocols.`)
}

export interface BestMatch { source: SignalType; sink: SignalType; match: SignalMatch }

/** Best pairing between everything a source offers and everything a sink accepts. */
export function bestMatch(sources: SignalType[], sinks: SignalType[]): BestMatch | null {
  let best: BestMatch | null = null
  for (const s of sources) {
    for (const t of sinks) {
      const m = evaluate(s, t)
      if (!best || score(m) > score(best.match)) {
        best = { source: s, sink: t, match: m }
        if (m.kind === 'exact') return best
      }
    }
  }
  return best
}

export const matchScore = score

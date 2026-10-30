// Turns a manufacturer's spec sheet text ("Connections" section, tech specs
// page, or a pasted list like "2 x 12G-SDI Out, XLR In") into ports and basic
// specs. Pure and offline – the optional AI lookup produces the same
// SpecDraft shape and goes through draftToProduct() as well.

import { CATEGORIES, type EquipmentCategory, type PortDirection, type PortTemplate, type ProductDefinition } from './model'
import { CONNECTORS, SIGNALS, typicalPanelGender, type ConnectorType, type Gender, type SignalType } from './signals'
import { newCustomProduct } from './catalog'
import { RACK_UNIT_MM } from './project'
import type { ProductLibrary } from './catalog'
import type { ManufacturerDirectory } from './manufacturers'

/** One line of the port list: "2 × 12G-SDI Out". */
export interface PortDraft {
  label: string
  count: number
  connector: ConnectorType
  direction: PortDirection
  signals: SignalType[]
  group?: string
  gender?: Gender
  /** The text it came from (shown in the preview). */
  source?: string
}

export interface SpecDraft {
  manufacturer?: string
  model?: string
  category?: EquipmentCategory
  summary?: string
  rackUnits?: number | null
  weightKG?: number
  widthMM?: number
  heightMM?: number
  depthMM?: number
  typicalWatts?: number
  maxWatts?: number
  ports: PortDraft[]
  /** Lines that looked like connections but couldn't be understood. */
  unmatched: string[]
  /** Where the specs came from ("pasted text", a URL, "AI lookup"). */
  via?: string
}

// MARK: Port rules

interface Rule {
  re: RegExp
  connector: ConnectorType | ((t: string) => ConnectorType)
  signals: SignalType[] | ((t: string) => SignalType[])
  name: string | ((t: string) => string)
  group: string
  /** Direction when the text doesn't say. */
  dir?: PortDirection
}

const has = (t: string, re: RegExp) => re.test(t)
const sdiSignal = (t: string): SignalType[] =>
  has(t, /12\s*g/) ? ['sdi12G'] : has(t, /6\s*g/) ? ['sdi6G'] : has(t, /3\s*g/) ? ['sdi3G'] : has(t, /\bhd[\s-]?sdi|1\.5\s*g/) ? ['sdiHD'] : ['sdi3G']
const hdmiSignal = (t: string): SignalType[] => has(t, /2\.1/) ? ['hdmi21'] : has(t, /1\.4/) ? ['hdmi14'] : ['hdmi20']
const xlrish = (t: string): ConnectorType =>
  has(t, /mini[\s-]?xlr|ta3|ta-3/) ? 'miniXlr' : has(t, /1\/4|6\.35|\bjack\b|\btrs\b|\bts\b/) && !has(t, /xlr/) ? 'trs6_35'
    : has(t, /3\.5\s*mm|mini[\s-]?jack|headphone/) ? 'trs3_5' : has(t, /\brca\b|phono/) ? 'rca'
      : has(t, /euro\s*block|phoenix|terminal/) ? 'euroblock' : has(t, /combo/) ? 'xlr3' : 'xlr3'

/** Ordered: the first rule that matches a line wins. */
const RULES: Rule[] = [
  { re: /smpte\s*fib|hybrid\s*fib|smpte[\s-]?311|camera\s*fib/, connector: 'smpteFiber', signals: ['sdi12G'], name: 'SMPTE Fiber', group: 'Fiber', dir: 'bidirectional' },
  { re: /\bsfp|optical\s*fib|fiber|fibre|\blc\b/, connector: 'lcDuplex', signals: (t) => (has(t, /sdi/) ? sdiSignal(t) : ['ethernet10G']), name: (t) => (has(t, /sdi/) ? 'Optical SDI' : 'SFP'), group: 'Fiber', dir: 'bidirectional' },
  { re: /genlock|reference|\bref\b|tri[\s-]?sync|black\s*burst/, connector: 'bnc', signals: ['analogComposite'], name: 'Ref', group: 'Sync', dir: 'input' },
  { re: /time\s*code|\bltc\b/, connector: (t) => (has(t, /xlr/) ? 'xlr3' : has(t, /lemo|din/) ? 'lemo' : 'bnc'), signals: ['analogLine'], name: 'Timecode', group: 'Sync', dir: 'input' },
  { re: /\bsdi\b|[0-9.]+\s*g[\s-]?sdi|hd[\s-]?sdi/, connector: 'bnc', signals: sdiSignal, name: (t) => SIGNALS[sdiSignal(t)[0]].name, group: 'Video' },
  { re: /hdmi/, connector: 'hdmi', signals: hdmiSignal, name: 'HDMI', group: 'Video' },
  { re: /display\s*port/, connector: 'displayPort', signals: ['displayPort14'], name: 'DisplayPort', group: 'Video' },
  { re: /\bdvi\b/, connector: 'dvi', signals: ['dviD'], name: 'DVI', group: 'Video' },
  { re: /hdbaset/, connector: 'rj45', signals: ['hdbaseT'], name: 'HDBaseT', group: 'Video' },
  { re: /\bvga\b|hd[\s-]?15/, connector: 'hd15', signals: ['analogComposite'], name: 'VGA', group: 'Video' },
  { re: /composite|\bcvbs\b/, connector: (t) => (has(t, /rca/) ? 'rca' : 'bnc'), signals: ['analogComposite'], name: 'Composite', group: 'Video' },
  { re: /\bmadi\b/, connector: (t) => (has(t, /optic|fib|sc\b/) ? 'scDuplex' : 'bnc'), signals: ['madi'], name: 'MADI', group: 'Audio' },
  { re: /^(?!.*\b(analog|mic|xlr analog)\b).*(\baes\s*\/?\s*ebu|\baes3\b|\baes\b(?!67))/, connector: (t) => (has(t, /bnc/) ? 'bnc' : 'xlr3'), signals: ['aes3'], name: 'AES', group: 'Audio' },
  { re: /dante/, connector: (t) => (has(t, /ethercon/) ? 'etherCON' : 'rj45'), signals: ['dante', 'aes67'], name: 'Dante', group: 'Network', dir: 'bidirectional' },
  { re: /\bndi\b/, connector: 'rj45', signals: ['ndi', 'ethernet1G'], name: 'NDI', group: 'Network', dir: 'bidirectional' },
  { re: /2110/, connector: (t) => (has(t, /sfp|fib/) ? 'lcDuplex' : 'rj45'), signals: ['st2110', 'ethernet10G'], name: 'ST 2110', group: 'Network', dir: 'bidirectional' },
  { re: /\bavb\b|milan/, connector: 'rj45', signals: ['avbMilan'], name: 'AVB', group: 'Network', dir: 'bidirectional' },
  { re: /art[\s-]?net|\bsacn\b/, connector: (t) => (has(t, /ethercon/) ? 'etherCON' : 'rj45'), signals: ['artNet', 'sacn', 'ethernet1G'], name: 'Art-Net/sACN', group: 'Network', dir: 'bidirectional' },
  { re: /ethernet|\blan\b|\brj[\s-]?45\b|ethercon|network|\bpoe\b|\bip\b/, connector: (t) => (has(t, /ethercon/) ? 'etherCON' : 'rj45'),
    signals: (t) => (has(t, /10\s*g/) ? ['ethernet10G'] : has(t, /100\s*m(?!bps.*1000)|10\/100(?!\/1000)/) ? ['ethernet100M'] : ['ethernet1G', 'ipControl']),
    name: (t) => (has(t, /10\s*g/) ? '10G Ethernet' : 'Ethernet'), group: 'Network', dir: 'bidirectional' },
  { re: /thunderbolt/, connector: 'usbC', signals: ['usb3'], name: 'Thunderbolt', group: 'USB', dir: 'bidirectional' },
  { re: /\busb\b|usb[\s-]?c|type[\s-]?c/, connector: (t) => (has(t, /type[\s-]?a|usb[\s-]?a\b/) ? 'usbA' : has(t, /type[\s-]?b|usb[\s-]?b\b/) ? 'usbB' : 'usbC'),
    signals: (t) => (has(t, /2\.0/) ? ['usb2'] : ['usb3']), name: (t) => (has(t, /usb[\s-]?c|type[\s-]?c/) ? 'USB-C' : 'USB'), group: 'USB', dir: 'bidirectional' },
  { re: /\bdmx\b|xlr[\s-]?5|5[\s-]?pin\s*xlr/, connector: (t) => (has(t, /3[\s-]?pin/) ? 'xlr3' : 'xlr5'), signals: ['dmx512'], name: 'DMX', group: 'DMX' },
  { re: /\blanc\b|2\.5\s*mm/, connector: 'trs3_5', signals: ['contactClosure'], name: 'LANC', group: 'Control', dir: 'input' },
  { re: /rs[\s-]?422|rs[\s-]?485/, connector: (t) => (has(t, /db[\s-]?9|de[\s-]?9|9[\s-]?pin/) ? 'db9' : has(t, /rj/) ? 'rj45' : 'db9'), signals: ['rs485'], name: (t) => (has(t, /422/) ? 'RS-422' : 'RS-485'), group: 'Control', dir: 'bidirectional' },
  { re: /rs[\s-]?232|serial/, connector: (t) => (has(t, /euro|phoenix|terminal/) ? 'euroblock' : 'db9'), signals: ['rs232'], name: 'RS-232', group: 'Control', dir: 'bidirectional' },
  { re: /\bgpi|\bgpo|gpio|tally|contact\s*closure|relay/, connector: (t) => (has(t, /db[\s-]?(15|25)/) ? 'db25' : has(t, /rj/) ? 'rj45' : 'euroblock'), signals: ['gpio'], name: (t) => (has(t, /tally/) ? 'Tally' : 'GPIO'), group: 'Control', dir: 'bidirectional' },
  { re: /\bir\b|infra[\s-]?red/, connector: 'trs3_5', signals: ['ir'], name: 'IR', group: 'Control', dir: 'input' },
  { re: /antenna|\brf\b|wireless/, connector: (t) => (has(t, /sma/) ? 'sma' : has(t, /tnc/) ? 'tnc' : 'bnc'), signals: ['rfUHF'], name: 'Antenna', group: 'RF', dir: 'input' },
  { re: /speakon|nl4|nl2|speaker\s*out|binding\s*post/, connector: (t) => (has(t, /nl2/) ? 'speakonNL2' : has(t, /binding|terminal/) ? 'bindingPost' : 'speakonNL4'), signals: (t) => (has(t, /70\s*v/) ? ['speaker70V'] : has(t, /100\s*v/) ? ['speaker100V'] : ['speakerLowZ']), name: 'Speaker', group: 'Audio', dir: 'output' },
  { re: /intercom|talkback|clear[\s-]?com|party[\s-]?line/, connector: (t) => (has(t, /rj|ethernet/) ? 'rj45' : 'xlr3'), signals: ['analogLine'], name: 'Talkback', group: 'Audio', dir: 'bidirectional' },
  { re: /headphone|phones/, connector: (t) => (has(t, /1\/4|6\.35/) ? 'trs6_35' : 'trs3_5'), signals: ['analogLine'], name: 'Headphones', group: 'Audio', dir: 'output' },
  // Power before generic XLR so "4-pin XLR 12V" is power, not audio.
  { re: /4[\s-]?pin\s*xlr|xlr[\s-]?4|12\s*v\s*dc|dc\s*(in|input|power)|\b(12|24|48)\s*v\b|power\s*in.*dc|\bdc\b/, connector: (t) => (has(t, /xlr|4[\s-]?pin/) ? 'xlr4' : 'dcBarrel'),
    signals: (t) => (has(t, /24\s*v/) ? ['dc24V'] : has(t, /48\s*v/) ? ['dc48V'] : ['dc12V']), name: 'DC In', group: 'Power', dir: 'input' },
  { re: /powercon\s*true|true1/, connector: 'powerCONTrue1', signals: ['ac120V', 'ac230V'], name: 'Power', group: 'Power', dir: 'input' },
  { re: /powercon/, connector: 'powerCON', signals: ['ac120V', 'ac230V'], name: 'Power', group: 'Power', dir: 'input' },
  { re: /\bc20\b|\bc19\b/, connector: 'iecC19C20', signals: ['ac120V', 'ac230V'], name: 'AC In', group: 'Power', dir: 'input' },
  { re: /\biec\b|\bc1[34]\b|mains|100\s*[-–]\s*240|\bac\b|power\s*(supply|input|in\b)|^power\b/, connector: 'iecC13C14', signals: ['ac120V', 'ac230V'], name: 'AC In', group: 'Power', dir: 'input' },
  { re: /\bmic\b|microphone|phantom/, connector: xlrish, signals: ['analogMic', 'analogLine'], name: 'Mic', group: 'Audio', dir: 'input' },
  { re: /analog\s*audio|line\s*(in|out|level)|balanced|\baudio\b|\bxlr\b|\btrs\b|\brca\b/, connector: xlrish, signals: ['analogLine'], name: (t) => (has(t, /analog/) ? 'Analog Audio' : 'Audio'), group: 'Audio' },
]

/** Lines about formats, standards, rates etc. – mention connectors but aren't ports. */
const NOT_A_PORT = /\b(rates?|standards?|formats?|resolutions?|sampl|support|complian|colou?r|frame|codec|bit\s*depth|range|sensitivity|impedance|latency|bandwidth|metadata|protocol|embedded|monitoring|software|update|configuration|setup|dynamic|frequency|signal[\s-]to|thd|level\b|gain|version|specification|warranty|tracks?\b|channels? of)/

const WORD_NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, sixteen: 16, single: 1, dual: 2, quad: 4 }

function countOf(t: string): number {
  const m = /(\d{1,3})\s*[x×]\s/.exec(t) ?? /\b[x×]\s*(\d{1,3})\b/.exec(t) ?? /^\s*(\d{1,3})\s+(?!g\b|v\b|w\b|mm\b|pin)/.exec(t) ?? /\((\d{1,3})\)/.exec(t)
  if (m) return Math.max(1, Math.min(256, Number(m[1])))
  const w = /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|sixteen|single|dual|quad)\b/.exec(t)
  return w ? WORD_NUMS[w[1]] : 1
}

function directionOf(t: string, fallback: PortDirection): PortDirection {
  const inp = /\b(in|ins|input|inputs|receive|rx|return|program\s*in)\b/.test(t)
  const out = /\b(out|outs|output|outputs|transmit|tx|loop|thru|through|send|monitor\s*out|program\s*out)\b/.test(t)
  if (/\b(i\/o|in\/out|input\/output|bidirectional|bi-directional)\b/.test(t)) return 'bidirectional'
  if (inp && !out) return 'input'
  if (out && !inp) return 'output'
  if (inp && out) return /loop|thru/.test(t) ? 'output' : fallback === 'bidirectional' ? 'bidirectional' : 'bidirectional'
  return fallback
}

const dirWord = (d: PortDirection) => (d === 'input' ? 'In' : d === 'output' ? 'Out' : '')

function genderFor(c: ConnectorType, d: PortDirection): Gender {
  if (c === 'xlr3' || c === 'xlr5') return d === 'output' ? 'male' : 'female'
  if (c === 'xlr4') return d === 'input' ? 'male' : 'female'
  return typicalPanelGender(c)
}

const ruleFor = (t: string) => RULES.find((r) => r.re.test(t))
const groupOf = (t: string) => ruleFor(t.toLowerCase())?.group

/** Finds the port described by one line (with its section heading for context). */
export function parsePortLine(line: string, heading = ''): PortDraft | null {
  const own = line.toLowerCase().replace(/[‐-―]/g, '-')
  const head = heading.toLowerCase()
  const ctx = `${head} ${own}`
  if (!own.trim() || own.length > 200) return null
  // The line's own words pick the connector; the heading only helps when they say nothing.
  const r = ruleFor(own) ?? ruleFor(head)
  if (!r) return null
  // Spec-ish sentences ("SDI rates: 1.5G, 3G…") aren't ports – unless they clearly count connectors.
  if ((NOT_A_PORT.test(own) || NOT_A_PORT.test(head)) && !/\d\s*[x×]\s/.test(own)) return null
  const connector = typeof r.connector === 'function' ? r.connector(ctx) : r.connector
  const signals = typeof r.signals === 'function' ? r.signals(ctx) : r.signals
  let direction: PortDirection
  if (/\b(i\/o|in\/out|input\/output|bidirectional|bi-directional)\b/.test(own)) direction = 'bidirectional'
  else {
    direction = directionOf(own, 'bidirectional')
    if (direction === 'bidirectional') direction = directionOf(head, r.dir ?? 'input')
  }
  if (r.group === 'Power') direction = 'input'
  else if (r.dir === 'bidirectional' && !/\b(in|out|input|output|inputs|outputs)\b/.test(own)) direction = 'bidirectional'
  const base = typeof r.name === 'function' ? r.name(ctx) : r.name
  const label = r.group === 'Power' ? base : `${base} ${dirWord(direction)}`.trim()
  return { label, count: countOf(own), connector, direction, signals, group: r.group, gender: genderFor(connector, direction), source: line.trim() }
}

// MARK: Whole-document parsing

const HEADING_WORDS = /\b(inputs|outputs|input|output|connections?|connectivity|interfaces?|ports?|control|ethernet|network|power|reference|sync|audio|video|monitoring|usb|storage|consumption|weight|dimensions|panel|i\/o|remote|timecode|genlock|intercom|talkback|tally)\b/i
const hasCount = (l: string) => /\d\s*[x×]\s|^\s*\d+\s|\b(one|two|three|four|dual|single|quad)\b/i.test(l)

/** Is `l` a section heading for the line(s) after it (Blackmagic-style "Heading / value" layouts)? */
function isHeading(l: string, next: string | undefined): boolean {
  if (next === undefined || l.length > 45 || /[:.]$/.test(l) && !/:$/.test(l) || hasCount(l) || /\d\s*(w|kg|lb|mm|v)\b/i.test(l)) return false
  if (/:$/.test(l)) return true
  if (!HEADING_WORDS.test(l)) return false
  if (hasCount(next)) return true
  // "Ethernet" followed by "IEC power" is two ports, not a heading and its value.
  const g1 = groupOf(l), g2 = groupOf(next)
  return !(g1 && g2 && g1 !== g2)
}

/** Splits pasted text / page text into lines; bullets and separators become line breaks. */
export function specLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .replace(/[•·▪●■◦]/g, '\n')
    .replace(/;\s+/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** "SDI Video Outputs: 2 x 12G-SDI, 1 x 3G-SDI" → ["SDI Video Outputs", ["2 x 12G-SDI", "1 x 3G-SDI"]] */
function splitLine(l: string): { head: string; parts: string[] } {
  const m = /^([^:]{2,60}):\s*(.+)$/.exec(l)
  const body = m ? m[2] : l
  // Split a list only where the next piece is its own item: it has a count, or starts with a connector word.
  const raw = body.split(/\s*,\s*|\s+and\s+(?=\d+\s*[x×])/i)
  const parts: string[] = []
  for (const piece of raw) {
    const starts = piece.split(/\s+/).slice(0, 2).join(' ')
    if (parts.length && !(hasCount(piece) || ruleFor(starts.toLowerCase()))) parts[parts.length - 1] += `, ${piece}`
    else parts.push(piece)
  }
  return { head: m ? m[1] : '', parts: parts.length ? parts : [body] }
}

const num = (s: string) => Number(s.replace(',', '.'))

export function parseSpecText(text: string, via = 'pasted text'): SpecDraft {
  const lines = specLines(text)
  const ports: PortDraft[] = []
  const unmatched: string[] = []
  const draft: SpecDraft = { ports, unmatched, via }
  let heading = ''
  let prevWasHeading = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    // Section headings (not after another heading: that line is its value).
    if (/^(connections?|connectivity|(technical\s+)?specs|(technical\s+)?specifications|tech specs|i\/o|ports)\s*:?$/i.test(l)) { heading = ''; prevWasHeading = false; continue }
    if ((!prevWasHeading || hasCount(lines[i + 1] ?? '')) && isHeading(l, lines[i + 1])) { heading = l.replace(/:$/, ''); prevWasHeading = true; continue }
    prevWasHeading = false
    const full = `${heading} ${l}`
    // Physical / power numbers (the label may be in the heading).
    let m: RegExpExecArray | null
    if (/power\s*(consumption|draw)|consumption|typical\s*power|max(imum)?\s*power|wattage/i.test(full) && (m = /(\d+(?:[.,]\d+)?)\s*(w|watts?)\b/i.exec(l))) {
      const w = num(m[1])
      if (/max/i.test(full)) draft.maxWatts = w; else draft.typicalWatts = draft.typicalWatts ?? w
      continue
    }
    if (/weight/i.test(full) && (m = /(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|pounds)\b/i.exec(l))) {
      const v = num(m[1]); const u = m[2].toLowerCase()
      draft.weightKG = Math.round((u === 'kg' ? v : u === 'g' ? v / 1000 : v * 0.4536) * 100) / 100
      continue
    }
    if ((m = /(\d)\s*(?:ru|rack\s*units?|u)\b/i.exec(l)) && /rack|\bru\b|\d\s*u\b/i.test(full) && !/usb/i.test(l)) { draft.rackUnits = Number(m[1]); continue }
    if (/\b(height|width|depth)\b/i.test(full) && (m = /(\d+(?:[.,]\d+)?)\s*(mm|cm|in|")/i.exec(l))) {
      const v = num(m[1]); const u = m[2].toLowerCase(); const mm = Math.round(u === 'mm' ? v : u === 'cm' ? v * 10 : v * 25.4)
      const which = /height/i.test(l) ? 'h' : /width/i.test(l) ? 'w' : /depth/i.test(l) ? 'd' : /height/i.test(heading) ? 'h' : /width/i.test(heading) ? 'w' : 'd'
      if (which === 'h') draft.heightMM = mm; else if (which === 'w') draft.widthMM = mm; else draft.depthMM = mm
      continue
    }
    if (/^(dimensions|size|weight|power consumption)\b/i.test(heading) && !hasCount(l)) continue
    const { head, parts } = splitLine(l)
    let any = false
    for (const part of parts) {
      const p = parsePortLine(part, head || heading)
      if (p) { ports.push(p); any = true }
    }
    if (!any && /\b(in|out|input|output|port|connector)s?\b/i.test(l) && l.length < 120 && !NOT_A_PORT.test(l.toLowerCase())) unmatched.push(l)
  }
  draft.ports = mergeDuplicates(ports)
  return draft
}

/** "SDI Out" ×1 listed twice (e.g. section summary + detail) collapses into one row. */
function mergeDuplicates(ports: PortDraft[]): PortDraft[] {
  const out: PortDraft[] = []
  for (const p of ports) {
    const same = out.find((q) => q.label === p.label && q.connector === p.connector && q.direction === p.direction && q.source === p.source)
    if (same) continue
    out.push(p)
  }
  return out
}

// MARK: Guessing identity

const CATEGORY_HINTS: [RegExp, EquipmentCategory][] = [
  [/\b(camera|camcorder|ursa|cinema camera|studio camera|ptz|pocket cinema|cam\b)/i, 'camera'],
  [/\b(atem|switcher|production switcher|vision mixer|tricaster|carbonite)/i, 'videoSwitcher'],
  [/\b(videohub|router|matrix)/i, 'matrixSwitcher'],
  [/\b(hyperdeck|recorder|ki pro|video assist|player)/i, 'recorder'],
  [/\b(converter|micro converter|mini converter|teranex|bidirectional)/i, 'converter'],
  [/\b(smartview|monitor|display|tv\b)/i, 'display'],
  [/\b(projector)/i, 'projector'],
  [/\b(encoder|streaming|web presenter)/i, 'encoder'],
  [/\b(decoder)/i, 'decoder'],
  [/\b(extender|transmitter|receiver)/i, 'extender'],
  [/\b(mixer|console|desk)\b/i, 'mixer'],
  [/\b(dsp|processor)\b/i, 'dsp'],
  [/\b(amplifier|amp)\b/i, 'amplifier'],
  [/\b(speaker|loudspeaker|subwoofer)/i, 'loudspeaker'],
  [/\b(microphone|mic)\b/i, 'microphone'],
  [/\b(intercom|beltpack)/i, 'intercom'],
  [/\b(switch)\b/i, 'networkSwitch'],
  [/\b(moving head|fixture|wash|spot|par\b|fresnel)/i, 'lightingFixture'],
  [/\b(audio interface|interface)/i, 'audioInterface'],
]

export function guessCategory(text: string): EquipmentCategory {
  for (const [re, c] of CATEGORY_HINTS) if (re.test(text)) return c
  return 'other'
}

/** Splits "Blackmagic URSA Broadcast G2" into maker + model using the directory (aliases count). */
export function splitMakerModel(query: string, makers: ManufacturerDirectory): { manufacturer: string; model: string } {
  const words = query.trim().split(/\s+/)
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const head = words.slice(0, n).join(' ')
    const m = makers.get(head) ?? makers.resolve(head)?.maker ?? makers.search(head, null, 1).find((x) => fold(x.maker.name).startsWith(fold(head)))?.maker
    if (m) {
      // Keep product-line aliases ("ATEM") as part of the model name.
      const via = makers.resolve(head)?.via
      return { manufacturer: m.name, model: (via ? words : words.slice(n)).join(' ') }
    }
  }
  return { manufacturer: '', model: query.trim() }
}

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

// MARK: Fuzzy catalog search

const norm = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()
const compact = (s: string) => norm(s).replace(/ /g, '')

function near(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || a.length < 4 || b.length < 4) return false
  // One insert / delete / substitute / adjacent swap.
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[a.length][b.length] <= 1
}

/** Forgiving search for the finder: partial words, typos, "12k"/"12 K", part numbers. */
export function fuzzyFind(lib: ProductLibrary, query: string, limit = 12): { product: ProductDefinition; score: number }[] {
  const q = norm(query)
  if (!q) return []
  const qTokens = q.split(' ')
  const qCompact = q.replace(/ /g, '')
  const out: { product: ProductDefinition; score: number }[] = []
  for (const p of lib.products) {
    const name = norm(`${p.manufacturer} ${p.model}`)
    const hay = `${name} ${norm(p.tags.join(' '))} ${norm(p.summary)}`
    const words = hay.split(' ')
    let hit = 0
    for (const t of qTokens) {
      if (name.includes(t)) hit += 1
      else if (words.some((w) => w.startsWith(t) || near(w, t))) hit += 0.8
      else if (hay.includes(t)) hit += 0.5
    }
    let score = hit / qTokens.length
    const nc = compact(p.model)
    if (nc && (qCompact.includes(nc) || nc.includes(qCompact))) score += 0.6
    if (compact(`${p.manufacturer}${p.model}`) === qCompact) score += 1
    if (score >= 0.5) out.push({ product: p, score })
  }
  return out.sort((a, b) => b.score - a.score || a.product.model.length - b.product.model.length).slice(0, limit)
}

// MARK: Draft → product

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'port'

/** Builds a ready-to-place product from a draft (ports numbered, ids unique, power port guaranteed). */
export function draftToProduct(d: SpecDraft): ProductDefinition {
  const p = newCustomProduct()
  p.manufacturer = d.manufacturer?.trim() ?? ''
  p.model = d.model?.trim() || 'New Product'
  p.category = d.category ?? guessCategory(`${p.model} ${d.summary ?? ''}`)
  p.summary = d.summary ?? ''
  p.verified = false
  p.dataNote = `Built from ${d.via ?? 'specs'} – check ports against the manufacturer’s sheet.`
  const ports: PortTemplate[] = []
  const used = new Set<string>()
  const uid = (base: string) => { let id = base, n = 2; while (used.has(id)) id = `${base}.${n++}`; used.add(id); return id }
  // Same label appearing on separate lines continues the numbering ("SDI In 1, 2" then "SDI In 3").
  const totals = new Map<string, number>()
  for (const x of d.ports) totals.set(x.label, (totals.get(x.label) ?? 0) + Math.max(1, x.count))
  const seen = new Map<string, number>()
  for (const x of d.ports) {
    if (!(x.connector in CONNECTORS)) continue
    const signals = x.signals.filter((s) => s in SIGNALS)
    if (!signals.length) continue
    const n = Math.max(1, Math.min(256, Math.round(x.count)))
    const many = (totals.get(x.label) ?? 1) > 1
    for (let i = 0; i < n; i++) {
      const k = (seen.get(x.label) ?? 0) + 1
      seen.set(x.label, k)
      const label = many ? `${x.label} ${k}` : x.label
      ports.push({
        id: uid(`${slug(x.group ?? 'io')}.${slug(x.label)}${many ? `.${String(k).padStart(2, '0')}` : ''}`),
        label, connector: x.connector, gender: x.gender ?? genderFor(x.connector, x.direction), direction: x.direction,
        signals: [...signals], group: x.group, face: 'rear', maxConnections: 1,
      })
    }
  }
  const power = ports.filter((x) => SIGNALS[x.signals[0]].domain === 'power')
  if (!power.length) ports.push(...p.ports) // keep the default AC In so power checks work
  p.ports = ports
  // Power spec follows the power connector.
  const dc = power.find((x) => SIGNALS[x.signals[0]].family === 'dc')
  if (dc) p.power.acceptedVoltages = [...dc.signals]
  if (d.typicalWatts) { p.power.typicalWatts = d.typicalWatts; p.power.maxWatts = Math.max(d.maxWatts ?? 0, d.typicalWatts) }
  else if (d.maxWatts) { p.power.maxWatts = d.maxWatts; p.power.typicalWatts = Math.round(d.maxWatts * 0.7) }
  // Physical: rack gear vs. everything else.
  const rack = d.rackUnits ?? (['camera', 'microphone', 'loudspeaker', 'lightingFixture', 'display', 'projector'].includes(p.category) ? null : undefined)
  if (rack === null || (rack === undefined && /portable|camera/.test(p.category))) {
    p.physical.rackUnits = null
    p.physical.mounting = p.category === 'camera' ? 'portable' : p.category === 'display' ? 'wall' : 'shelf'
    p.physical.widthMM = d.widthMM ?? 200; p.physical.heightMM = d.heightMM ?? 150
  } else if (rack) {
    p.physical.rackUnits = rack; p.physical.heightMM = rack * RACK_UNIT_MM
  }
  if (d.widthMM) p.physical.widthMM = d.widthMM
  if (d.depthMM) p.physical.depthMM = d.depthMM
  if (d.weightKG) p.physical.weightKG = d.weightKG
  p.tags = ['from specs']
  return p
}

/** Sanitises whatever the AI returned into a SpecDraft (unknown keys are re-parsed from the label). */
export function draftFromJSON(raw: unknown, via = 'AI lookup'): SpecDraft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
  const ports: PortDraft[] = []
  const unmatched: string[] = []
  for (const r of Array.isArray(o.ports) ? o.ports : []) {
    const x = (r ?? {}) as Record<string, unknown>
    const label = str(x.label)?.trim()
    if (!label) continue
    const count = n(x.count) ?? 1
    const dir = (['input', 'output', 'bidirectional'] as const).find((d) => d === x.direction)
    let connector = str(x.connector) as ConnectorType | undefined
    let signals = (Array.isArray(x.signals) ? x.signals : []).filter((s): s is SignalType => typeof s === 'string' && s in SIGNALS)
    if (!connector || !(connector in CONNECTORS) || !signals.length) {
      const guess = parsePortLine(`${label} ${str(x.connector) ?? ''}`, str(x.group) ?? '')
      if (!guess) { unmatched.push(label); continue }
      if (!connector || !(connector in CONNECTORS)) connector = guess.connector
      if (!signals.length) signals = guess.signals
    }
    const direction = dir ?? directionOf(label.toLowerCase(), 'input')
    ports.push({ label, count, connector, direction, signals, group: str(x.group), gender: genderFor(connector, direction), source: label })
  }
  const cat = str(o.category) as EquipmentCategory | undefined
  return {
    manufacturer: str(o.manufacturer), model: str(o.model), summary: str(o.summary),
    category: cat && cat in CATEGORIES ? cat : undefined,
    rackUnits: o.rackUnits === null ? null : n(o.rackUnits), weightKG: n(o.weightKG),
    widthMM: n(o.widthMM), heightMM: n(o.heightMM), depthMM: n(o.depthMM),
    typicalWatts: n(o.typicalWatts), maxWatts: n(o.maxWatts),
    ports, unmatched, via,
  }
}

/** The vocabulary the AI must answer in (sent with the prompt). */
export function specVocabulary() {
  return {
    connectors: Object.entries(CONNECTORS).map(([k, v]) => `${k} (${v.name})`).join(', '),
    signals: Object.entries(SIGNALS).map(([k, v]) => `${k} (${v.name})`).join(', '),
    categories: Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v.name})`).join(', '),
  }
}

/** Plain text from an HTML page (for the URL fetch). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|dt|dd|section|table|ul|ol)>/gi, '\n')
    .replace(/<(td|th)[^>]*>/gi, ' : ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’').replace(/&times;/g, '×').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

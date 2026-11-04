// Signal taxonomy: domains, concrete signal formats, connectors and gender.
// Pure data + tiny helpers. Shared by main, preload-free renderer and tests.

export type SignalDomain = 'video' | 'audio' | 'network' | 'control' | 'lighting' | 'rf' | 'usb' | 'power'

export const DOMAINS: Record<SignalDomain, { name: string; color: string }> = {
  video: { name: 'Video', color: '#2F6FDE' },
  audio: { name: 'Audio', color: '#D9480F' },
  network: { name: 'Network', color: '#2B8A3E' },
  control: { name: 'Control', color: '#7048E8' },
  lighting: { name: 'Lighting', color: '#E8B400' },
  rf: { name: 'RF', color: '#0C8599' },
  usb: { name: 'USB', color: '#495057' },
  power: { name: 'Power', color: '#C92A2A' },
}

export type SignalFamily =
  | 'hdmi' | 'displayPort' | 'dvi' | 'sdi' | 'hdbaseT' | 'analogVideo'
  | 'analogAudio' | 'speakerLowZ' | 'speakerCV' | 'aes3' | 'madi'
  | 'ethernet' | 'ipProtocol'
  | 'rs232' | 'rs485' | 'ir' | 'gpio'
  | 'dmx' | 'rfUHF' | 'rfWiFi' | 'usb'
  | 'acMains' | 'dc'

interface SignalMeta { name: string; domain: SignalDomain; family: SignalFamily; tier: number }

const s = (name: string, domain: SignalDomain, family: SignalFamily, tier = 0): SignalMeta => ({ name, domain, family, tier })

/** Every signal format a port can carry. A port lists all of them (an RJ45 on a
 *  DSP may carry ethernet1G + dante + aes67 + ipControl). */
export const SIGNALS = {
  hdmi14: s('HDMI 1.4', 'video', 'hdmi', 1),
  hdmi20: s('HDMI 2.0', 'video', 'hdmi', 2),
  hdmi21: s('HDMI 2.1', 'video', 'hdmi', 3),
  displayPort12: s('DisplayPort 1.2', 'video', 'displayPort', 1),
  displayPort14: s('DisplayPort 1.4', 'video', 'displayPort', 2),
  dviD: s('DVI-D', 'video', 'dvi'),
  sdiHD: s('HD-SDI', 'video', 'sdi', 1),
  sdi3G: s('3G-SDI', 'video', 'sdi', 2),
  sdi6G: s('6G-SDI', 'video', 'sdi', 3),
  sdi12G: s('12G-SDI', 'video', 'sdi', 4),
  hdbaseT: s('HDBaseT', 'video', 'hdbaseT'),
  analogComposite: s('Composite', 'video', 'analogVideo'),

  analogMic: s('Mic Level', 'audio', 'analogAudio', 1),
  analogLine: s('Line Level', 'audio', 'analogAudio', 2),
  speakerLowZ: s('Speaker (Low-Z)', 'audio', 'speakerLowZ'),
  speaker70V: s('Speaker 70V', 'audio', 'speakerCV', 1),
  speaker100V: s('Speaker 100V', 'audio', 'speakerCV', 2),
  aes3: s('AES3', 'audio', 'aes3'),
  madi: s('MADI', 'audio', 'madi'),

  ethernet100M: s('Ethernet 100M', 'network', 'ethernet', 1),
  ethernet1G: s('Ethernet 1G', 'network', 'ethernet', 2),
  ethernet10G: s('Ethernet 10G', 'network', 'ethernet', 3),
  dante: s('Dante', 'network', 'ipProtocol'),
  soundGrid: s('Waves SoundGrid', 'network', 'ipProtocol'),
  aes67: s('AES67', 'network', 'ipProtocol'),
  avbMilan: s('AVB / Milan', 'network', 'ipProtocol'),
  ndi: s('NDI', 'network', 'ipProtocol'),
  st2110: s('SMPTE ST 2110', 'network', 'ipProtocol'),
  ipControl: s('IP Control', 'network', 'ipProtocol'),
  sacn: s('sACN', 'network', 'ipProtocol'),
  artNet: s('Art-Net', 'network', 'ipProtocol'),

  rs232: s('RS-232', 'control', 'rs232'),
  rs485: s('RS-485', 'control', 'rs485'),
  ir: s('IR', 'control', 'ir'),
  gpio: s('GPIO', 'control', 'gpio'),
  contactClosure: s('Contact Closure', 'control', 'gpio'),

  dmx512: s('DMX512', 'lighting', 'dmx'),

  rfUHF: s('UHF RF', 'rf', 'rfUHF'),
  rfWiFiAntenna: s('Wi-Fi Antenna', 'rf', 'rfWiFi'),

  usb2: s('USB 2.0', 'usb', 'usb', 1),
  usb3: s('USB 3.x', 'usb', 'usb', 2),

  ac120V: s('AC 120V', 'power', 'acMains', 1),
  ac230V: s('AC 230V', 'power', 'acMains', 2),
  dc12V: s('DC 12V', 'power', 'dc', 1),
  dc24V: s('DC 24V', 'power', 'dc', 2),
  dc48V: s('DC 48V', 'power', 'dc', 3),
} satisfies Record<string, SignalMeta>

export type SignalType = keyof typeof SIGNALS
export const SIGNAL_TYPES = Object.keys(SIGNALS) as SignalType[]

export const signalDomain = (t: SignalType): SignalDomain => SIGNALS[t].domain
export const signalName = (t: SignalType): string => SIGNALS[t].name

// MARK: - Connectors

export type Gender = 'male' | 'female' | 'genderless'
export const GENDERS: Gender[] = ['male', 'female', 'genderless']
export const mateGender = (g: Gender): Gender => (g === 'male' ? 'female' : g === 'female' ? 'male' : 'genderless')

interface ConnectorMeta { name: string; power?: boolean; crossMates?: string[]; suggested: SignalType[] }
const c = (name: string, suggested: SignalType[], extra: Partial<ConnectorMeta> = {}): ConnectorMeta => ({ name, suggested, ...extra })

export const CONNECTORS = {
  hdmi: c('HDMI', ['hdmi20']),
  displayPort: c('DisplayPort', ['displayPort14']),
  dvi: c('DVI', ['dviD']),
  bnc: c('BNC', ['sdi12G']),
  hd15: c('HD15 (VGA)', ['analogComposite']),
  xlr3: c('XLR-3', ['analogLine', 'analogMic']),
  miniXlr: c('Mini XLR (TA3)', ['analogMic', 'analogLine']),
  trs6_35: c('1/4" TRS', ['analogLine', 'analogMic']),
  trs3_5: c('3.5mm TRS', ['analogLine']),
  bantamTT: c('Bantam / TT', ['analogLine', 'analogMic']),
  rca: c('RCA', ['analogLine']),
  speakonNL2: c('speakON NL2', ['speakerLowZ']),
  speakonNL4: c('speakON NL4', ['speakerLowZ']),
  euroblock: c('Euroblock (Phoenix)', ['analogLine']),
  bindingPost: c('Binding Post', ['speakerLowZ']),
  rj45: c('RJ45', ['ethernet1G'], { crossMates: ['etherCON'] }),
  etherCON: c('etherCON', ['ethernet1G'], { crossMates: ['rj45'] }),
  lcDuplex: c('LC Duplex', ['ethernet10G']),
  scDuplex: c('SC Duplex', ['ethernet10G']),
  mdc: c('MDC Duplex', ['ethernet10G']),
  mpo8: c('MTP/MPO-8', ['ethernet10G']),
  mpo12: c('MTP/MPO-12', ['ethernet10G']),
  mpo24: c('MTP/MPO-24', ['ethernet10G']),
  opticalCON: c('opticalCON', ['ethernet10G']),
  usbA: c('USB-A', ['usb3']),
  usbB: c('USB-B', ['usb3']),
  usbC: c('USB-C', ['usb3']),
  db9: c('DB9', ['rs232']),
  db25: c('DB25', ['analogLine']),
  idcPunchdown: c('IDC Punchdown', ['analogLine']),
  xlr5: c('XLR-5', ['dmx512']),
  lemo: c('LEMO', ['analogLine']),
  smpteFiber: c('SMPTE Hybrid Fiber', ['sdi12G']),
  sma: c('SMA', ['rfUHF']),
  tnc: c('TNC', ['rfUHF']),
  iecC13C14: c('IEC C13/C14', ['ac120V', 'ac230V'], { power: true }),
  iecC19C20: c('IEC C19/C20', ['ac120V', 'ac230V'], { power: true }),
  nema5_15: c('NEMA 5-15', ['ac120V'], { power: true }),
  nema5_20: c('NEMA 5-20', ['ac120V'], { power: true }),
  nemaL5_20: c('NEMA L5-20', ['ac120V'], { power: true }),
  nemaL5_30: c('NEMA L5-30', ['ac120V'], { power: true }),
  nemaL6_20: c('NEMA L6-20', ['ac230V'], { power: true }),
  nemaL6_30: c('NEMA L6-30', ['ac230V'], { power: true }),
  nemaL14_30: c('NEMA L14-30', ['ac120V'], { power: true }),
  nemaL21_30: c('NEMA L21-30', ['ac120V', 'ac230V'], { power: true }),
  camlok: c('Cam-Lok', ['ac120V', 'ac230V'], { power: true }),
  schuko: c('Schuko', ['ac230V'], { power: true }),
  powerCON: c('powerCON', ['ac120V', 'ac230V'], { power: true }),
  powerCONTrue1: c('powerCON TRUE1', ['ac120V', 'ac230V'], { power: true }),
  dcBarrel: c('DC Barrel', ['dc12V'], { power: true }),
  xlr4: c('XLR-4 (DC)', ['dc12V'], { power: true }),
  // Multipin audio snakes / tie lines
  whirlwindW1: c('Whirlwind W1 (39-pin)', ['analogMic', 'analogLine']),
  whirlwindW2: c('Whirlwind W2 (61-pin)', ['analogMic', 'analogLine']),
  socapex19: c('Socapex 19-pin', ['analogMic', 'analogLine']),
  amphenol57: c('Amphenol 57 (50-pin)', ['analogLine', 'analogMic']),
  edac56: c('EDAC 56-pin', ['analogMic', 'analogLine']),
  edac90: c('EDAC 90-pin', ['analogMic', 'analogLine']),
} satisfies Record<string, ConnectorMeta>

export type ConnectorType = keyof typeof CONNECTORS
export const CONNECTOR_TYPES = Object.keys(CONNECTORS) as ConnectorType[]

export const connectorName = (t: ConnectorType): string => CONNECTORS[t].name
const meta = (t: ConnectorType): ConnectorMeta => CONNECTORS[t]
export const connectorIsPower = (t: ConnectorType): boolean => meta(t).power === true
export function connectorsMate(a: ConnectorType, b: ConnectorType): boolean {
  if (a === b) return true
  return meta(a).crossMates?.includes(b) ?? false
}
export const suggestedSignals = (t: ConnectorType): SignalType[] => [...meta(t).suggested]

/** Gender a panel-mounted jack of this type usually has (for new ports). */
export function typicalPanelGender(t: ConnectorType): Gender {
  const female: ConnectorType[] = ['hdmi', 'displayPort', 'dvi', 'bnc', 'hd15', 'trs6_35', 'trs3_5', 'bantamTT', 'rca', 'rj45', 'etherCON',
    'lcDuplex', 'scDuplex', 'mdc', 'mpo8', 'mpo12', 'mpo24', 'opticalCON', 'usbA', 'usbB', 'usbC', 'db9', 'db25', 'sma', 'tnc', 'speakonNL2', 'speakonNL4', 'nema5_15', 'nema5_20', 'nemaL5_20', 'nemaL5_30', 'nemaL6_20', 'nemaL6_30', 'nemaL14_30', 'nemaL21_30', 'schuko']
  return female.includes(t) ? 'female' : 'male'
}

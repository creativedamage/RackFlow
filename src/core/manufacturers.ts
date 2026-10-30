// Manufacturer directory: the AVL brands a product can belong to.
//
// Each entry: name, what they make (categories) and product-line aliases so
// typing "dLive" or "ATEM" finds Allen & Heath or Blackmagic Design. Names are
// trade names as commonly used in the industry; parent companies are noted in
// aliases where a brand is usually referred to by its group (e.g. Harman).
// Users can add manufacturers that aren't listed; those are stored separately
// and merged in at runtime.

export type MakerCategory =
  | 'audio' | 'video' | 'display' | 'lighting' | 'control' | 'network'
  | 'conferencing' | 'broadcast' | 'infrastructure' | 'rigging' | 'power'

export const MAKER_CATEGORIES: Record<MakerCategory, string> = {
  audio: 'Audio', video: 'Video', display: 'Display & Projection', lighting: 'Lighting', control: 'Control',
  network: 'Networking', conferencing: 'Conferencing', broadcast: 'Broadcast', infrastructure: 'Racks, Mounts & Cabling',
  rigging: 'Rigging & Staging', power: 'Power',
}

export interface Manufacturer {
  name: string
  categories: MakerCategory[]
  /** Product lines / former names that should resolve to this maker. */
  aliases: string[]
  source: 'builtIn' | 'user'
}

const CODE: Record<string, MakerCategory> = {
  a: 'audio', v: 'video', d: 'display', l: 'lighting', c: 'control', n: 'network',
  k: 'conferencing', b: 'broadcast', i: 'infrastructure', r: 'rigging', p: 'power',
}

// [name, category codes, aliases]
type Row = [string, string, string?]
const ROWS: Row[] = [
  ['Generic', 'avdlcnkbirp', 'Unbranded, Unknown'],
  // ── Audio: consoles, processing, interfaces ──
  ['Allen & Heath', 'a', 'dLive, Avantis, SQ, Qu, CQ, GLD, ME'],
  ['DiGiCo', 'a', 'SD7, SD12, Quantum, SD5'],
  ['Yamaha', 'ak', 'RIVAGE, CL, QL, TF, DM7, DM3'],
  ['Avid', 'ab', 'VENUE, S6L, Pro Tools'],
  ['Solid State Logic', 'ab', 'SSL, Live, System T'],
  ['Midas', 'a', 'HD96, PRO Series, M32, Heritage'],
  ['Behringer', 'a', 'X32, Wing, XR18'],
  ['Soundcraft', 'a', 'Vi Series, Si'],
  ['Lawo', 'ab', 'mc², mc56, A__UHD Core, VSM'],
  ['Calrec', 'ab', 'Artemis, Brio, Argo, Type R'],
  ['Studer', 'ab', 'Vista'],
  ['AMS Neve', 'ab', 'Neve, Genesys'],
  ['Rupert Neve Designs', 'a', 'Shelford'],
  ['API', 'a', 'Automated Processes Inc., 1608'],
  ['Harrison Audio', 'a', 'Harrison'],
  ['PreSonus', 'a', 'StudioLive'],
  ['Mackie', 'a', 'DL Series, ProFX'],
  ['Waves Audio', 'a', 'Waves, SoundGrid, eMotion LV1'],
  ['Focusrite', 'a', 'RedNet, Scarlett'],
  ['RME', 'a', 'Fireface, MADIface'],
  ['Merging Technologies', 'a', 'Horus, Hapi, Anubis'],
  ['DirectOut', 'a', 'PRODIGY, EXBOX'],
  ['Ferrofish', 'a', 'A32'],
  ['Antelope Audio', 'a', 'Orion'],
  ['Universal Audio', 'a', 'UAD, Apollo Twin'],
  ['Apogee Electronics', 'a', 'Apogee, Symphony'],
  ['Prism Sound', 'a', 'Dream ADA, Lyra'],
  ['Grace Design', 'a', ''],
  ['Avalon Design', 'a', 'Avalon'],
  ['Manley Laboratories', 'a', 'Manley'],
  ['Dangerous Music', 'a', ''],
  ['Audinate', 'an', 'Dante, Dante AV, Dante Domain Manager'],
  ['Cedar Audio', 'ab', 'CEDAR, DNS'],
  ['Jünger Audio', 'ab', 'Junger Audio'],
  ['Telos Alliance', 'ab', 'Axia, Linear Acoustic, Omnia, Telos'],
  ['Wheatstone', 'ab', 'WheatNet-IP'],
  ['DHD audio', 'ab', 'DHD'],
  ['Glensound', 'ab', ''],
  ['Sonifex', 'ab', ''],
  ['Studio Technologies', 'ab', ''],
  ['Wohler Technologies', 'ab', 'Wohler'],
  ['TSL Products', 'ab', 'TSL'],
  ['Sound Devices', 'ab', 'MixPre, Scorpio'],
  ['Zoom Corporation', 'a', 'Zoom, LiveTrak'],
  ['TASCAM', 'a', 'Tascam'],
  ['JoeCo', 'a', 'BlackBox Recorder'],

  // ── Audio: DSP, amplification, install ──
  ['QSC', 'akc', 'Q-SYS, CXD, K.2'],
  ['Biamp', 'akc', 'Tesira, Parlé, Devio'],
  ['Symetrix', 'a', 'Radius NX, Symetrix Prism, Symetrix Edge'],
  ['BSS Audio', 'a', 'Soundweb, BSS'],
  ['dbx Professional', 'a', 'dbx, DriveRack'],
  ['Crown Audio', 'a', 'Crown, DCi, I-Tech'],
  ['Lab.gruppen', 'a', 'Lab Gruppen, PLM, D Series'],
  ['Powersoft', 'a', 'X Series, Quattrocanali, Mezzo'],
  ['Linea Research', 'a', ''],
  ['Camco', 'a', ''],
  ['Ashly Audio', 'a', 'Ashly'],
  ['Rane', 'a', ''],
  ['Cloud Electronics', 'a', 'Cloud'],
  ['AtlasIED', 'a', 'Atlas Sound'],
  ['Bosch Security Systems', 'ak', 'Bosch, DICENTIS, Praesensa'],
  ['Listen Technologies', 'a', 'Listen EVERYWHERE'],
  ['Williams AV', 'a', 'Williams Sound'],
  ['Televic', 'ak', 'Confidea, Plixus'],
  ['Taiden', 'ak', ''],

  // ── Audio: loudspeakers ──
  ['L-Acoustics', 'a', 'K1, K2, L Series, Kara, L-ISA'],
  ['d&b audiotechnik', 'a', 'd&b, KSL, GSL, Soundscape'],
  ['Meyer Sound', 'a', 'Panther, LEO, Lyon, Galaxy'],
  ['JBL Professional', 'a', 'JBL, VTX'],
  ['Martin Audio', 'a', 'MLA, Wavefront'],
  ['Adamson Systems Engineering', 'a', 'Adamson, CS Series'],
  ['NEXO', 'a', 'Nexo, GEO'],
  ['CODA Audio', 'a', 'Coda'],
  ['Outline', 'a', ''],
  ['RCF', 'a', ''],
  ['dBTechnologies', 'a', 'dB Technologies'],
  ['Electro-Voice', 'a', 'EV, X-Line'],
  ['Bose Professional', 'ak', 'Bose, ArenaMatch, EdgeMax'],
  ['Fohhn', 'a', ''],
  ['Kling & Freitag', 'a', ''],
  ['Danley Sound Labs', 'a', 'Danley'],
  ['K-array', 'a', 'K-Array'],
  ['Alcons Audio', 'a', 'Alcons'],
  ['EAW', 'a', 'Eastern Acoustic Works'],
  ['Renkus-Heinz', 'a', 'Iconyx'],
  ['Community Professional Loudspeakers', 'a', 'Community'],
  ['Tannoy', 'a', ''],
  ['Genelec', 'a', ''],
  ['Focal', 'a', ''],
  ['ADAM Audio', 'a', ''],
  ['KV2 Audio', 'a', 'KV2'],
  ['Funktion-One', 'a', 'Funktion One'],
  ['Void Acoustics', 'a', 'Void'],
  ['VUE Audiotechnik', 'a', 'VUE'],
  ['Turbosound', 'a', ''],
  ['Fulcrum Acoustic', 'a', ''],
  ['Apart Audio', 'a', 'Apart'],
  ['AUDAC', 'a', 'Audac'],
  ['Ateis', 'a', ''],
  ['SoundTube Entertainment', 'a', 'SoundTube'],
  ['Pioneer DJ', 'a', 'AlphaTheta, CDJ, DJM'],
  ['Sonos', 'a', ''],

  // ── Audio: microphones, wireless, IEM ──
  ['Shure', 'ak', 'Axient, ULX-D, SLX-D, PSM, Microflex, MXA'],
  ['Sennheiser', 'ak', 'Digital 6000, EW-DX, TeamConnect, Spectera'],
  ['Audio-Technica', 'ak', 'ATW, Engineered Sound'],
  ['Neumann', 'a', 'KMS, U 87'],
  ['DPA Microphones', 'a', 'DPA'],
  ['Schoeps', 'a', ''],
  ['AKG', 'a', ''],
  ['beyerdynamic', 'ak', 'Beyerdynamic'],
  ['Lectrosonics', 'a', ''],
  ['Wisycom', 'a', ''],
  ['Countryman Associates', 'a', 'Countryman'],
  ['Earthworks Audio', 'a', 'Earthworks'],
  ['Royer Labs', 'a', 'Royer'],
  ['RØDE', 'a', 'Rode'],
  ['Sony Electronics', 'abvd', 'Sony, BRAVIA, HDC, FX'],
  ['Hollyland', 'av', 'Lark, Mars'],

  // ── Intercom ──
  ['Clear-Com', 'ab', 'FreeSpeak, Arcadia, Eclipse, Helixnet'],
  ['Riedel Communications', 'abn', 'Riedel, Artist, Bolero, MediorNet, SmartPanel'],
  ['RTS Intercom', 'ab', 'RTS, Telex, ODIN, OMNEO'],
  ['Green-GO', 'ab', 'Green GO'],
  ['Pliant Technologies', 'ab', 'Pliant, CrewCom'],
  ['Unity Intercom', 'a', 'Unity'],

  // ── Video production / broadcast ──
  ['Blackmagic Design', 'vb', 'ATEM, HyperDeck, Videohub, DaVinci Resolve, URSA, Teranex, UltraStudio, DeckLink'],
  ['Ross Video', 'vbc', 'Ross, Carbonite, Acuity, Ultrix, XPression, DashBoard, openGear'],
  ['Grass Valley', 'vb', 'Kahuna, K-Frame, LDX, AMPP'],
  ['Panasonic Connect', 'vbd', 'Panasonic, Kairos, AW-UE, PT-RQ'],
  ['Canon', 'vbd', 'Cinema EOS, CR-N'],
  ['JVCKENWOOD', 'vbd', 'JVC'],
  ['Ikegami', 'vb', ''],
  ['Hitachi Kokusai', 'vb', ''],
  ['Marshall Electronics', 'vb', 'Marshall'],
  ['BirdDog', 'vb', ''],
  ['PTZOptics', 'vk', ''],
  ['AJA Video Systems', 'vb', 'AJA, KUMO, Ki Pro'],
  ['Matrox Video', 'vb', 'Matrox, Monarch, Maevex'],
  ['Vizrt', 'vb', 'NewTek, TriCaster, NDI'],
  ['Evertz', 'vb', 'EQX, MAGNUM'],
  ['Imagine Communications', 'vb', 'Imagine'],
  ['Harmonic', 'vb', ''],
  ['Telestream', 'vb', 'Wirecast, Telestream PRISM'],
  ['EVS Broadcast Equipment', 'vb', 'EVS, XT-VIA, LSM'],
  ['Chyron', 'vb', 'ChyronHego, PRIME'],
  ['Leader Electronics', 'vb', 'Leader, LV5600'],
  ['PHABRIX', 'vb', 'Phabrix, Qx'],
  ['Decimator Design', 'v', 'Decimator'],
  ['Cobalt Digital', 'vb', ''],
  ['Lynx Technik', 'vb', ''],
  ['Ensemble Designs', 'vb', 'BrightEye'],
  ['FOR-A', 'vb', 'For-A, HANABI'],
  ['Datavideo', 'vb', ''],
  ['Roland Professional A/V', 'avb', 'Roland, V-160HD, VR-'],
  ['Analog Way', 'vd', 'Aquilon, Midra, LivePremier'],
  ['Barco', 'vdk', 'E2, S3, ClickShare, Encore, UDX'],
  ['OSEE', 'vb', ''],
  ['Atomos', 'vb', 'Ninja, Shogun'],
  ['SmallHD', 'vb', ''],
  ['Teradek', 'vb', 'Bolt, Teradek Prism, Cube'],
  ['Vislink', 'vb', ''],
  ['Dejero', 'vbn', ''],
  ['LiveU', 'vbn', ''],
  ['TVU Networks', 'vbn', 'TVU'],
  ['Haivision', 'vbn', 'Makito, SRT'],
  ['Epiphan Video', 'vb', 'Epiphan, Pearl'],
  ['Magewell', 'vb', ''],
  ['Elgato', 'vc', 'Stream Deck, Corsair'],
  ['Shotoku Broadcast Systems', 'vb', 'Shotoku'],
  ['Vinten', 'vb', 'Videndum'],
  ['Sachtler', 'vb', ''],
  ['Telemetrics', 'vb', ''],
  ['ARRI', 'vbl', 'ALEXA, SkyPanel, Orbiter'],
  ['RED Digital Cinema', 'vb', 'RED, KOMODO, V-RAPTOR'],

  // ── Media servers / show control ──
  ['disguise', 'vc', 'd3, vx, gx, rx'],
  ['AV Stumpfl', 'vd', 'PIXERA'],
  ['7thSense', 'vc', 'Medialon, Delta'],
  ['Modulo Pi', 'v', 'Modulo Kinetic'],
  ['Resolume', 'v', 'Resolume Arena, Resolume Avenue'],
  ['Brainstorm Electronics', 'vc', 'Brainstorm, distripalyzer'],
  ['Bitfocus', 'c', 'Companion'],
  ['SKAARHOJ', 'c', 'Skaarhoj'],

  // ── Displays, projection, LED, screens ──
  ['Christie Digital', 'd', 'Christie, Griffyn, Pandoras Box'],
  ['Epson', 'd', 'Pro L, EB-PU'],
  ['Sharp NEC Display Solutions', 'd', 'NEC, Sharp'],
  ['LG Electronics', 'd', 'LG'],
  ['Samsung', 'd', 'The Wall, Smart Signage'],
  ['Optoma', 'd', ''],
  ['ViewSonic', 'd', ''],
  ['BenQ', 'd', ''],
  ['Digital Projection', 'd', ''],
  ['Planar', 'd', 'Leyard Planar'],
  ['Leyard', 'd', ''],
  ['Absen', 'd', ''],
  ['ROE Visual', 'd', 'ROE, Black Pearl, Carbon'],
  ['Unilumin', 'd', ''],
  ['INFiLED', 'd', 'Infiled'],
  ['AOTO', 'd', ''],
  ['Daktronics', 'd', ''],
  ['Brompton Technology', 'd', 'Brompton, Tessera'],
  ['NovaStar', 'd', 'MX Series, COEX'],
  ['Megapixel', 'd', 'Megapixel VR, HELIOS'],
  ['Colorlight', 'd', ''],
  ['Avocor', 'dk', ''],
  ['Da-Lite', 'd', ''],
  ['Draper', 'd', ''],
  ['Stewart Filmscreen', 'd', 'Stewart'],
  ['Screen Innovations', 'd', ''],
  ['Elite Screens', 'd', ''],

  // ── Switching, extension, AV-over-IP, collaboration ──
  ['Extron', 'avc', 'XTP, DTP, NAV, IN1608, TouchLink'],
  ['Crestron', 'avck', 'DigitalMedia, DM NVX, Flex, 3-Series, 4-Series'],
  ['AMX', 'vc', 'NetLinx, SVSi, N-Series'],
  ['Kramer Electronics', 'avc', 'Kramer'],
  ['Atlona', 'vc', ''],
  ['Lightware', 'v', 'UBEX, Taurus, MX2'],
  ['Black Box', 'vn', 'Black Box, Emerald'],
  ['Gefen', 'v', ''],
  ['Aurora Multimedia', 'vc', 'Aurora'],
  ['Liberty AV Solutions', 'vi', 'Liberty, DigitaLinx'],
  ['Intelix', 'v', ''],
  ['Key Digital', 'vc', ''],
  ['Just Add Power', 'v', 'J+P'],
  ['ZeeVee', 'v', ''],
  ['IHSE', 'v', 'Draco'],
  ['Adder Technology', 'v', 'Adder, AdderLink'],
  ['Apantac', 'v', ''],
  ['tvONE', 'v', 'CORIOmaster, Magenta'],
  ['Datapath', 'v', 'Aetria, Fx4'],
  ['WyreStorm', 'v', ''],
  ['Pulse-Eight', 'v', 'Pulse Eight'],
  ['AVPro Edge', 'v', ''],
  ['Blustream', 'v', ''],
  ['Vaddio', 'vk', ''],
  ['Lumens', 'vk', ''],
  ['AVer Information', 'vk', 'AVer'],
  ['Huddly', 'vk', ''],
  ['Owl Labs', 'vk', 'Meeting Owl'],
  ['ClearOne', 'ak', ''],
  ['Nureva', 'ak', ''],
  ['HP Poly', 'ak', 'Poly, Polycom'],
  ['Cisco', 'kn', 'Webex Devices, Catalyst'],
  ['Logitech', 'k', 'Rally, Tap'],
  ['Yealink', 'k', ''],
  ['Neat', 'k', ''],
  ['Jabra', 'k', 'PanaCast'],

  // ── Control & automation ──
  ['Universal Remote Control', 'c', 'URC, Total Control'],
  ['Control4', 'c', ''],
  ['Snap One', 'ci', 'SnapAV, Araknis, WattBox, Binary'],
  ['Savant', 'c', ''],
  ['RTI', 'c', 'Remote Technologies Inc.'],
  ['Global Caché', 'c', 'iTach, GC-100'],
  ['Lutron', 'cl', 'HomeWorks, RadioRA, Athena'],
  ['Neets', 'c', ''],

  // ── Lighting ──
  ['ETC', 'lc', 'Electronic Theatre Controls, Eos, Ion, Gio, Source Four, Paradigm'],
  ['MA Lighting', 'lc', 'grandMA3, grandMA2, dot2'],
  ['Robe Lighting', 'l', 'Robe, BMFL, MegaPointe, FORTE'],
  ['Martin Professional', 'l', 'Martin, MAC Aura, MAC Viper'],
  ['Claypaky', 'l', 'Clay Paky, Sharpy'],
  ['Chauvet Professional', 'l', 'Chauvet, Maverick, Rogue'],
  ['Elation Professional', 'l', 'Elation, Proteus'],
  ['GLP', 'l', 'German Light Products, JDC1, impression'],
  ['Ayrton', 'l', ''],
  ['High End Systems', 'lc', 'Hog 4, HOG'],
  ['Vari-Lite', 'l', 'Vari*Lite, VL'],
  ['Signify', 'l', 'Philips Lighting, Color Kinetics'],
  ['Avolites', 'lv', 'Titan, Diamond, Ai'],
  ['ChamSys', 'lc', 'MagicQ'],
  ['Obsidian Control Systems', 'lc', 'Onyx'],
  ['Zero 88', 'lc', 'FLX'],
  ['LSC Lighting Systems', 'lp', 'LSC, Mantra, APS'],
  ['Pathway Connectivity', 'ln', 'Pathport, Cognito'],
  ['City Theatrical', 'l', 'SHoW DMX'],
  ['Doug Fleenor Design', 'l', 'DFD'],
  ['Swisson', 'ln', ''],
  ['Visual Productions', 'lc', 'CueCore, QuickDMX'],
  ['Pharos Architectural Controls', 'lc', 'Pharos'],
  ['Rosco', 'l', ''],
  ['Altman Lighting', 'l', 'Altman'],
  ['Robert Juliat', 'l', ''],
  ['Litepanels', 'l', 'Gemini, Astra'],
  ['Aputure', 'l', 'Amaran'],
  ['Kino Flo', 'l', ''],
  ['Astera', 'l', 'Titan Tube, AX'],
  ['Prolights', 'l', 'Music & Lights'],
  ['Cameo', 'l', 'Adam Hall'],
  ['ADJ', 'l', 'American DJ'],
  ['SGM', 'l', ''],
  ['JB-Lighting', 'l', 'JB Lighting'],
  ['Chroma-Q', 'l', 'Chroma Q'],
  ['TMB', 'lp', 'ProPlex'],
  ['Blizzard Lighting', 'l', 'Blizzard'],
  ['Showtec', 'l', 'Highlite International'],
  ['Strand Lighting', 'lc', 'Strand'],

  // ── Networking ──
  ['Luminex', 'nl', 'GigaCore, LumiNode'],
  ['NETGEAR', 'n', 'Netgear, M4250, AV Line'],
  ['Extreme Networks', 'n', ''],
  ['Ubiquiti', 'n', 'UniFi'],
  ['HPE Aruba Networking', 'n', 'Aruba'],
  ['Arista Networks', 'n', 'Arista'],
  ['Planet Technology', 'n', 'PLANET'],
  ['Ruckus Networks', 'n', 'Ruckus'],

  // ── Racks, mounts, cabling, connectors, patching ──
  ['Middle Atlantic Products', 'i', 'Middle Atlantic'],
  ['Chief', 'i', ''],
  ['Peerless-AV', 'i', 'Peerless'],
  ['Premier Mounts', 'i', ''],
  ['Sanus', 'i', ''],
  ['B-Tech AV Mounts', 'i', 'B-Tech'],
  ["Vogel's", 'i', 'Vogels'],
  ['Gator Cases', 'i', 'Gator'],
  ['SKB Cases', 'i', 'SKB'],
  ['Penn Elcom', 'i', ''],
  ['Neutrik', 'i', 'etherCON, powerCON, speakON, opticalCON'],
  ['Canare', 'i', ''],
  ['Belden', 'i', ''],
  ['Gepco', 'i', ''],
  ['West Penn Wire', 'i', ''],
  ['Mogami', 'i', ''],
  ['Van Damme Cable', 'i', 'Van Damme'],
  ['Sommer Cable', 'i', ''],
  ['Klotz', 'i', ''],
  ['Whirlwind', 'ia', ''],
  ['Switchcraft', 'i', ''],
  ['Amphenol', 'i', ''],
  ['LEMO', 'i', ''],
  ['Fischer Connectors', 'i', ''],
  ['Bittree', 'i', ''],
  ['Redco Audio', 'i', 'Redco'],
  ['Canford', 'i', 'Canford Audio'],
  ['Ghielmetti', 'i', ''],
  ['CommScope', 'in', 'ADC'],
  ['Panduit', 'in', ''],
  ['Leviton', 'inl', ''],
  ['Hubbell', 'ip', ''],
  ['Corning', 'in', ''],

  // ── Power ──
  ['Furman', 'p', 'Furman Sound'],
  ['SurgeX', 'p', ''],
  ['Panamax', 'p', ''],
  ['APC', 'p', 'Schneider Electric'],
  ['Eaton', 'p', 'Tripp Lite'],
  ['Vertiv', 'p', 'Liebert'],
  ['Motion Labs', 'pr', ''],

  // ── Rigging & staging ──
  ['CM Entertainment', 'r', 'Columbus McKinnon, CM-Lodestar, Lodestar'],
  ['Kinesys', 'r', ''],
  ['Tomcat', 'r', ''],
  ['Prolyte', 'r', ''],
  ['Eurotruss', 'r', ''],
  ['Global Truss', 'r', ''],
  ['James Thomas Engineering', 'r', 'JTE'],
  ['Wenger', 'r', 'Wenger Corporation, J.R. Clancy'],
  ['TAIT', 'r', 'Tait Towers'],
  ['Movecat', 'r', ''],
  ['Chainmaster', 'r', ''],
]

function build(): Manufacturer[] {
  return ROWS.map(([name, codes, aliases]) => ({
    name,
    categories: [...new Set([...codes].map((c) => CODE[c]).filter(Boolean))],
    aliases: (aliases ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    source: 'builtIn' as const,
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export const BUILT_IN_MANUFACTURERS: Manufacturer[] = build()

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/gi, 'o').toLowerCase().trim()

export interface MakerMatch { maker: Manufacturer; via?: string }

/** Built-in + user-added manufacturers with name/alias lookup and search. */
export class ManufacturerDirectory {
  readonly all: Manufacturer[]
  private readonly byName = new Map<string, Manufacturer>()

  constructor(builtIn: Manufacturer[], user: Manufacturer[] = [], extraNames: string[] = []) {
    const list = [...builtIn]
    for (const u of user) if (!list.some((m) => fold(m.name) === fold(u.name))) list.push({ ...u, source: 'user' })
    // Makers referenced by saved products but never registered still appear.
    for (const n of extraNames) {
      if (n.trim() && !list.some((m) => fold(m.name) === fold(n))) list.push({ name: n.trim(), categories: [], aliases: [], source: 'user' })
    }
    this.all = list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    for (const m of this.all) this.byName.set(fold(m.name), m)
  }

  /** Exact name match, case/accent-insensitive. */
  get(name: string) { return this.byName.get(fold(name)) }

  /** Resolve a name or product-line alias (e.g. "dLive" → Allen & Heath). */
  resolve(text: string): MakerMatch | undefined {
    const f = fold(text)
    if (!f) return undefined
    const m = this.byName.get(f)
    if (m) return { maker: m }
    for (const x of this.all) {
      const a = x.aliases.find((al) => fold(al) === f)
      if (a) return { maker: x, via: a }
    }
    return undefined
  }

  /** Ranked search over names and aliases. */
  search(q: string, category?: MakerCategory | null, limit = Infinity): MakerMatch[] {
    const f = fold(q)
    const out: [number, MakerMatch][] = []
    for (const m of this.all) {
      if (category && !m.categories.includes(category)) continue
      if (!f) { out.push([0, { maker: m }]); continue }
      const n = fold(m.name)
      let score = n === f ? 100 : n.startsWith(f) ? 80 : n.split(/[\s&-]+/).some((w) => w.startsWith(f)) ? 60 : n.includes(f) ? 40 : 0
      let via: string | undefined
      if (score < 60) {
        for (const a of m.aliases) {
          const fa = fold(a)
          const s = fa === f ? 70 : fa.startsWith(f) ? 50 : fa.includes(f) ? 20 : 0
          if (s > score) { score = s; via = a }
        }
      }
      if (score > 0) out.push([score, { maker: m, via }])
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].maker.name.localeCompare(b[1].maker.name)).slice(0, limit).map(([, x]) => x)
  }
}

/** Sensible maker categories for a new manufacturer, guessed from a product category. */
export function guessMakerCategories(productCategory: string): MakerCategory[] {
  const map: Record<string, MakerCategory> = {
    projector: 'display', display: 'display', ledProcessor: 'display',
    videoSwitcher: 'video', matrixSwitcher: 'video', scaler: 'video', extender: 'video', encoder: 'video', decoder: 'video', camera: 'video', mediaPlayer: 'video',
    dsp: 'audio', mixer: 'audio', amplifier: 'audio', loudspeaker: 'audio', microphone: 'audio', wirelessReceiver: 'audio', audioInterface: 'audio',
    networkSwitch: 'network', controlProcessor: 'control', touchPanel: 'control',
    lightingConsole: 'lighting', lightingFixture: 'lighting', dimmer: 'lighting', dmxNode: 'lighting',
    patchBay: 'infrastructure', pdu: 'power', ups: 'power', rackAccessory: 'infrastructure',
  }
  return map[productCategory] ? [map[productCategory]] : []
}

// Document data model. Plain JSON-serialisable objects: the `.rackflow` file is
// literally `JSON.stringify(project)`. Mutating helpers in project.ts are written
// to work on Immer drafts, so every edit is an immutable update + undo snapshot.

import type { ConnectorType, Gender, SignalDomain, SignalType } from './signals'

type Brand<T, B extends string> = T & { readonly __brand: B }
export type EquipmentId = Brand<string, 'Equipment'>
export type CableId = Brand<string, 'Cable'>
export type RackId = Brand<string, 'Rack'>
export type PatchBayId = Brand<string, 'PatchBay'>
export type AccessoryId = Brand<string, 'Accessory'>

export const newId = <T extends string>(): T => crypto.randomUUID() as T

export type PortDirection = 'input' | 'output' | 'bidirectional'
export type PanelFace = 'front' | 'rear'

export interface PortTemplate {
  /** Stable within its product, e.g. "in.mic.03". */
  id: string
  label: string
  connector: ConnectorType
  gender: Gender
  direction: PortDirection
  /** Ordered by preference; the first is the port's primary signal. */
  signals: SignalType[]
  group?: string
  face: PanelFace
  maxConnections: number
  /** For power outlets: watts available from this outlet. */
  powerCapacityWatts?: number
}

export type EquipmentCategory =
  | 'projector' | 'display' | 'ledProcessor'
  | 'videoSwitcher' | 'matrixSwitcher' | 'scaler' | 'extender' | 'encoder' | 'decoder' | 'camera' | 'mediaPlayer'
  | 'dsp' | 'mixer' | 'amplifier' | 'loudspeaker' | 'microphone' | 'wirelessReceiver' | 'audioInterface'
  | 'networkSwitch' | 'controlProcessor' | 'touchPanel'
  | 'lightingConsole' | 'lightingFixture' | 'dimmer' | 'dmxNode'
  | 'intercom' | 'conferencing' | 'recorder' | 'converter'
  | 'patchBay' | 'wallBox' | 'wallPlate' | 'floorBox' | 'connectorPanel' | 'fiberEnclosure' | 'powerSource' | 'pdu' | 'ups' | 'computer' | 'rackAccessory' | 'other'

export const CATEGORIES: Record<EquipmentCategory, { name: string; tag: string }> = {
  projector: { name: 'Projector', tag: 'PJ' },
  display: { name: 'Display', tag: 'DISP' },
  ledProcessor: { name: 'LED Processor', tag: 'LEDP' },
  videoSwitcher: { name: 'Video Switcher', tag: 'SW' },
  matrixSwitcher: { name: 'Matrix Switcher', tag: 'SW' },
  scaler: { name: 'Scaler', tag: 'SCL' },
  extender: { name: 'Extender', tag: 'EXT' },
  encoder: { name: 'Encoder', tag: 'ENC' },
  decoder: { name: 'Decoder', tag: 'DEC' },
  camera: { name: 'Camera', tag: 'CAM' },
  mediaPlayer: { name: 'Media Player', tag: 'MP' },
  dsp: { name: 'DSP', tag: 'DSP' },
  mixer: { name: 'Mixer', tag: 'MIX' },
  amplifier: { name: 'Amplifier', tag: 'AMP' },
  loudspeaker: { name: 'Loudspeaker', tag: 'LS' },
  microphone: { name: 'Microphone', tag: 'MIC' },
  wirelessReceiver: { name: 'Wireless Receiver', tag: 'WRX' },
  audioInterface: { name: 'Audio Interface', tag: 'AIF' },
  networkSwitch: { name: 'Network Switch', tag: 'NSW' },
  controlProcessor: { name: 'Control Processor', tag: 'CP' },
  touchPanel: { name: 'Touch Panel', tag: 'TP' },
  lightingConsole: { name: 'Lighting Console', tag: 'LC' },
  lightingFixture: { name: 'Lighting Fixture', tag: 'FX' },
  dimmer: { name: 'Dimmer', tag: 'DIM' },
  dmxNode: { name: 'DMX Node', tag: 'DMXN' },
  intercom: { name: 'Intercom', tag: 'IC' },
  conferencing: { name: 'Conferencing', tag: 'VC' },
  recorder: { name: 'Recorder / Player', tag: 'REC' },
  converter: { name: 'Converter', tag: 'CNV' },
  patchBay: { name: 'Patch Bay', tag: 'PB' },
  wallPlate: { name: 'Wall Plate', tag: 'WP' },
  wallBox: { name: 'Wall Box', tag: 'WB' },
  floorBox: { name: 'Floor Box / Stage Pocket', tag: 'FB' },
  connectorPanel: { name: 'Connector Panel (rack)', tag: 'CNP' },
  fiberEnclosure: { name: 'Fiber Enclosure', tag: 'FIB' },
  powerSource: { name: 'Building Power', tag: 'PWR' },
  pdu: { name: 'PDU', tag: 'PDU' },
  ups: { name: 'UPS', tag: 'UPS' },
  computer: { name: 'Computer', tag: 'PC' },
  rackAccessory: { name: 'Rack Accessory', tag: 'EQ' },
  other: { name: 'Other', tag: 'EQ' },
}
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as EquipmentCategory[]

export type MountType = 'rack' | 'shelf' | 'wall' | 'ceiling' | 'floor' | 'truss' | 'desk' | 'portable'
export const MOUNT_TYPES: MountType[] = ['rack', 'shelf', 'wall', 'ceiling', 'floor', 'truss', 'desk', 'portable']

export interface PhysicalSpec {
  /** Height in rack units; null if not rack-mountable. */
  rackUnits: number | null
  halfWidth: boolean
  widthMM: number
  heightMM: number
  depthMM: number
  weightKG: number
  mounting: MountType
}

export interface PowerSpec {
  acceptedVoltages: SignalType[]
  typicalWatts: number
  maxWatts: number
  /** Manufacturer-published heat; when null it's derived from typical draw. */
  publishedBTU: number | null
  /** Amplifiers: share of input power delivered to loudspeakers (0–1). */
  efficiency: number | null
  poweredByPoE: boolean
}

export type ProductSource = 'builtIn' | 'user' | 'imported'

export interface ProductDefinition {
  key: string
  manufacturer: string
  model: string
  summary: string
  category: EquipmentCategory
  tags: string[]
  physical: PhysicalSpec
  power: PowerSpec
  ports: PortTemplate[]
  source: ProductSource
  /** Bumped on every save; lets projects detect stale embedded snapshots. */
  revision: number
  /** Catalog entries: false = I/O from the RackFlow catalog, physical/power approximate. */
  verified?: boolean
  /** Provenance / caveat shown in the inspector. */
  dataNote?: string
  /** Building power / generator: the supply this source provides (defaults for its circuit). */
  supply?: PowerSupply
  /** Wall plates / floor boxes: the layout they were built from (re-opened by the plate builder). */
  plate?: PlateSpec
  /** Modular fiber enclosure (slots, cassettes / panels, engravings). */
  fiber?: import('./fiber').FiberSpec
}

export type PlateKind = 'wallBox' | 'wallPlate' | 'floorBox' | 'rackPanel'
/** How the back of an insert is terminated. */
export type PlateRear = 'same' | 'idcPunchdown' | 'euroblock' | 'none'
export interface PlateInsert {
  /** Key into PLATE_MODULES. */
  module: string
  count: number
  /** Optional label prefix, e.g. "Podium Mic". */
  label?: string
  rear: PlateRear
  /** Fixed port id base for a single placed jack (designer); keeps cables attached when others are removed. */
  pid?: string
  /** Wired inside the box to this multipin (its pid): the jack is also one of the multipin's channels (its own tie line stays). */
  tie?: string
}

/** Free text placed on a plate face (mm, centre / start / end anchored). */
export interface PlateText { id: string; x: number; y: number; text: string; size: number; bold?: boolean; align?: 'start' | 'middle' | 'end' }

/** The designed face of a plate / box / panel (mm). */
export interface PlateLayout {
  w: number
  h: number
  shape?: 'rect' | 'round'
  finish: 'white' | 'ivory' | 'black' | 'blackAnodized' | 'stainless' | 'aluminum' | 'clearAnodized'
  /** Snap grid (mm); 0 = off. */
  grid: number
  labelPos: 'below' | 'above' | 'none'
  /** Jack centre per insert pid. */
  jacks: Record<string, { x: number; y: number }>
  texts: PlateText[]
}
export interface PlateSpec {
  kind: PlateKind
  /** e.g. "2-Gang", "Decora", "4-Compartment", "Stage Pocket". */
  style: string
  inserts: PlateInsert[]
  /** If the box has receptacles: the circuit feeding them. */
  power?: { volts: number; amps: number }
  /** Designer layout (where each jack sits, text, finish). */
  layout?: PlateLayout
}

/** What a building receptacle, panel feed or generator can deliver. */
export interface PowerSupply {
  volts: number
  /** Breaker / overcurrent protection rating. */
  amps: number
  phases: 1 | 3
}

/** Where a power source comes from in the building, set per placed source. */
export interface CircuitInfo {
  panel: string
  circuit: string
  /** Overrides the product's supply.amps (e.g. a 20 A receptacle on a 15 A breaker). */
  breakerAmps?: number
  /** Overrides the product's supply.volts (e.g. 208 V vs 240 V). */
  volts?: number
  /** Continuous-load limit as a fraction of the breaker (NEC 80 % rule by default). */
  continuousFactor?: number
}

export interface CanvasPoint { x: number; y: number }

export interface RackPlacement {
  rack: RackId
  /** Lowest occupied unit, 1-based from the bottom. */
  startUnit: number
  face: RackFace
  halfSlot?: 'left' | 'right'
}

/** A placed device. Embeds its product snapshot so files are self-contained. */
export interface EquipmentInstance {
  id: EquipmentId
  tag: string
  product: ProductDefinition
  /** Card size on a signal view (set by the view, not saved on the device). */
  nodeSize?: 'small' | 'medium' | 'full'
  position: CanvasPoint
  rackPlacement: RackPlacement | null
  room: string
  notes: string
  /** Device group (a box drawn round it on every page and view it appears on). */
  cluster?: string
  /** Wall boxes / plates: this box's fabrication-sheet notes (replaces the automatic ones when set). */
  fabNotes?: string[]
  /** Heading over those notes (default "NOTES"). */
  fabNotesTitle?: string
  /** Power sources only: panel / circuit / breaker. */
  circuit?: CircuitInfo
  /** Diagram group (system) this device belongs to. */
  groupId?: string
  /** Wiring-diagram card: port sections folded shut (by section name), or the whole I/O hidden. */
  collapsed?: string[]
  ioHidden?: boolean
  /** Leave the plate / panel face drawing off the card (printed wiring diagrams). */
  noFace?: boolean
  /** Box ports: project-wide port numbers (front port id → "M11") and the jack names they replaced. */
  portNumbers?: Record<string, string>
  /** Port numbers set by hand (front port id → true): Renumber leaves them where they are. */
  portLocks?: Record<string, true>
  portBaseLabels?: Record<string, string>
  /** Network sheet: addressing per network port (key = port id, or 'mgmt' for a switch). */
  network?: Record<string, NetInfo>
}

/** One network interface's addressing on the Network sheet. */
export interface NetInfo {
  ip?: string
  /** VLAN ID: the access (untagged / native) VLAN on a switch port, or the interface's VLAN on a device. */
  vlan?: string
  /** Switch ports: access (one untagged VLAN) or trunk (tagged VLANs plus an optional native one). */
  mode?: 'access' | 'trunk'
  /** Switch trunk ports: tagged VLANs, e.g. "10,20,100-110". */
  tagged?: string
  /** Manual switch / port when the cable path doesn't reach a switch (yet). */
  switchTag?: string
  switchPort?: string
  notes?: string
}

/**
 * A group of devices drawn as a labelled box round them – on whichever page or
 * view they appear (e.g. "FOH Rack", "Stage Left"). Independent of pages and rooms.
 */
export interface Cluster {
  id: string
  name: string
  color?: string
  /** Page or signal view the box was drawn on (null = All pages). */
  scope?: string | null
  /** The box, in diagram units. */
  x?: number
  y?: number
  w?: number
  h?: number
}

/** A named system on the wiring diagram (e.g. "FOH Audio", "Stage Video"). */
export interface DeviceGroup {
  id: string
  name: string
  /** Colour family; 'custom' uses `color`. */
  system: SignalDomain | 'custom'
  color?: string
  /** Custom sheet number (e.g. "AV101"); empty = automatic. */
  number?: string
}

export interface PortAddress { equipment: EquipmentId; port: string }
export const addrKey = (a: PortAddress) => `${a.equipment}/${a.port}`
export const sameAddr = (a: PortAddress, b: PortAddress) => a.equipment === b.equipment && a.port === b.port

export interface Cable {
  id: CableId
  /** Printed label, e.g. "V-0012". */
  label: string
  /** By convention `from` is the source side. */
  from: PortAddress
  to: PortAddress
  specKey: string | null
  lengthMeters: number | null
  notes: string
  /** Jacket colour (name from CABLE_COLORS, or any text). */
  color?: string
  /** Pull schedule: the route it takes and install progress. */
  pull?: CablePull
}
export interface CablePull { pathway?: string; pulled?: boolean; terminated?: boolean; tested?: boolean }

export type RackFace = 'front' | 'rear'

export interface RackSpec {
  rackUnits: number
  mountingDepthMM: number
  maxLoadKG: number
  coolingCapacityBTU: number | null
}

export type AccessoryKind = 'blank' | 'logo' | 'vent' | 'brush' | 'lacing' | 'cableManager' | 'shelf' | 'drawer'
export interface RackAccessory {
  id: AccessoryId
  kind: AccessoryKind
  startUnit: number
  height: number
  face: RackFace
  /** Text on the elevation (defaults to e.g. "BLANK PANEL"). */
  label?: string
  /** Logo blanks: image from project.logos. */
  logoId?: string
  /** Logo blanks: background colour of the panel face. */
  finish?: 'black' | 'white' | 'silver'
}

export interface Rack {
  id: RackId
  name: string
  spec: RackSpec
  accessories: RackAccessory[]
}

/** How wires are drawn: every wire in full, long / tangled runs as labelled stubs, or all as stubs. */
export type WireMode = 'all' | 'smart' | 'stubs'
export interface DiagramSettings {
  autoTidy?: boolean
  wires?: WireMode
  /** Automatic page numbers (prefix + start); unset = pages aren't numbered. */
  numbering?: import('./sheetnumbers').SheetNumbering
  /** Custom number for the sheet of devices that aren't on a page. */
  generalNumber?: string
  /** Card design the layout was made for (2 = sectioned cards 1.8, 3 = front/rear headings 1.8.13). */
  cards?: number
}
export interface LogoAsset { id: string; name: string; /** data: URL (PNG / JPEG / SVG). */ dataUrl: string; /** Light / white artwork on a transparent background – printed in black on drawings. */ light?: boolean }

export type AnnotationKind = 'callout' | 'note' | 'revision'
/** A note placed anywhere on the wiring diagram (and printed on its page). */
export interface Annotation {
  id: string
  kind: AnnotationKind
  x: number
  y: number
  w: number
  h: number
  text: string
  /** Page (group id) it belongs to; undefined = the general page. */
  page?: string
  /** Callouts: where the leader arrow points (diagram coordinates). */
  leader?: CanvasPoint
  /** Revision notes: which revision (e.g. "B"). */
  rev?: string
}

export interface Revision { id: string; rev: string; date: string; description: string; by: string }

export interface ProjectInfo { name: string; client: string; designer: string; revision: string; location?: string }

/** Shared to the RackFlow web viewer: the cloud copy this file keeps in sync. */
export interface CloudLink { id: string; owner: string }

export interface Project {
  schemaVersion: number
  info: ProjectInfo
  /** Set while the project is shared to the web viewer (kept in the file so it stays linked). */
  cloud?: CloudLink
  equipment: EquipmentInstance[]
  cables: Cable[]
  racks: Rack[]
  patchBays: PatchBay[]
  /** Diagram groups / systems. */
  groups?: DeviceGroup[]
  /** Wiring diagram view settings. */
  diagram?: DiagramSettings
  /** Images used on drawings (logo blank panels, title block). */
  logos?: LogoAsset[]
  /** Callouts, notes and revision notes placed on the wiring diagram. */
  annotations?: Annotation[]
  /** Revision history (newest last), printed in the revision block. */
  revisions?: Revision[]
  /** LED walls (panel grid + data / power mapping). */
  ledWalls?: import('./led').LedWall[]
  /** Custom LED panels made in this project. */
  ledPanels?: import('./led').LedPanel[]
  /** Signal views: pages showing chosen devices with only some signal types. */
  views?: import('./views').SignalView[]
  /** This project's title block (layout + logo); unset = the standard one. */
  titleBlock?: import('./titleblock').TitleBlockTemplate
  /** Tag / cable label numbering standard; unset = RackFlow's default. */
  numbering?: import('./numbering').NumberingStandard
  /** Device groups (boxes round devices on the diagram and print). */
  clusters?: Cluster[]
}

// --- Patch bays (types here to keep the document schema in one file) ---

export type PatchFormat = 'ttBantam' | 'longFrame' | 'quarterInchTRS' | 'bncVideo' | 'bnc12G' | 'midsizeVideo' | 'rj45' | 'fiberLC' | 'xlr'
export type Normalling = 'open' | 'half' | 'full' | 'isolated'

/** Exact designation-strip geometry in millimetres.
 *  Uniform mode: centre(i) = firstChannelCenterMM + i·channelPitchMM + ⌊i / groupSize⌋·groupGapMM.
 *  Per-cell mode (PatchCAD-style, when cellWidthsMM is set): cells laid left to right from
 *  padLeftMM with their own widths and optional gaps after any cell; the strip is
 *  padLeft + Σwidths + Σgaps + padRight wide. */
export interface LabelStripGeometry {
  stripWidthMM: number
  stripHeightMM: number
  channelCount: number
  channelPitchMM: number
  firstChannelCenterMM: number
  groupSize: number | null
  groupGapMM: number
  linesPerCell: number
  /** Per-cell widths (length = channelCount). */
  cellWidthsMM?: number[]
  /** Gap after cell n (1-based key), in mm. */
  gapsAfterMM?: Record<string, number>
  padLeftMM?: number
  padRightMM?: number
  /** Inset of the text area from the strip's top / bottom edge. */
  padTopMM?: number
  padBottomMM?: number
  /** Socket layout under the strip (drawn as a guide; PatchCAD's "Mono Spaced" / "Paired"). */
  socketLayout?: 'mono' | 'paired'
  /** Paired layout: centre-to-centre distance between the two sockets of a pair. */
  pairSpacingMM?: number
  socketDiameterMM?: number
  /** Distance from the strip's bottom edge to the sockets. */
  socketOffsetMM?: number
}

/** How a panel's jacks are terminated. 'rearOnly': classic patch bay (front jacks take patch cords; only the rear is wired). */
export type PatchTermination = 'rearOnly' | 'punchdown' | 'feedThrough' | 'keystonePunchdown' | 'keystoneFeedThrough'
/** Twisted-pair category a network panel (and its cables) is rated for. */
export type CableCategory = 'cat5e' | 'cat6' | 'cat6a' | 'cat8'

export interface PatchRowTemplate { id: number; name: string; strip: LabelStripGeometry; rearDirection: PortDirection }

export interface PatchBayTemplate {
  key: string
  manufacturer: string
  series: string
  format: PatchFormat
  rackUnits: number
  rows: PatchRowTemplate[]
  normalling: Normalling
  rearConnector: ConnectorType
  source: ProductSource
  /** False until checked against the manufacturer's strip template or a real panel. */
  dimensionsVerified: boolean
  notes: string
  /** Label style applied to new bays made from this template. */
  defaultStyle?: Partial<LabelStyle>
  /** Network / fiber / XLR panels: how jacks are terminated (front and rear are both wireable unless 'rearOnly'). */
  termination?: PatchTermination
  /** RJ45 panels: category rating. */
  cableCategory?: CableCategory
  shielded?: boolean
}

/** Per-cell / per-title formatting (PatchCAD-style). Undefined = inherit bay style. */
export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Fixed size in points; undefined = auto-fit to the cell. */
  sizePt?: number
  fontFamily?: string
  color?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
}

export interface LabelCell {
  row: number
  channel: number
  text: string
  /** Typed by hand: never overwritten by "Refresh from Wiring". */
  manual: boolean
  /** Signal-domain tint set by "colour by signal" (separate from user fill). */
  fill: string | null
  style?: CellStyle
}

/** A group title spanning channels start…end on one strip (e.g. "TIE LINES"). */
export interface LabelSpan { id: string; row: number; start: number; end: number; text: string; style?: CellStyle; /** Made by “group by box” from the wiring; editing the text makes it yours. */ auto?: true }

/** Normalling between a row and the row below it, per channel (PatchCAD's ↕ / ↓ row). */
export type NormalMode = 'none' | 'half' | 'full' | 'parallel'
export interface NormalBand { afterRow: number; modes: NormalMode[] }

export interface LabelFormat { template: string; uppercase: boolean; maxCharsPerLine: number }

export interface LabelStyle {
  fontFamily: string
  maxFontPt: number
  minFontPt: number
  showChannelNumbers: boolean
  colorByDomain: boolean
  cellDividers: boolean
}

export interface PatchBay {
  id: PatchBayId
  name: string
  /** Where the bay is installed, e.g. "Console", "Machine Room". */
  location: string
  equipment: EquipmentId
  template: PatchBayTemplate
  format: LabelFormat
  style: LabelStyle
  cells: LabelCell[]
  spans: LabelSpan[]
  normals: NormalBand[]
  /** Background colour per strip row (row id → hex). */
  rowFill: Record<string, string>
  /** Strip ends: a letter per row (row id → "S") with the row's normalling word under it (▼ NORMAL). */
  rowTabs?: { on: boolean; letters?: Record<string, string> }
  /** ▲ / ▼ printed on every port label of a row, pointing at the jacks it names (row id → direction). */
  arrows?: Record<string, RowArrow>
  /** Titles grouping channels that come from the same wall box / plate / floor box (default on). */
  autoTitles?: boolean
}
export type RowArrow = 'up' | 'down'

export const CURRENT_SCHEMA = 1

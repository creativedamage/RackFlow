// LED wall mapping: panels (cabinets) in a grid, split into data chains (one
// per processor output) and power chains (one per circuit), each snaking from
// a home-run corner. Also the LED panel catalog (popular panels + custom).
//
// DATA POLICY: built-in panel specs are nominal (published ranges rounded);
// every built-in ships with verified=false. Check pitch, cabinet size, weight
// and power against the manufacturer's sheet before relying on the numbers.

import { newId, type EquipmentInstance, type ProductDefinition, type PortTemplate, type Project } from './model'

export interface LedPanel {
  key: string
  manufacturer: string
  model: string
  pitchMM: number
  widthMM: number
  heightMM: number
  pxW: number
  pxH: number
  weightKG: number
  maxWatts: number
  typWatts: number
  dataConnector: 'etherCON' | 'rj45'
  powerConnector: 'powerCONTrue1' | 'powerCON'
  source: 'builtIn' | 'user'
  verified: boolean
  notes?: string
}

export type Corner = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'
export type ChainDirection = 'horizontal' | 'vertical'
export type ChainPattern = 'snake' | 'raster'

export interface ChainSettings {
  start: Corner
  direction: ChainDirection
  pattern: ChainPattern
  /** Override for panels per chain (0 / undefined = calculated). */
  maxPanels?: number
}

export interface LedWall {
  id: string
  name: string
  panel: LedPanel
  cols: number
  rows: number
  /** Cells taken out of the grid ("c,r", 0-based from top-left) for irregular shapes. */
  removed: string[]
  data: ChainSettings & { portCapacityPx: number; frameRate: number; bitDepth: number }
  power: ChainSettings & { voltage: number; circuitAmps: number }
  /** Wiring-diagram device that represents this wall. */
  equipmentId?: string
  notes?: string
}

const P = (manufacturer: string, model: string, pitchMM: number, widthMM: number, heightMM: number, weightKG: number, maxWatts: number, notes?: string): LedPanel => ({
  key: `led.${manufacturer}.${model}`.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
  manufacturer, model, pitchMM, widthMM, heightMM,
  pxW: Math.round(widthMM / pitchMM), pxH: Math.round(heightMM / pitchMM),
  weightKG, maxWatts, typWatts: Math.round(maxWatts * 0.35),
  dataConnector: 'etherCON', powerConnector: 'powerCONTrue1', source: 'builtIn', verified: false, notes,
})

/** Popular touring / install panels (nominal specs – verify). */
export const LED_PANELS: LedPanel[] = [
  P('ROE Visual', 'Black Pearl BP2V2', 2.84, 500, 500, 9.3, 190),
  P('ROE Visual', 'Black Onyx BO3', 3.47, 500, 500, 9.5, 190),
  P('ROE Visual', 'Ruby RB2.3', 2.31, 500, 500, 7.9, 180),
  P('ROE Visual', 'Carbon CB5 MKII', 5.77, 600, 1200, 11.6, 450),
  P('ROE Visual', 'Vanish V8T', 8.33, 600, 1200, 9.5, 400),
  P('Absen', 'PL2.5 Pro V10', 2.5, 500, 500, 7.5, 160),
  P('Absen', 'PL3.9 Pro V10', 3.91, 500, 1000, 13, 300),
  P('Absen', 'Polaris PL2.9', 2.9, 500, 500, 7.8, 170),
  P('INFiLED', 'AR2.6', 2.6, 500, 500, 7.9, 175),
  P('INFiLED', 'AR3.9', 3.9, 500, 1000, 13.5, 320),
  P('INFiLED', 'DB2.6', 2.6, 500, 500, 8.2, 180),
  P('Unilumin', 'Upad IV 2.6', 2.6, 500, 500, 7.5, 170),
  P('Unilumin', 'Upad IV 3.9', 3.9, 500, 1000, 12.5, 320),
  P('Leyard', 'CarbonLight CLI 2.6', 2.6, 500, 500, 7.5, 160),
  P('Aoto', 'RM 2.6', 2.6, 500, 500, 7.8, 180),
  P('Gloshine', 'LT 2.6', 2.6, 500, 500, 7.5, 160),
  P('Generic', '2.6 mm 500×500', 2.6, 500, 500, 8, 180, 'Generic placeholder – set your panel’s real specs.'),
  P('Generic', '3.9 mm 500×1000', 3.9, 500, 1000, 13, 320, 'Generic placeholder – set your panel’s real specs.'),
  P('Generic', '3.9 mm 500×500', 3.9, 500, 500, 7, 160, 'Generic placeholder – set your panel’s real specs.'),
]

/** Pixels one 1G processor output can drive at 60 Hz 8-bit (nominal, varies by processor). */
export const PROCESSOR_PRESETS: { key: string; name: string; px: number }[] = [
  { key: 'novastar', name: 'NovaStar 1G port (~650k px)', px: 650_000 },
  { key: 'brompton', name: 'Brompton Tessera 1G port (~525k px)', px: 525_000 },
  { key: 'colorlight', name: 'Colorlight 1G port (~650k px)', px: 650_000 },
  { key: 'megapixel', name: 'Megapixel Helios 1G port (~490k px)', px: 490_000 },
]

export function newLedPanel(): LedPanel {
  return { ...P('Custom', 'New Panel', 2.6, 500, 500, 8, 180), key: `user.led.${newId()}`, source: 'user', verified: true }
}

/** Keeps pixel counts in step with size / pitch. */
export function derivePanel(p: LedPanel): LedPanel {
  return { ...p, pxW: Math.max(1, Math.round(p.widthMM / p.pitchMM)), pxH: Math.max(1, Math.round(p.heightMM / p.pitchMM)) }
}

export function newLedWall(p: Project, panel: LedPanel, cols = 8, rows = 4): LedWall {
  const n = (p.ledWalls?.length ?? 0) + 1
  const w: LedWall = {
    id: newId(), name: `LED Wall ${n}`, panel: structuredClone(panel), cols, rows, removed: [],
    data: { start: 'bottomLeft', direction: 'vertical', pattern: 'snake', portCapacityPx: 650_000, frameRate: 60, bitDepth: 8 },
    power: { start: 'bottomLeft', direction: 'vertical', pattern: 'snake', voltage: 120, circuitAmps: 20 },
  }
  p.ledWalls = [...(p.ledWalls ?? []), w]
  return w
}

// MARK: Chains

export interface Cell { c: number; r: number }
export interface Chain { index: number; cells: Cell[] }

export const cellKey = (c: Cell) => `${c.c},${c.r}`

/** Panels per data chain: pixels one output can drive ÷ pixels per panel (frame rate & bit depth scale it). */
export function dataLimit(w: LedWall): number {
  if (w.data.maxPanels && w.data.maxPanels > 0) return w.data.maxPanels
  const cap = w.data.portCapacityPx * (60 / Math.max(1, w.data.frameRate)) * (8 / Math.max(8, w.data.bitDepth))
  return Math.max(1, Math.floor(cap / (w.panel.pxW * w.panel.pxH)))
}

/** Panels per power chain: 80 % of the circuit ÷ each panel's max draw. */
export function powerLimit(w: LedWall): number {
  if (w.power.maxPanels && w.power.maxPanels > 0) return w.power.maxPanels
  return Math.max(1, Math.floor((w.power.circuitAmps * 0.8 * w.power.voltage) / Math.max(1, w.panel.maxWatts)))
}

/** All present cells in chain order: snake / raster from a corner, column- or row-first. */
export function orderCells(w: LedWall, s: ChainSettings): Cell[] {
  const removed = new Set(w.removed)
  const fromBottom = s.start.startsWith('bottom'), fromRight = s.start.endsWith('Right')
  const out: Cell[] = []
  if (s.direction === 'vertical') {
    for (let i = 0; i < w.cols; i++) {
      const c = fromRight ? w.cols - 1 - i : i
      const up = fromBottom !== (s.pattern === 'snake' && i % 2 === 1)
      for (let j = 0; j < w.rows; j++) out.push({ c, r: up ? w.rows - 1 - j : j })
    }
  } else {
    for (let j = 0; j < w.rows; j++) {
      const r = fromBottom ? w.rows - 1 - j : j
      const rightward = !fromRight !== (s.pattern === 'snake' && j % 2 === 1)
      for (let i = 0; i < w.cols; i++) out.push({ c: rightward ? i : w.cols - 1 - i, r })
    }
  }
  return out.filter((x) => !removed.has(cellKey(x)))
}

/**
 * Splits the order into chains. Column-first walls keep whole columns
 * together where they fit (cleaner home runs); otherwise chains just fill up.
 */
export function chains(w: LedWall, kind: 'data' | 'power'): Chain[] {
  const s = kind === 'data' ? w.data : w.power
  const limit = kind === 'data' ? dataLimit(w) : powerLimit(w)
  const order = orderCells(w, s)
  const lineOf = (x: Cell) => (s.direction === 'vertical' ? x.c : x.r)
  const lineLen = s.direction === 'vertical' ? w.rows : w.cols
  const out: Chain[] = []
  let cur: Cell[] = []
  const flush = () => { if (cur.length) out.push({ index: out.length + 1, cells: cur }); cur = [] }
  // Whole lines per chain when at least one line fits.
  const perChainLines = Math.floor(limit / lineLen)
  if (perChainLines >= 1) {
    const lines: Cell[][] = []
    for (const x of order) { const k = lineOf(x); const last = lines[lines.length - 1]; if (last && lineOf(last[0]) === k) last.push(x); else lines.push([x]) }
    for (const line of lines) {
      if (cur.length && (cur.length + line.length > limit || new Set(cur.map(lineOf)).size >= perChainLines)) flush()
      cur.push(...line)
    }
    flush()
    return out
  }
  for (const x of order) { cur.push(x); if (cur.length >= limit) flush() }
  flush()
  return out
}

export interface WallStats {
  panels: number
  pxW: number
  pxH: number
  widthM: number
  heightM: number
  weightKG: number
  maxWatts: number
  typWatts: number
  maxAmps: number
  dataPorts: number
  circuits: number
  dataLimit: number
  powerLimit: number
  aspect: string
}

export function wallStats(w: LedWall): WallStats {
  const panels = w.cols * w.rows - w.removed.length
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a)
  const pxW = w.cols * w.panel.pxW, pxH = w.rows * w.panel.pxH
  const d = g(pxW, pxH) || 1
  return {
    panels, pxW, pxH, widthM: (w.cols * w.panel.widthMM) / 1000, heightM: (w.rows * w.panel.heightMM) / 1000,
    weightKG: panels * w.panel.weightKG, maxWatts: panels * w.panel.maxWatts, typWatts: panels * w.panel.typWatts,
    maxAmps: (panels * w.panel.maxWatts) / w.power.voltage,
    dataPorts: chains(w, 'data').length, circuits: chains(w, 'power').length,
    dataLimit: dataLimit(w), powerLimit: powerLimit(w),
    aspect: `${(pxW / pxH).toFixed(2)}:1 (${pxW / d}:${pxH / d})`,
  }
}

// MARK: Wiring diagram device

/** A device for the wiring diagram: one data input per processor output, one power input per circuit. */
export function ledWallProduct(w: LedWall): ProductDefinition {
  const st = wallStats(w)
  const ports: PortTemplate[] = [
    ...Array.from({ length: st.dataPorts }, (_, i): PortTemplate => ({ id: `data.${i + 1}`, label: `Data ${i + 1}`, connector: w.panel.dataConnector, gender: 'female', direction: 'input', signals: ['ethernet1G'], group: 'Data', face: 'rear', maxConnections: 1 })),
    ...Array.from({ length: st.circuits }, (_, i): PortTemplate => ({ id: `power.${i + 1}`, label: `Power ${i + 1}`, connector: w.panel.powerConnector, gender: 'male', direction: 'input', signals: w.power.voltage > 150 ? ['ac230V'] : ['ac120V'], group: 'Power', face: 'rear', maxConnections: 1 })),
  ]
  return {
    key: `ledwall.${w.id}`, manufacturer: w.panel.manufacturer, model: `${w.name} (${w.cols}×${w.rows} ${w.panel.model})`,
    summary: `${st.pxW}×${st.pxH} px LED wall, ${st.widthM.toFixed(2)}×${st.heightM.toFixed(2)} m`, category: 'display', tags: ['led', 'ledwall'],
    physical: { rackUnits: null, halfWidth: false, widthMM: w.cols * w.panel.widthMM, heightMM: w.rows * w.panel.heightMM, depthMM: 100, weightKG: st.weightKG, mounting: 'truss' },
    power: { acceptedVoltages: w.power.voltage > 150 ? ['ac230V'] : ['ac120V'], typicalWatts: st.typWatts, maxWatts: Math.max(st.maxWatts, st.typWatts), publishedBTU: null, efficiency: null, poweredByPoE: false },
    ports, source: 'user', revision: 1, verified: w.panel.verified, dataNote: w.panel.verified ? undefined : 'LED panel specs are nominal – check against the manufacturer’s sheet.',
  }
}

/** Creates or refreshes the wall's diagram device (cables on ports that still exist are kept). */
export function syncLedWallDevice(p: Project, wallId: string, at = { x: 0, y: 0 }): EquipmentInstance | null {
  const w = p.ledWalls?.find((x) => x.id === wallId)
  if (!w) return null
  const product = ledWallProduct(w)
  let eq = w.equipmentId ? p.equipment.find((e) => e.id === w.equipmentId) : undefined
  if (eq) {
    eq.product = product
    const ids = new Set(product.ports.map((x) => x.id))
    p.cables = p.cables.filter((c) => !((c.from.equipment === eq!.id && !ids.has(c.from.port)) || (c.to.equipment === eq!.id && !ids.has(c.to.port))))
  } else {
    const tagN = p.equipment.filter((e) => /^LED-\d+$/.test(e.tag)).length + 1
    eq = { id: newId(), tag: `LED-${String(tagN).padStart(2, '0')}`, product, position: at, rackPlacement: null, room: '', notes: '' }
    p.equipment.push(eq)
    w.equipmentId = eq.id
  }
  return eq
}

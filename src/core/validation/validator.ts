import { connectorIsPower, connectorsMate } from '../signals'
import { CABLE_CATALOG, cableSpec, fitLooseness, carries, exactFitCable, orientation, type CableSpec } from '../cables'
import { bestMatch, isUsable, matchScore, type BestMatch } from '../compatibility'
import type { Cable, CableId, PortAddress, PortTemplate, Project } from '../model'
import { resolve, type ResolvedPort } from '../project'
import { SIGNALS, type SignalType } from '../signals'
import { maxSeverity, sortIssues, type Severity, type ValidationIssue } from './issues'
import { STANDARD_RULES, type ConnectionContext, type ConnectionRule } from './rules'

export interface ConnectionVerdict {
  issues: ValidationIssue[]
  allowed: boolean
  severity: Severity | null
  /** [from, to] ordered source → sink. */
  normalized: [PortAddress, PortAddress] | null
  /** The signal that will flow, if usable. */
  signal: SignalType | null
  /** Catalog cables that physically and electrically fit, best first. */
  suggestedCables: CableSpec[]
  /** Set by `connect` when a cable was created. */
  cableId?: CableId
}

export interface ValidateOptions {
  specKey?: string | null
  lengthMeters?: number | null
  ignoringCable?: CableId | null
  rules?: ConnectionRule[]
}

/** Put the driving end first. */
function normalize(a: ResolvedPort, b: ResolvedPort): [ResolvedPort, ResolvedPort] {
  const da = a.port.direction, db = b.port.direction
  if ((da === 'input' && db !== 'input') || (da === 'bidirectional' && db === 'output')) return [b, a]
  return [a, b]
}

/** Bidirectional pairs can flow either way – take the better pairing. */
function bestSignal(source: PortTemplate, sink: PortTemplate): BestMatch | null {
  const fwd = bestMatch(source.signals, sink.signals)
  if (source.direction !== 'bidirectional' || sink.direction !== 'bidirectional') return fwd
  const back = bestMatch(sink.signals, source.signals)
  if (fwd && back) return matchScore(fwd.match) >= matchScore(back.match) ? fwd : back
  return fwd ?? back
}

export function suggestCables(from: PortTemplate, to: PortTemplate, signal: SignalType | null): CableSpec[] {
  const fit = catalogFits(from, to, signal)
  if (fit.length) return fit
  // Nothing in the catalog fits. For power (any plug to any inlet) or matching
  // connector families, suggest a cable made to fit both ends instead of a wrong one.
  // Mismatched signal connectors (HDMI→BNC) stay TBD: they need a converter, not a cable.
  const bothPower = connectorIsPower(from.connector) && connectorIsPower(to.connector)
  return bothPower || connectorsMate(from.connector, to.connector) ? [exactFitCable(from, to)] : []
}

function catalogFits(from: PortTemplate, to: PortTemplate, signal: SignalType | null): CableSpec[] {
  return CABLE_CATALOG
    .filter((s) => orientation(s, from, to) != null)
    .filter((s) => (signal ? carries(s, signal) : true))
    .sort((l, r) => {
      const loose = fitLooseness(l, from, to) - fitLooseness(r, from, to)
      if (loose) return loose
      // Prefer explicitly rated cables, then the most specific (shortest-rated) one.
      if ((l.ratedSignals.length === 0) !== (r.ratedSignals.length === 0)) return l.ratedSignals.length === 0 ? 1 : -1
      return (l.maxLengthMeters ?? Infinity) - (r.maxLengthMeters ?? Infinity)
    })
}

const PASSIVE = new Set(['patchBay', 'wallPlate', 'floorBox'])
/** Passive jacks (patch bays, wall plates, floor boxes); their power outlets are real sources, not pass-through. */
const isPatchBay = (r: ResolvedPort) => PASSIVE.has(r.equipment.product.category) && SIGNALS[r.port.signals[0]]?.domain !== 'power'
const opposite = (d: PortTemplate['direction']): PortTemplate['direction'] => (d === 'input' ? 'output' : d === 'output' ? 'input' : 'bidirectional')

/** Treats patch-bay jacks as pass-through: direction follows the other end, and
 *  any signal of the same family passes (with a warning if it exceeds the bay's rating). */
function passiveView(a: ResolvedPort, b: ResolvedPort): { a: ResolvedPort; b: ResolvedPort; notes: ValidationIssue[] } {
  const notes: ValidationIssue[] = []
  const adapt = (bay: ResolvedPort, other: ResolvedPort): ResolvedPort => {
    const bayDomain = SIGNALS[bay.port.signals[0]]?.domain
    const sameFamily = other.port.signals.some((s) => SIGNALS[s].domain === bayDomain)
    const passes = sameFamily ? other.port.signals.filter((s) => SIGNALS[s].domain === bayDomain) : bay.port.signals
    if (sameFamily && !isPatchBay(other) && !passes.some((s) => bay.port.signals.includes(s))) {
      notes.push({ rule: 'patch-rating', severity: 'warning', subject: { kind: 'ports', a: a.address, b: b.address },
        message: `${bay.equipment.tag} is rated for ${bay.port.signals.map((s) => SIGNALS[s].name).join(' / ')}; ${SIGNALS[passes[0]].name} may not pass cleanly.`,
        suggestion: 'Use a patch bay rated for this signal (e.g. 12G-SDI BNC).' })
    }
    return { ...bay, port: { ...bay.port, direction: isPatchBay(other) ? 'bidirectional' : opposite(other.port.direction), signals: [...passes] } }
  }
  if (isPatchBay(a) && isPatchBay(b)) return { a: adapt(a, b), b: adapt(b, a), notes }
  if (isPatchBay(a)) return { a: adapt(a, b), b, notes }
  if (isPatchBay(b)) return { a, b: adapt(b, a), notes }
  return { a, b, notes }
}

const CAT_NAME: Record<string, string> = { cat5e: 'Cat5e', cat6: 'Cat6', cat6a: 'Cat6A', cat8: 'Cat8' }

/** The port-validation engine: full rule set. */
export function validate(project: Project, a: PortAddress, b: PortAddress, opts: ValidateOptions = {}): ConnectionVerdict {
  const ra = resolve(project, a), rb = resolve(project, b)
  if (!ra || !rb) {
    const missing = ra ? b : a
    const issues: ValidationIssue[] = [{ rule: 'resolve', severity: 'error', message: 'Port no longer exists (product definition changed?).', subject: { kind: 'port', a: missing } }]
    return { issues, allowed: false, severity: 'error', normalized: null, signal: null, suggestedCables: [] }
  }
  // Patch bays are passive: a jack carries whatever is plugged into it, in either direction.
  const passive = passiveView(ra, rb)
  const [source, sink] = normalize(passive.a, passive.b)
  const match = bestSignal(source.port, sink.port)
  const spec = cableSpec(opts.specKey) ?? null

  const ctx: ConnectionContext = {
    a: passive.a, b: passive.b, source, sink, cableSpec: spec, lengthMeters: opts.lengthMeters ?? null,
    project, ignoringCable: opts.ignoringCable ?? null, signalMatch: match,
  }

  const found: ValidationIssue[] = []
  for (const rule of opts.rules ?? STANDARD_RULES) {
    const r = rule.evaluate(ctx)
    found.push(...r)
    if (rule.gate && r.some((i) => i.severity === 'error')) break
  }
  found.push(...passive.notes)
  // Category: a lower-category cable on a higher-rated panel (or the other way round) is worth flagging.
  if (spec && /^cat(5e|6a?|8)/.test(spec.key)) {
    const order = ['cat5e', 'cat6', 'cat6a', 'cat8']
    const cableCat = order.find((c) => spec.key === c || spec.key.startsWith(`${c}.`)) ?? (spec.key.startsWith('cat6a') ? 'cat6a' : null)
    const panelCats = [ra, rb].flatMap((r) => r.equipment.product.tags.filter((t) => order.includes(t)))
    const top = panelCats.sort((x, y) => order.indexOf(y) - order.indexOf(x))[0]
    if (cableCat && top && order.indexOf(cableCat) < order.indexOf(top)) {
      found.push({ rule: 'cable-category', severity: 'warning', subject: { kind: 'ports', a, b },
        message: `${spec.name} is a lower category than the ${CAT_NAME[top]} panel it connects to.`,
        suggestion: `Use ${CAT_NAME[top]} cable so the link keeps its rating.` })
    }
  }
  const issues = sortIssues(found)
  const signal = match && isUsable(match.match) ? match.source : null
  return {
    issues,
    allowed: !issues.some((i) => i.severity === 'error'),
    severity: maxSeverity(issues),
    normalized: [source.address, sink.address],
    signal,
    suggestedCables: suggestCables(source.port, sink.port, signal),
  }
}

export function validateCable(project: Project, cable: Cable): ConnectionVerdict {
  const v = validate(project, cable.from, cable.to, { specKey: cable.specKey, lengthMeters: cable.lengthMeters, ignoringCable: cable.id })
  v.issues = v.issues.map((i) => ({ ...i, subject: { kind: 'cable', id: cable.id } }))
  return v
}

const LIVE_RULES = STANDARD_RULES.filter((r) => r.live)

/** Cheap check run for every candidate port while dragging a wire. */
export function liveCheck(project: Project, a: PortAddress, b: PortAddress): Severity | null {
  return validate(project, a, b, { rules: LIVE_RULES }).severity
}

export type CandidateQuality = 'clean' | 'caution'

/** Every port `origin` could legally connect to. Ports absent from the map are
 *  invalid targets (the canvas dims them and refuses the drop). */
export function candidates(project: Project, origin: PortAddress): Map<string, CandidateQuality> {
  const out = new Map<string, CandidateQuality>()
  for (const eq of project.equipment) {
    for (const port of eq.product.ports) {
      if (eq.id === origin.equipment && port.id === origin.port) continue
      const s = liveCheck(project, origin, { equipment: eq.id, port: port.id })
      if (s === 'error') continue
      out.set(`${eq.id}/${port.id}`, s === 'warning' ? 'caution' : 'clean')
    }
  }
  return out
}

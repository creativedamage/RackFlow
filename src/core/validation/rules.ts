import { carries, endMates, orientation, type CableSpec, plugsInto } from '../cables'
import { isUsable, type BestMatch } from '../compatibility'
import type { CableId, Project } from '../model'
import { cablesAt, isPowerPort, portDomain, type ResolvedPort } from '../project'
import { connectorName, connectorsMate, DOMAINS, SIGNALS } from '../signals'
import type { Severity, ValidationIssue } from './issues'

/** Everything a rule needs to judge one prospective (or existing) connection. */
export interface ConnectionContext {
  a: ResolvedPort
  b: ResolvedPort
  /** Ends normalised by direction: source drives, sink receives. */
  source: ResolvedPort
  sink: ResolvedPort
  cableSpec: CableSpec | null
  lengthMeters: number | null
  project: Project
  ignoringCable: CableId | null
  signalMatch: BestMatch | null
}

/** One independently testable rule. Add a check = add one object to RULES. */
export interface ConnectionRule {
  id: string
  /** An error from a gate rule stops evaluation (no follow-on noise). */
  gate?: boolean
  /** Cheap rules run for every candidate port during a wire drag. */
  live?: boolean
  evaluate(c: ConnectionContext): ValidationIssue[]
}

const issue = (c: ConnectionContext, rule: string, severity: Severity, message: string, suggestion?: string): ValidationIssue =>
  ({ rule, severity, message, suggestion, subject: { kind: 'ports', a: c.a.address, b: c.b.address } })

export const selfConnectionRule: ConnectionRule = {
  id: 'self-connection', gate: true, live: true,
  evaluate(c) {
    if (c.a.equipment.id === c.b.equipment.id && c.a.port.id === c.b.port.id)
      return [issue(c, this.id, 'error', 'A port cannot be connected to itself.')]
    if (c.a.equipment.id === c.b.equipment.id)
      return [issue(c, this.id, 'warning', `Loopback: both ends are on ${c.a.equipment.tag}.`)]
    return []
  },
}

/** Power and signal never mix – the "SDI into an AC receptacle" guard. */
export const domainRule: ConnectionRule = {
  id: 'domain', gate: true, live: true,
  evaluate(c) {
    const da = portDomain(c.a.port), db = portDomain(c.b.port)
    if (!da || !db) return [issue(c, this.id, 'error', 'Port has no signal type defined.', 'Edit the product and give every port at least one signal.')]
    if (isPowerPort(c.a.port) !== isPowerPort(c.b.port))
      return [issue(c, this.id, 'error', `${DOMAINS[da].name} port "${c.a.port.label}" cannot connect to ${DOMAINS[db].name} port "${c.b.port.label}".`)]
    return []
  },
}

/** Signal flow: outputs feed inputs; bidirectional ports accept either. */
export const directionalityRule: ConnectionRule = {
  id: 'direction', gate: true, live: true,
  evaluate(c) {
    const da = c.a.port.direction, db = c.b.port.direction
    if (da === 'input' && db === 'input')
      return [issue(c, this.id, 'error', `Input-to-input: "${c.a.port.label}" and "${c.b.port.label}" are both inputs.`, 'Connect an output to this input, or use a distribution amplifier.')]
    if (da === 'output' && db === 'output')
      return [issue(c, this.id, 'error', 'Output-to-output: two sources driving each other.', 'Route both outputs into a switcher or mixer.')]
    return []
  },
}

export const signalCompatibilityRule: ConnectionRule = {
  id: 'signal', live: true,
  evaluate(c) {
    const m = c.signalMatch
    if (!m) return [issue(c, this.id, 'error', 'No signal in common between these ports.')]
    if (m.match.kind === 'degraded') return [issue(c, this.id, 'warning', m.match.reason)]
    if (m.match.kind === 'incompatible')
      return [issue(c, this.id, 'error', m.match.reason, `Insert a converter between ${c.source.equipment.tag} and ${c.sink.equipment.tag}.`)]
    return []
  },
}

export const portOccupancyRule: ConnectionRule = {
  id: 'occupancy', live: true,
  evaluate(c) {
    return [c.a, c.b].flatMap((end) => {
      const used = cablesAt(c.project, end.address).filter((x) => x.id !== c.ignoringCable).length
      return used >= end.port.maxConnections
        ? [issue(c, this.id, 'error', `${end.equipment.tag} "${end.port.label}" is already in use.`, 'Disconnect the existing cable first, or use a splitter/DA.')]
        : []
    })
  },
}

/** Physical mating of cable ends to port connectors & genders. */
export const connectorMatingRule: ConnectionRule = {
  id: 'connector',
  evaluate(c) {
    const pa = c.a.port, pb = c.b.port
    const spec = c.cableSpec
    if (spec) {
      if (orientation(spec, pa, pb)) return []
      if (spec.direct)
        return [issue(c, this.id, 'error', `${connectorName(pa.connector)} (${pa.gender}) and ${connectorName(pb.connector)} (${pb.gender}) don't plug into each other directly.`, `Choose a cord with ${connectorName(pa.connector)} and ${connectorName(pb.connector)} ends.`)]
      const msgs: string[] = []
      if (!endMates(spec.endA, pa) && !endMates(spec.endB, pa)) msgs.push(`${spec.name} does not fit ${connectorName(pa.connector)} (${pa.gender}) on ${c.a.equipment.tag}`)
      if (!endMates(spec.endA, pb) && !endMates(spec.endB, pb)) msgs.push(`${spec.name} does not fit ${connectorName(pb.connector)} (${pb.gender}) on ${c.b.equipment.tag}`)
      if (msgs.length === 0) msgs.push(`${spec.name} cannot span these two connectors in either orientation`)
      return [issue(c, this.id, 'error', msgs.join('; ') + '.', `Choose a cable with ${connectorName(pa.connector)} and ${connectorName(pb.connector)} ends.`)]
    }
    if (!connectorsMate(pa.connector, pb.connector) && !plugsInto(pa, pb))
      return [issue(c, this.id, 'info', `Requires a ${connectorName(pa.connector)}–${connectorName(pb.connector)} cable or adapter.`)]
    return []
  },
}

export const cableRatingRule: ConnectionRule = {
  id: 'cable-rating',
  evaluate(c) {
    const spec = c.cableSpec, m = c.signalMatch
    if (!spec || !m || !isUsable(m.match)) return []
    if (carries(spec, m.source)) return []
    const sameFamily = spec.ratedSignals.some((s) => SIGNALS[s].family === SIGNALS[m.source].family)
    return [issue(c, this.id, sameFamily ? 'warning' : 'error', `${spec.name} is not rated for ${SIGNALS[m.source].name}.`,
      sameFamily ? `Upgrade to a cable rated for ${SIGNALS[m.source].name}.` : undefined)]
  },
}

export const cableLengthRule: ConnectionRule = {
  id: 'cable-length',
  evaluate(c) {
    const spec = c.cableSpec, len = c.lengthMeters
    if (!spec || spec.maxLengthMeters == null || len == null || len <= spec.maxLengthMeters) return []
    const ethernet = spec.key.startsWith('cat')
    return [issue(c, this.id, ethernet ? 'error' : 'warning', `${len} m exceeds the ${spec.maxLengthMeters} m limit for ${spec.name}.`,
      ethernet ? 'Add a switch or use fiber.' : 'Use an active cable, fiber, or an extender.')]
  },
}

export const powerCapacityRule: ConnectionRule = {
  id: 'power-capacity', live: true,
  evaluate(c) {
    const cap = c.source.port.powerCapacityWatts
    if (!isPowerPort(c.source.port) || cap == null) return []
    const draw = c.sink.equipment.product.power.maxWatts
    return draw > cap ? [issue(c, this.id, 'warning', `${c.sink.equipment.tag} draws up to ${draw} W; outlet "${c.source.port.label}" is rated ${cap} W.`)] : []
  },
}

/** Order matters: gates first so their errors suppress noise. */
export const STANDARD_RULES: ConnectionRule[] = [
  selfConnectionRule, domainRule, directionalityRule, signalCompatibilityRule, portOccupancyRule,
  connectorMatingRule, cableRatingRule, cableLengthRule, powerCapacityRule,
]

import type { CableId, EquipmentId, PortAddress, RackId } from '../model'

export type Severity = 'info' | 'warning' | 'error'
export const severityRank: Record<Severity, number> = { info: 0, warning: 1, error: 2 }
export const maxSeverity = (issues: { severity: Severity }[]): Severity | null =>
  issues.reduce<Severity | null>((m, i) => (m == null || severityRank[i.severity] > severityRank[m] ? i.severity : m), null)

/** What an issue is about – the Issues panel uses it to select / zoom. */
export type IssueSubject =
  | { kind: 'ports'; a: PortAddress; b: PortAddress }
  | { kind: 'port'; a: PortAddress }
  | { kind: 'cable'; id: CableId }
  | { kind: 'equipment'; id: EquipmentId }
  | { kind: 'rack'; id: RackId }
  | { kind: 'project' }

export interface ValidationIssue {
  rule: string
  severity: Severity
  message: string
  suggestion?: string
  subject: IssueSubject
}

export const sortIssues = <T extends { severity: Severity }>(xs: T[]) =>
  [...xs].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])

// Direct signal-to-label binding: designation text derived from the wiring.

import type { Cable, LabelFormat, PatchBay, Project } from '../model'
import { cablesAt, resolve, type ResolvedPort } from '../project'
import { DOMAINS, SIGNALS, type SignalType } from '../signals'
import { validateCable } from '../validation/validator'
import { patchPortId } from './template'

export interface Binding { remote: ResolvedPort; cable: Cable; signal: SignalType | null }

/** What is cabled to the rear of a channel, if anything. */
export function binding(bay: PatchBay, row: number, channel: number, p: Project): Binding | null {
  // Rear first (the permanent wiring); two-sided panels fall back to the front jack.
  let address = { equipment: bay.equipment, port: patchPortId(row, channel) }
  let cable = cablesAt(p, address)[0]
  if (!cable) { address = { equipment: bay.equipment, port: `${patchPortId(row, channel)}.f` }; cable = cablesAt(p, address)[0] }
  if (!cable) return null
  const remoteAddr = cable.from.equipment === address.equipment && cable.from.port === address.port ? cable.to : cable.from
  const remote = resolve(p, remoteAddr)
  if (!remote) return null
  return { remote, cable, signal: validateCable(p, cable).signal }
}

export function render(format: LabelFormat, b: Binding, channel: number): string {
  const tokens: Record<string, string> = {
    '{tag}': b.remote.equipment.tag,
    '{port}': b.remote.port.label,
    '{signal}': b.signal ? SIGNALS[b.signal].name : '',
    '{cable}': b.cable.label,
    '{room}': b.remote.equipment.room ?? '',
    '{ch}': String(channel),
    '{model}': b.remote.equipment.product.model,
  }
  let text = format.template.replaceAll('\\n', '\n')
  for (const [k, v] of Object.entries(tokens)) text = text.replaceAll(k, v)
  let lines = text.split('\n').map((l) => l.trim())
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (format.maxCharsPerLine > 0) lines = lines.map((l) => (l.length > format.maxCharsPerLine ? l.slice(0, format.maxCharsPerLine - 1) + '…' : l))
  const joined = lines.join('\n')
  return format.uppercase ? joined.toUpperCase() : joined
}

export function boundText(bay: PatchBay, row: number, channel: number, p: Project): string | null {
  const b = binding(bay, row, channel, p)
  return b ? render(bay.format, b, channel) : null
}

/** Re-derive every non-manual cell from current routing. */
export function refreshLabels(bay: PatchBay, p: Project, overwriteManual = false) {
  for (const cell of bay.cells) {
    if (cell.manual && !overwriteManual) continue
    const b = binding(bay, cell.row, cell.channel, p)
    cell.text = b ? render(bay.format, b, cell.channel) : ''
    cell.manual = false
    cell.fill = bay.style.colorByDomain && b?.signal ? domainFill(b.signal) : null
  }
}

const domainFill = (s: SignalType) => DOMAINS[SIGNALS[s].domain].color

export function staleCells(bay: PatchBay, p: Project) {
  return bay.cells.filter((c) => !c.manual && c.text !== (boundText(bay, c.row, c.channel, p) ?? ''))
}

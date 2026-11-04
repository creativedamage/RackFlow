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
  // Bays made from a rack panel use the panel's own jack ids.
  const base = bay.portMap ? bay.portMap[`${row}.${channel}`] : patchPortId(row, channel)
  if (!base) return null
  let address = { equipment: bay.equipment, port: bay.portMap ? `${base}.r` : base }
  let cable = cablesAt(p, address)[0]
  if (!cable) { address = { equipment: bay.equipment, port: `${base}.f` }; cable = cablesAt(p, address)[0] }
  if (!cable) return null
  const remoteAddr = cable.from.equipment === address.equipment && cable.from.port === address.port ? cable.to : cable.from
  const remote = resolve(p, remoteAddr)
  if (!remote) return null
  return { remote, cable, signal: validateCable(p, cable).signal }
}

/** A box port with a project port number (M1, D3…): the number alone says where it goes. */
export function boxPortNumber(b: Binding): string | undefined {
  const e = b.remote.equipment
  return e.portNumbers?.[b.remote.port.id.replace(/\.r$/, '.f')]
}

export function render(format: LabelFormat, b: Binding, channel: number): string {
  // Numbered box ports print as just the number ("M1"), not "WP-001 / M1 (REAR)".
  const num = boxPortNumber(b)
  if (num && format.template.includes('{port}')) return format.uppercase ? num.toUpperCase() : num
  const tokens: Record<string, string> = {
    '{tag}': b.remote.equipment.tag,
    // The tie line lands on the rear of the box – "(rear)" adds nothing on a patch bay label.
    '{port}': b.remote.port.label.replace(/\s*\(rear\)$/i, ''),
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

/** Puts these cells back to what the wiring says (typed text in them is replaced). */
export function resetToWiring(bay: PatchBay, p: Project, r: { row: number; a: number; b: number }) {
  const lo = Math.min(r.a, r.b), hi = Math.max(r.a, r.b)
  for (const cell of bay.cells) {
    if (cell.row !== r.row || cell.channel < lo || cell.channel > hi) continue
    const b = binding(bay, cell.row, cell.channel, p)
    cell.text = b ? render(bay.format, b, cell.channel) : ''
    cell.manual = false
    cell.fill = bay.style.colorByDomain && b?.signal ? domainFill(b.signal) : null
  }
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
  if (bay.autoTitles !== false) autoGroupTitles(bay, p)
}

const BOXES = new Set(['wallBox', 'wallPlate', 'floorBox', 'connectorPanel'])

/**
 * Group titles from the wiring: each run of channels wired to the same wall
 * box, plate, floor box or connector panel gets a title naming it ("WP-001 ·
 * STAGE LEFT"). Titles you made or edited are kept; auto titles never cover them.
 */
export function autoGroupTitles(bay: PatchBay, p: Project) {
  const own = (bay.spans ?? []).filter((s) => !s.auto)
  const out = [...own]
  for (const row of bay.template.rows) {
    let run: { key: string; text: string; start: number; end: number } | null = null
    const flush = () => {
      if (run && !own.some((s) => s.row === row.id && s.start <= run!.end && s.end >= run!.start)) {
        out.push({ id: `auto.${row.id}.${run.start}`, row: row.id, start: run.start, end: run.end, text: run.text, auto: true })
      }
      run = null
    }
    for (let ch = 1; ch <= row.strip.channelCount; ch++) {
      const b = binding(bay, row.id, ch, p)
      const e = b && BOXES.has(b.remote.equipment.product.category) ? b.remote.equipment : null
      const key = e ? e.id : ''
      if (run && run.key === key && key) { run.end = ch; continue }
      flush()
      if (e) run = { key, text: [e.tag, e.room?.trim()].filter(Boolean).join(' · ').toUpperCase(), start: ch, end: ch }
    }
    flush()
  }
  bay.spans = out.sort((x, y) => x.row - y.row || x.start - y.start)
}

const domainFill = (s: SignalType) => DOMAINS[SIGNALS[s].domain].color

export function staleCells(bay: PatchBay, p: Project) {
  return bay.cells.filter((c) => !c.manual && c.text !== (boundText(bay, c.row, c.channel, p) ?? ''))
}

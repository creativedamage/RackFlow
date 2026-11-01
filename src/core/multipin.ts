// Multipin ties: XLRs (or any audio jacks) on a box wired inside to a multipin
// (W1, W2, EDAC…). Each tied jack is one channel of the multipin, and keeps
// its own rear tie line too – the box can be used with or without the snake. The
// multipin gets a channel summary ("M1-8, RET 1-4") on its port name and on
// the face drawing, and the card lines the jacks up beside it.

import type { PlateInsert, PlateSpec, PortTemplate, ProductDefinition } from './model'

/** Channels each multipin carries. */
export const MULTIPIN_CHANNELS: Record<string, number> = { w1F: 12, w1M: 12, w2F: 20, w2M: 20, amp57F: 24, socaF: 6, socaM: 6, edac56: 18, edac90: 28 }
export const isMultipin = (module: string) => module in MULTIPIN_CHANNELS

/** Jacks tied to a multipin, in channel order (their order on the box). */
export const tiedTo = (spec: PlateSpec, mpPid: string): PlateInsert[] => spec.inserts.filter((x) => x.tie === mpPid && x.pid)

/** Multipins that have jacks tied to them. */
export const tiedMultipins = (spec: PlateSpec | undefined): Set<string> => new Set((spec?.inserts ?? []).map((x) => x.tie).filter(Boolean) as string[])

/**
 * "M1, M2 … M8, RET 1 … RET 4" → "M1-8, RET 1-4": runs of the same prefix
 * with consecutive numbers collapse to a range; anything else is listed.
 */
export function summarizeLabels(labels: string[]): string {
  const out: string[] = []
  let run: { prefix: string; a: number; b: number; width: number } | null = null
  const flush = () => { if (run) out.push(run.a === run.b ? `${run.prefix}${String(run.a).padStart(run.width, '0')}` : `${run.prefix}${String(run.a).padStart(run.width, '0')}-${String(run.b).padStart(run.width, '0')}`); run = null }
  for (const l of labels) {
    const m = /^(.*?)(\d+)$/.exec(l.trim())
    if (!m) { flush(); out.push(l.trim()); continue }
    const prefix = m[1], num = parseInt(m[2], 10), width = m[2].startsWith('0') ? m[2].length : 1
    if (run && run.prefix === prefix && num === run.b + 1) { run.b = num; continue }
    flush()
    run = { prefix, a: num, b: num, width }
  }
  flush()
  return out.join(', ')
}

const SEP = ' · '
const base = (label: string) => label.split(SEP)[0]

/**
 * Writes the multipin ties into a plate product's ports: tied jacks and their
 * multipin share one card section (named after the multipin) and the multipin's
 * name gains the channel summary. Call after anything relabels the ports.
 */
export function applyTies(prod: ProductDefinition) {
  const spec = prod.plate
  if (!spec) return
  const mps = tiedMultipins(spec)
  const byId = new Map(prod.ports.map((p) => [p.id, p]))
  for (const ins of spec.inserts) {
    if (!ins.pid || !isMultipin(ins.module)) continue
    const port = byId.get(`${ins.pid}.f`)
    if (!port) continue
    port.label = base(port.label)
    if (!mps.has(ins.pid)) continue
    const chans = tiedTo(spec, ins.pid).map((j) => byId.get(`${j.pid}.f`)).filter(Boolean) as PortTemplate[]
    const name = port.label
    port.group = name
    for (const c of chans) c.group = name
    // Their rear tie lines stay (patch bay or multipin – either way) and sit in the same section.
    for (const j of tiedTo(spec, ins.pid)) { const r = byId.get(`${j.pid}.r`); if (r) r.group = name }
    const sum = summarizeLabels(chans.map((c) => c.label))
    if (sum) port.label = `${name}${SEP}${sum}`
  }
}

/** The summary shown under a multipin on the face drawing (from the jacks' plate labels). */
export function tieSummary(spec: PlateSpec, mpPid: string, nameOf: (ins: PlateInsert) => string): string {
  return summarizeLabels(tiedTo(spec, mpPid).map(nameOf))
}

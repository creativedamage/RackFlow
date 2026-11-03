import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { produce } from 'immer'
import { BUILT_IN_KEYS, footprint, makePlateProduct, newPlateText, nextPid, PLATE_MODULE_KEYS, PLATE_MODULES, PLATE_SIZES, PLATE_STYLE_LIST, plateInner, withLayout, autoArrange, type PlateInsert, type PlateKind, type PlateLayout, type PlateSpec, type ProductDefinition, imperial, fmtLen, fmtLenPair, refreshBoxPorts, withoutPortNumbers, isMultipin, MULTIPIN_CHANNELS, summarizeLabels, tiedTo, keepInViews } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { addProductToDiagram } from '../diagram/placement'
import { Modal, NumberInput, Segmented, Select, LenInput } from '../components/ui'

const REAR_OPTIONS: { value: PlateInsert['rear']; label: string }[] = [
  { value: 'same', label: 'Pass-through (same jack)' },
  { value: 'idcPunchdown', label: 'Punch-down / solder' },
  { value: 'euroblock', label: 'Euroblock (screw terminal)' },
  { value: 'none', label: 'No tie line' },
]
const GROUP_ORDER = ['Audio', 'Multipin', 'Speaker', 'Video', 'Network', 'Data', 'Control', 'Lighting', 'Power']
const KIND_NAME: Record<PlateKind, string> = { wallBox: 'Wall Box', wallPlate: 'Wall Plate', floorBox: 'Floor Box', rackPanel: 'Rack Panel' }
const short = (k: string) => PLATE_MODULES[k].name.replace(/\s*\(.*\)$/, '')

type Sel = Set<string>
const isText = (id: string) => id.startsWith('t.')

/** Designer clipboard: jacks (with their spot) and text, shared across plates so you can paste into another box. */
type ClipItem = { kind: 'jack'; ins: PlateInsert; x: number; y: number } | { kind: 'text'; t: PlateLayout['texts'][number] }
let clipboard: { items: ClipItem[]; from: string; pastes: number } | null = null

/**
 * Plate / floor box / rack panel designer: pick a face, click or drag
 * connectors onto it, move them with a snap grid, align and distribute,
 * label each jack and add text anywhere. Each jack is a port on the wiring
 * diagram (room side left, tie line right); the face drawing shows on the card.
 */
export function PlateDesigner({ initial, instanceId }: { initial: ProductDefinition; instanceId: string | null }) {
  const [name, setName] = useState(initial.model)
  const [maker, setMaker] = useState(initial.manufacturer)
  const [spec, setSpecRaw] = useState<PlateSpec>(() => withLayout(initial.plate ?? { kind: 'wallPlate', style: '1-Gang', inserts: [] }))
  const [past, setPast] = useState<PlateSpec[]>([])
  const [sel, setSel] = useState<Sel>(new Set())
  const [snap, setSnap] = useState(true)
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const instance = useStore((s) => (instanceId ? s.project.equipment.find((e) => e.id === instanceId) : undefined))
  const isNew = !useStore.getState().library.get(initial.key) && !instance
  const isBuiltIn = BUILT_IN_KEYS.has(initial.key.split('@')[0])
  const close = () => useStore.getState().set({ editingPlate: null })
  const L = spec.layout!
  const setSpec = useCallback((next: PlateSpec, record = true) => { if (record) setPast((p) => [...p.slice(-60), spec]); setSpecRaw(next) }, [spec])
  const edit = (fn: (d: PlateSpec) => void, record = true) => setSpec(produce(spec, fn), record)
  const editL = (fn: (l: PlateLayout) => void, record = true) => edit((d) => fn(d.layout!), record)
  const undo = () => { const prev = past[past.length - 1]; if (prev) { setPast(past.slice(0, -1)); setSpecRaw(prev) } }

  const product = useMemo(() => makePlateProduct(spec, { key: initial.key.split('@')[0], manufacturer: maker, model: name }), [spec, maker, name, initial.key])
  const jacks = spec.inserts.length
  const hasPower = spec.inserts.some((x) => PLATE_MODULES[x.module]?.power)
  const problems = [!name.trim() && 'Give it a name.', jacks === 0 && 'Add at least one connector.'].filter(Boolean) as string[]
  const grid = snap && L.grid > 0 ? L.grid : 0
  const snapV = (v: number) => (grid ? Math.round(v / grid) * grid : Math.round(v * 10) / 10)

  // MARK: Items
  const posOf = (id: string) => (isText(id) ? L.texts.find((t) => t.id === id) : L.jacks[id])
  const boxOf = (id: string) => {
    if (isText(id)) { const t = L.texts.find((x) => x.id === id)!; const w = Math.max(...t.text.split('\n').map((l) => l.length)) * t.size * 0.6, h = t.text.split('\n').length * t.size * 1.2; return { x: t.x, y: t.y + h / 2 - t.size * 0.6, w, h } }
    const ins = spec.inserts.find((x) => x.pid === id)!; const f = footprint(ins.module); const p = L.jacks[id]
    return { x: p.x, y: p.y, w: f.w, h: f.h }
  }
  const freeSpot = (module: string) => {
    const f = footprint(module)
    const taken = spec.inserts.filter((x) => x.pid && L.jacks[x.pid]).map((x) => ({ ...L.jacks[x.pid!], ...footprint(x.module) }))
    // Stay clear of rack ears and of the back box's walls.
    const margin = spec.kind === 'rackPanel' ? 20 : spec.kind === 'wallBox' ? 16 : 6
    const top = spec.kind === 'wallBox' ? 16 : 4
    for (let y = f.h / 2 + top; y <= L.h - f.h / 2 - top / 2; y += 2) for (let x = f.w / 2 + margin; x <= L.w - f.w / 2 - margin; x += 2) {
      if (taken.every((t) => Math.abs(t.x - x) >= (t.w + f.w) / 2 + 4 || Math.abs(t.y - y) >= (t.h + f.h) / 2 + 8)) return { x: snapV(x), y: snapV(y) }
    }
    return { x: L.w / 2, y: L.h / 2 }
  }
  const addJack = (module: string, at?: { x: number; y: number }) => {
    const pid = nextPid(spec, module)
    const p = at ?? freeSpot(module)
    edit((d) => {
      d.inserts.push({ module, count: 1, rear: PLATE_MODULES[module].rear, pid })
      d.layout!.jacks[pid] = { x: snapV(p.x), y: snapV(p.y) }
      if (PLATE_MODULES[module].power && !d.power) d.power = { volts: 120, amps: 20 }
    })
    setSel(new Set([pid]))
  }
  const addText = () => { const t = newPlateText(L.w / 2, Math.min(L.h - 5, 8)); editL((l) => { l.texts.push(t) }); setSel(new Set([t.id])) }
  const remove = (ids: Sel) => {
    if (!ids.size) return
    edit((d) => {
      d.inserts = d.inserts.filter((x) => !x.pid || !ids.has(x.pid))
      for (const x of d.inserts) if (x.tie && ids.has(x.tie)) delete x.tie
      for (const id of ids) delete d.layout!.jacks[id]
      d.layout!.texts = d.layout!.texts.filter((t) => !ids.has(t.id))
    })
    setSel(new Set())
  }
  const duplicate = () => {
    const ids = [...sel]; if (!ids.length) return
    let d0 = spec; const fresh = new Set<string>()
    d0 = produce(d0, (d) => {
      for (const id of ids) {
        if (isText(id)) { const t = d.layout!.texts.find((x) => x.id === id)!; const c = { ...t, id: newPlateText(0, 0).id, x: t.x + 6, y: t.y + 6 }; d.layout!.texts.push(c); fresh.add(c.id) }
        else { const ins = d.inserts.find((x) => x.pid === id)!; const pid = nextPid(d, ins.module); d.inserts.push({ ...ins, pid, label: undefined, tie: undefined }); const p = d.layout!.jacks[id]; d.layout!.jacks[pid] = { x: p.x + footprint(ins.module).w + 4, y: p.y }; fresh.add(pid) }
      }
    })
    setSpec(d0); setSel(fresh)
  }
  // Multipin ties: the selected jacks become channels of the selected multipin.
  const selJacks = spec.inserts.filter((x) => x.pid && sel.has(x.pid))
  const selMps = selJacks.filter((x) => isMultipin(x.module))
  const tieable = selJacks.filter((x) => !isMultipin(x.module) && !PLATE_MODULES[x.module]?.power)
  const tie = (mp: string, ids: string[]) => edit((d) => { for (const x of d.inserts) if (x.pid && ids.includes(x.pid)) x.tie = mp })
  const untie = (ids: string[]) => edit((d) => { for (const x of d.inserts) if (x.pid && (ids.includes(x.pid) || (x.tie && ids.includes(x.tie)))) delete x.tie })
  const nameOf = (pid: string) => { const x = spec.inserts.find((q) => q.pid === pid); return x ? x.label?.trim() || short(x.module) : pid }

  // ⌘C / ⌘X / ⌘V: copy, cut and paste jacks and text (also into another plate).
  const copySel = () => {
    const ids = [...sel]; if (!ids.length) return false
    const items: ClipItem[] = []
    for (const id of ids) {
      if (isText(id)) { const t = L.texts.find((x) => x.id === id); if (t) items.push({ kind: 'text', t: structuredClone(t) }) }
      else { const ins = spec.inserts.find((x) => x.pid === id); const at = L.jacks[id]; if (ins && at) items.push({ kind: 'jack', ins: structuredClone(ins), x: at.x, y: at.y }) }
    }
    clipboard = { items, from: initial.key, pastes: 0 }
    return items.length > 0
  }
  const paste = () => {
    if (!clipboard?.items.length) return
    clipboard.pastes++
    // Same plate: step each paste down-right so copies don't stack; another plate: same spot.
    const off = clipboard.from === initial.key ? 6 * clipboard.pastes : 0
    const fresh = new Set<string>()
    setSpec(produce(spec, (d) => {
      d.layout ??= structuredClone(L)
      const remap = new Map<string, string>()
      for (const it of clipboard!.items) if (it.kind === 'jack' && it.ins.pid) remap.set(it.ins.pid, nextPid({ ...d, inserts: [...d.inserts, ...[...remap.values()].map((v) => ({ module: v.split('.')[0], count: 1, rear: 'none' as const, pid: v }))] }, it.ins.module))
      for (const it of clipboard!.items) {
        if (it.kind === 'text') { const c = { ...structuredClone(it.t), id: newPlateText(0, 0).id, x: Math.min(L.w - 2, it.t.x + off), y: Math.min(L.h - 2, it.t.y + off) }; d.layout!.texts.push(c); fresh.add(c.id) }
        else {
          const pid = remap.get(it.ins.pid!) ?? nextPid(d, it.ins.module)
          const tie = it.ins.tie ? remap.get(it.ins.tie) : undefined
          d.inserts.push({ ...structuredClone(it.ins), pid, count: 1, tie })
          d.layout!.jacks[pid] = { x: Math.min(L.w, it.x + off), y: Math.min(L.h, it.y + off) }
          fresh.add(pid)
        }
      }
    }))
    setSel(fresh)
  }
  useEffect(() => {
    const busy = (e: Event) => !!(e.target as HTMLElement)?.closest?.('input, textarea, select') || !!window.getSelection()?.toString()
    const onCopy = (e: ClipboardEvent) => { if (busy(e)) return; if (copySel()) { e.preventDefault(); e.clipboardData?.setData('text/plain', clipboard!.items.map((i) => (i.kind === 'text' ? i.t.text : i.ins.label || i.ins.module)).join('\n')) } }
    const onCut = (e: ClipboardEvent) => { if (busy(e)) return; if (copySel()) { e.preventDefault(); clipboard!.pastes = -1; remove(sel) } }
    const onPaste = (e: ClipboardEvent) => { if (busy(e) || !clipboard) return; e.preventDefault(); paste() }
    document.addEventListener('copy', onCopy); document.addEventListener('cut', onCut); document.addEventListener('paste', onPaste)
    return () => { document.removeEventListener('copy', onCopy); document.removeEventListener('cut', onCut); document.removeEventListener('paste', onPaste) }
  })
  const move = (ids: Sel, dx: number, dy: number, record = true) => editL((l) => {
    for (const id of ids) {
      if (isText(id)) { const t = l.texts.find((x) => x.id === id); if (t) { t.x = Math.round((t.x + dx) * 10) / 10; t.y = Math.round((t.y + dy) * 10) / 10 } }
      else if (l.jacks[id]) l.jacks[id] = { x: Math.round((l.jacks[id].x + dx) * 10) / 10, y: Math.round((l.jacks[id].y + dy) * 10) / 10 }
    }
  }, record)
  const setPos = (id: string, x: number, y: number) => editL((l) => { if (isText(id)) { const t = l.texts.find((q) => q.id === id); if (t) { t.x = x; t.y = y } } else l.jacks[id] = { x, y } })

  // Align / distribute (on item centres / edges).
  const align = (how: 'l' | 'c' | 'r' | 't' | 'm' | 'b' | 'pc' | 'pm') => {
    const ids = [...sel]; if (!ids.length) return
    const bs = ids.map((id) => ({ id, ...boxOf(id) }))
    const minL = Math.min(...bs.map((b) => b.x - b.w / 2)), maxR = Math.max(...bs.map((b) => b.x + b.w / 2))
    const minT = Math.min(...bs.map((b) => b.y - b.h / 2)), maxB = Math.max(...bs.map((b) => b.y + b.h / 2))
    editL((l) => {
      for (const b of bs) {
        const p = isText(b.id) ? l.texts.find((t) => t.id === b.id)! : l.jacks[b.id]
        const offY = isText(b.id) ? p.y - b.y : 0
        if (how === 'l') p.x = minL + b.w / 2
        if (how === 'r') p.x = maxR - b.w / 2
        if (how === 'c') p.x = (minL + maxR) / 2
        if (how === 't') p.y = minT + b.h / 2 + offY
        if (how === 'b') p.y = maxB - b.h / 2 + offY
        if (how === 'm') p.y = (minT + maxB) / 2 + offY
        if (how === 'pc') p.x = l.w / 2 + (b.x - (minL + maxR) / 2) * (bs.length > 1 ? 1 : 0)
        if (how === 'pm') p.y = l.h / 2 + (b.y - (minT + maxB) / 2) * (bs.length > 1 ? 1 : 0) + offY
        p.x = Math.round(p.x * 10) / 10; p.y = Math.round(p.y * 10) / 10
      }
    })
  }
  const distribute = (axis: 'h' | 'v') => {
    const bs = [...sel].map((id) => ({ id, ...boxOf(id) }))
    if (bs.length < 3) return
    bs.sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y))
    const first = bs[0], last = bs[bs.length - 1]
    // Equal gaps between edges.
    const span = axis === 'h' ? (last.x + last.w / 2) - (first.x - first.w / 2) : (last.y + last.h / 2) - (first.y - first.h / 2)
    const sizes = bs.reduce((t, b) => t + (axis === 'h' ? b.w : b.h), 0)
    const gap = (span - sizes) / (bs.length - 1)
    let cur = axis === 'h' ? first.x - first.w / 2 : first.y - first.h / 2
    editL((l) => {
      for (const b of bs) {
        const sz = axis === 'h' ? b.w : b.h
        const c = Math.round((cur + sz / 2) * 10) / 10
        const p = isText(b.id) ? l.texts.find((t) => t.id === b.id)! : l.jacks[b.id]
        if (axis === 'h') p.x = c; else p.y = c + (isText(b.id) ? p.y - b.y : 0)
        cur += sz + gap
      }
    })
  }

  // MARK: Canvas interaction
  const svgRef = useRef<SVGSVGElement>(null)
  const toMM = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const m = svg.getScreenCTM()!.inverse(); const r = pt.matrixTransform(m); return { x: r.x, y: r.y }
  }
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id')
    const start = toMM(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (!id) {
      if (!e.shiftKey) setSel(new Set())
      setMarquee({ x0: start.x, y0: start.y, x1: start.x, y1: start.y })
      return
    }
    let ids = sel
    if (e.shiftKey || e.metaKey) { ids = new Set(sel); if (ids.has(id)) ids.delete(id); else ids.add(id); setSel(ids); return }
    if (!sel.has(id)) { ids = new Set([id]); setSel(ids) }
    // Drag: positions relative to start, snapped on the anchor item.
    const base = spec
    const anchor = posOf(id)!
    let moved = false
    const onMove = (ev: PointerEvent) => {
      const p = toMM(ev)
      let dx = p.x - start.x, dy = p.y - start.y
      if (grid) { dx = snapV(anchor.x + dx) - anchor.x; dy = snapV(anchor.y + dy) - anchor.y }
      if (!moved && Math.hypot(dx, dy) < 0.5) return
      moved = true
      setSpecRaw(produce(base, (d) => {
        for (const sid of ids) {
          if (isText(sid)) { const t = d.layout!.texts.find((x) => x.id === sid); const t0 = base.layout!.texts.find((x) => x.id === sid); if (t && t0) { t.x = Math.round((t0.x + dx) * 10) / 10; t.y = Math.round((t0.y + dy) * 10) / 10 } }
          else { const j0 = base.layout!.jacks[sid]; if (j0) d.layout!.jacks[sid] = { x: Math.round((j0.x + dx) * 10) / 10, y: Math.round((j0.y + dy) * 10) / 10 } }
        }
      }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp)
      if (moved) setPast((p) => [...p.slice(-60), base])
    }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }
  const onPointerMove = (e: React.PointerEvent) => { if (marquee) { const p = toMM(e); setMarquee({ ...marquee, x1: p.x, y1: p.y }) } }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!marquee) return
    const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1), y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1)
    setMarquee(null)
    if (x1 - x0 < 1 && y1 - y0 < 1) return
    const hit = [...spec.inserts.map((x) => x.pid!).filter(Boolean), ...L.texts.map((t) => t.id)].filter((id) => { const b = boxOf(id); return b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1 })
    setSel(new Set([...(e.shiftKey ? sel : []), ...hit]))
  }
  // Keyboard: arrows nudge, Delete, ⌘D, ⌘A, ⌘Z.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      const step = e.altKey ? 0.5 : grid || 1
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (d && sel.size) { e.preventDefault(); move(sel, d[0], d[1]); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); remove(sel); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(new Set([...spec.inserts.map((x) => x.pid!), ...L.texts.map((t) => t.id)])); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo() }
    }
    // Menu shortcuts (Electron sends ⌘Z / ⌘A through the app menu).
    const u = () => undo()
    const all = () => setSel(new Set([...spec.inserts.map((x) => x.pid!), ...L.texts.map((t) => t.id)]))
    window.addEventListener('keydown', k, true)
    window.addEventListener('designer:undo', u)
    window.addEventListener('designer:selectAll', all)
    return () => { window.removeEventListener('keydown', k, true); window.removeEventListener('designer:undo', u); window.removeEventListener('designer:selectAll', all) }
  })

  // MARK: Save
  const applyToPlaced = (p: ProductDefinition, only?: string) => {
    const st = useStore.getState()
    const hits = st.project.equipment.filter((e) => (only ? e.id === only : e.product.key === p.key || e.id === instanceId))
    if (!hits.length) return 0
    st.apply(`Update ${p.model}`, (d) => {
      for (const e of d.equipment) if (hits.some((h) => h.id === e.id)) keepInViews(d, e.id, () => { e.product = structuredClone(p); refreshBoxPorts(d, e) })
      const ids = new Map(d.equipment.map((e) => [e.id, new Set(e.product.ports.map((x) => x.id))]))
      d.cables = d.cables.filter((c) => ids.get(c.from.equipment)?.has(c.from.port) && ids.get(c.to.equipment)?.has(c.to.port))
    })
    return hits.length
  }
  const saveLibrary = async (place: boolean) => {
    setSaving(true)
    try {
      const p = { ...(instance ? withoutPortNumbers(instance, product) : product), source: 'user' as const, revision: initial.revision + 1 }
      await api.saveUserProduct(p)
      await useStore.getState().reloadLibrary()
      const n = applyToPlaced(p)
      if (place) addProductToDiagram(p)
      else useStore.getState().notify(n ? `Saved “${p.model}” and updated ${n} placed` : `Saved “${p.model}” to your library`)
      close()
    } finally { setSaving(false) }
  }
  const saveInstance = () => {
    if (!instance) return
    const p = { ...product, key: `${product.key}@${instance.id}`, source: 'user' as const, revision: initial.revision + 1 }
    applyToPlaced(p, instance.id)
    useStore.getState().notify(`Updated ${instance.tag} only`)
    close()
  }

  // MARK: Face settings
  const setKind = (k: PlateKind) => setStyle(k, PLATE_STYLE_LIST[k][k === 'floorBox' || k === 'wallBox' ? 1 : 0])
  const setStyle = (kind: PlateKind, style: string) => {
    const sz = PLATE_SIZES[style]
    edit((d) => {
      d.kind = kind; d.style = style
      if (sz) { d.layout!.w = sz.w; d.layout!.h = sz.h; d.layout!.shape = sz.shape }
      if (kind === 'rackPanel' && d.layout!.finish === 'white') d.layout!.finish = 'black'
      // Keep jacks on the face.
      for (const ins of d.inserts) { const p = d.layout!.jacks[ins.pid!]; if (p) { const f = footprint(ins.module); p.x = Math.min(Math.max(p.x, f.w / 2), d.layout!.w - f.w / 2); p.y = Math.min(Math.max(p.y, f.h / 2), d.layout!.h - f.h / 2) } }
    })
  }

  const one = sel.size === 1 ? [...sel][0] : null
  const oneJack = one && !isText(one) ? spec.inserts.find((x) => x.pid === one) : undefined
  const oneText = one && isText(one) ? L.texts.find((t) => t.id === one) : undefined
  const pad = spec.kind === 'rackPanel' ? 6 : 12
  const groups = GROUP_ORDER.map((g) => [g, PLATE_MODULE_KEYS.filter((k) => PLATE_MODULES[k].group === g || (g === 'Power' && PLATE_MODULES[k].power))] as const).filter(([, ks]) => ks.length)

  return (
    <Modal title={instance ? `Design ${instance.tag} · ${initial.model}` : isNew ? `New ${KIND_NAME[spec.kind]}` : `Design ${initial.model}`} onClose={close} wide
      footer={<>
        <span className="muted">{jacks} connector{jacks === 1 ? '' : 's'} · {product.ports.length} ports{problems.length ? ` · ${problems[0]}` : ''}</span>
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        {instance && <button disabled={!!problems.length || saving} onClick={saveInstance}>Save to This Device Only</button>}
        {isNew && <button disabled={!!problems.length || saving} onClick={() => void saveLibrary(false)}>Save to Library</button>}
        <button className="primary" disabled={!!problems.length || saving} onClick={() => void saveLibrary(isNew)}>
          {isNew ? 'Save & Add to Diagram' : instance || isBuiltIn ? 'Save to Library & Update All' : 'Save to Library'}
        </button>
      </>}>
      <div className="pd">
        <div className="pd-top">
          <Segmented<PlateKind> value={spec.kind} onChange={setKind} options={[{ value: 'wallBox', label: 'Wall Box' }, { value: 'wallPlate', label: 'Gang Plate' }, { value: 'floorBox', label: 'Floor Box / Pocket' }, { value: 'rackPanel', label: 'Rack Panel' }]} />
          <Select value={spec.style} onChange={(v) => setStyle(spec.kind, v)} options={PLATE_STYLE_LIST[spec.kind].map((s) => ({ value: s, label: s }))} />
          {spec.style === 'Custom' && (<>
            <LenInput value={L.w} min={20} max={1000} label="W" width={60} onCommit={(v) => editL((l) => { l.w = v ?? l.w })} />
            <LenInput value={L.h} min={20} max={1000} label="H" width={60} onCommit={(v) => editL((l) => { l.h = v ?? l.h })} />
            <Select value={L.shape ?? 'rect'} onChange={(v) => editL((l) => { l.shape = v === 'round' ? 'round' : undefined })} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'round', label: 'Round' }]} />
          </>)}
          <span className="spacer" />
          <input className="pd-name" value={name} placeholder="Name, e.g. Podium Plate" onChange={(e) => setName(e.target.value)} />
          <input className="pd-maker" value={maker} placeholder="Manufacturer" onChange={(e) => setMaker(e.target.value)} />
        </div>
        <div className="pd-body">
          <div className="pd-palette">
            <h4>Connectors</h4>
            <p className="muted small">Click to add, or drag onto the face.</p>
            {groups.map(([g, ks]) => (
              <div key={g}>
                <h5>{g}</h5>
                <div className="pd-chips">
                  {ks.map((k) => (
                    <button key={k} className="pd-chip" draggable onDragStart={(e) => { e.dataTransfer.setData('text/x-plate-module', k); e.dataTransfer.effectAllowed = 'copy' }}
                      onClick={() => addJack(k)} title={PLATE_MODULES[k].name}>{short(k)}</button>
                  ))}
                </div>
              </div>
            ))}
            <h5>Text</h5>
            <button className="pd-chip" onClick={addText}>＋ Text</button>
          </div>
          <div className="pd-canvas-wrap">
            <div className="pd-tools">
              <span className="pd-group" title="Align the selection">
                <button onClick={() => align('l')} title="Align left edges">⇤</button>
                <button onClick={() => align('c')} title="Align centres (vertical line)">↔</button>
                <button onClick={() => align('r')} title="Align right edges">⇥</button>
                <button onClick={() => align('t')} title="Align top edges">⤒</button>
                <button onClick={() => align('m')} title="Align middles (horizontal line)">↕</button>
                <button onClick={() => align('b')} title="Align bottom edges">⤓</button>
              </span>
              <span className="pd-group" title="Distribute (3 or more)">
                <button disabled={sel.size < 3} onClick={() => distribute('h')} title="Distribute horizontally – equal gaps">⋯</button>
                <button disabled={sel.size < 3} onClick={() => distribute('v')} title="Distribute vertically – equal gaps">⋮</button>
              </span>
              <span className="pd-group" title="Centre on the face">
                <button disabled={!sel.size} onClick={() => align('pc')} title="Centre horizontally on the face">⊟</button>
                <button disabled={!sel.size} onClick={() => align('pm')} title="Centre vertically on the face">⊞</button>
              </span>
              <label className="pd-snap"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
              <Select value={L.grid} width={80} onChange={(v) => editL((l) => { l.grid = v })} options={((g0) => (g0.includes(L.grid) ? g0 : [...g0, L.grid].sort((a, b) => a - b)))(imperial() ? [0.79375, 1.5875, 3.175, 6.35, 12.7] : [0.5, 1, 2, 2.5, 5, 10]).map((g) => ({ value: g, label: imperial() ? `${{ 0.79375: '1/32', 1.5875: '1/16', 3.175: '1/8', 6.35: '1/4', 12.7: '1/2' }[g] ?? fmtLen(g, 3)}"` : `${g} mm` }))} />
              <span className="pd-group">
                <button onClick={() => edit((d) => { d.layout!.jacks = { ...d.layout!.jacks, ...autoArrange(d, { w: d.layout!.w, h: d.layout!.h, ru: spec.kind === 'rackPanel' ? 1 : undefined }) } })} title="Arrange all connectors in neat rows">Auto-arrange</button>
                <button disabled={!sel.size} onClick={duplicate} title="Duplicate (⌘D)">Duplicate</button>
                <button disabled={!sel.size} className="danger" onClick={() => remove(sel)} title="Delete (⌫)">Delete</button>
                <button disabled={!past.length} onClick={undo} title="Undo (⌘Z)">Undo</button>
              </span>
              <span className="spacer" />
              <span className="pd-group"><button onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>−</button><button onClick={() => setZoom(1)}>Fit</button><button onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>+</button></span>
            </div>
            <div className="pd-canvas" onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-plate-module')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
              onDrop={(e) => { const k = e.dataTransfer.getData('text/x-plate-module'); if (k && svgRef.current) { e.preventDefault(); addJack(k, toMM(e)) } }}>
              <svg ref={svgRef} viewBox={`${-pad} ${-pad} ${L.w + pad * 2} ${L.h + pad * 2}`} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                <g dangerouslySetInnerHTML={{ __html: plateInner(spec, { selected: sel, interactive: true, grid: snap ? L.grid : 0 }) }} />
                {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} fill="rgba(10,132,255,0.1)" stroke="#0a84ff" strokeWidth={0.4} />}
              </svg>
            </div>
            <p className="muted small pd-hint">Drag to move (snaps to the grid) · Shift-click or drag a box to select several · arrows nudge (⌥ for a finer step) · ⌘C / ⌘X / ⌘V copy, cut &amp; paste (also into another box) · ⌘D duplicates · ⌫ deletes · {fmtLenPair(L.w, L.h, 2)}</p>
          </div>
          <div className="pd-inspector form">
            {oneJack ? (<>
              <h4>Connector</h4>
              <label className="field-label">Label on the plate (and port name)</label>
              <input value={oneJack.label ?? ''} placeholder={short(oneJack.module)} onChange={(e) => edit((d) => { const x = d.inserts.find((q) => q.pid === one); if (x) x.label = e.target.value || undefined }, false)} onBlur={() => setPast((p) => [...p, spec])} />
              <label className="field-label">Type</label>
              <Select value={oneJack.module} onChange={(v) => edit((d) => { const x = d.inserts.find((q) => q.pid === one); if (x) { x.module = v; x.rear = PLATE_MODULES[v].rear } })} options={PLATE_MODULE_KEYS.map((k) => ({ value: k, label: PLATE_MODULES[k].name }))} />
              {!PLATE_MODULES[oneJack.module]?.power && (<>
                <label className="field-label">Back of plate</label>
                <Select value={oneJack.rear} onChange={(v) => edit((d) => { const x = d.inserts.find((q) => q.pid === one); if (x) x.rear = v })} options={REAR_OPTIONS} />
              </>)}
              {isMultipin(oneJack.module) && (() => {
                const ch = tiedTo(spec, one!), cap = MULTIPIN_CHANNELS[oneJack.module]
                return (<div className="pd-tie">
                  <label className="field-label">Channels ({ch.length} of {cap})</label>
                  {ch.length ? <b>{summarizeLabels(ch.map((x) => (x.label?.trim() || short(x.module)).toUpperCase()))}</b> : <p className="muted small" style={{ margin: 0 }}>Nothing tied yet – select this multipin and the XLRs it carries (shift-click or drag a box), then <b>Tie to Multipin</b>.</p>}
                  {ch.length > cap && <p className="error-text small" style={{ margin: 0 }}>More jacks than the {cap} channels it carries.</p>}
                  {ch.length > 0 && <span className="row-gap"><button className="mini" onClick={() => setSel(new Set([one!, ...ch.map((x) => x.pid!)]))}>Select its jacks</button><button className="mini" onClick={() => untie([one!])}>Untie all</button></span>}
                </div>)
              })()}
              {oneJack.tie && (<div className="pd-tie">
                <label className="field-label">Multipin channel</label>
                <span className="row-gap"><b>Ch {tiedTo(spec, oneJack.tie).findIndex((x) => x.pid === one) + 1} of {nameOf(oneJack.tie)}</b><button className="mini" onClick={() => untie([one!])}>Untie</button></span>
                <p className="muted small" style={{ margin: 0 }}>Wired inside the box to the multipin. Its own tie line stays, so it can also go to a patch bay.</p>
              </div>)}
              <label className="field-label">Position (centre, from top-left)</label>
              <span className="row-gap">
                X <LenInput value={L.jacks[one!].x} width={60} onCommit={(v) => setPos(one!, v ?? 0, L.jacks[one!].y)} />
                Y <LenInput value={L.jacks[one!].y} width={60} onCommit={(v) => setPos(one!, L.jacks[one!].x, v ?? 0)} />
              </span>
            </>) : oneText ? (<>
              <h4>Text</h4>
              <textarea rows={3} value={oneText.text} onChange={(e) => editL((l) => { const t = l.texts.find((q) => q.id === one); if (t) t.text = e.target.value }, false)} onBlur={() => setPast((p) => [...p, spec])} />
              <span className="row-gap">
                Size <LenInput value={oneText.size} min={1} max={30} width={56} onCommit={(v) => editL((l) => { const t = l.texts.find((q) => q.id === one); if (t) t.size = v ?? t.size })} />
                <label className="toggle"><input type="checkbox" checked={!!oneText.bold} onChange={(e) => editL((l) => { const t = l.texts.find((q) => q.id === one); if (t) t.bold = e.target.checked })} /> Bold</label>
              </span>
              <Segmented value={oneText.align ?? 'middle'} onChange={(v) => editL((l) => { const t = l.texts.find((q) => q.id === one); if (t) t.align = v })} options={[{ value: 'start', label: 'Left' }, { value: 'middle', label: 'Centre' }, { value: 'end', label: 'Right' }]} />
              <label className="field-label">Position (from top-left)</label>
              <span className="row-gap">
                X <LenInput value={oneText.x} width={60} onCommit={(v) => setPos(one!, v ?? 0, oneText.y)} />
                Y <LenInput value={oneText.y} width={60} onCommit={(v) => setPos(one!, oneText.x, v ?? 0)} />
              </span>
            </>) : sel.size > 1 ? (<>
              <h4>{sel.size} selected</h4>
              <p className="muted small">Use the align and distribute buttons above, or drag them together.</p>
              {selMps.length === 1 && tieable.length > 0 && (<div className="pd-tie">
                <h4>Multipin</h4>
                <button className="primary" onClick={() => tie(selMps[0].pid!, tieable.map((x) => x.pid!))}>Tie {tieable.length} jack{tieable.length === 1 ? '' : 's'} to {nameOf(selMps[0].pid!)}</button>
                <p className="muted small" style={{ margin: 0 }}>They become its channels (in their order on the box) and line up under it on the wiring diagram. Their own tie lines stay, so you can still wire them to a patch bay. The multipin gets a channel summary, e.g. “M1-8, RET 1-4”.{tiedTo(spec, selMps[0].pid!).length + tieable.filter((x) => x.tie !== selMps[0].pid).length > MULTIPIN_CHANNELS[selMps[0].module] ? ` That’s more than its ${MULTIPIN_CHANNELS[selMps[0].module]} channels.` : ''}</p>
              </div>)}
              {selMps.length > 1 && <p className="muted small">Select one multipin with its jacks to tie them.</p>}
              {tieable.some((x) => x.tie) && <button className="mini" onClick={() => untie(tieable.filter((x) => x.tie).map((x) => x.pid!))}>Untie selected</button>}
            </>) : (<>
              <h4>Face</h4>
              <label className="field-label">Connector labels</label>
              <Segmented value={L.labelPos} onChange={(v) => editL((l) => { l.labelPos = v })} options={[{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }, { value: 'none', label: 'None' }]} />
              {hasPower && (<>
                <h4>Circuit</h4>
                <span className="row-gap">
                  <NumberInput value={spec.power?.amps ?? 20} min={5} step={5} unit="A" width={56} onCommit={(n) => edit((d) => { d.power = { volts: d.power?.volts ?? 120, amps: n ?? 20 } })} />
                  <NumberInput value={spec.power?.volts ?? 120} min={12} step={1} unit="V" width={56} onCommit={(n) => edit((d) => { d.power = { amps: d.power?.amps ?? 20, volts: n ?? 120 } })} />
                </span>
                <p className="muted small">Receptacles act as building power: set the panel and circuit on the placed device.</p>
              </>)}
              <h4>Connectors</h4>
              <div className="pd-list">
                {spec.inserts.map((x) => (
                  <button key={x.pid} className="pd-list-row" onClick={() => setSel(new Set([x.pid!]))}>
                    <b>{x.label || short(x.module)}</b><span className="muted small">{short(x.module)}</span>
                  </button>
                ))}
                {!spec.inserts.length && <p className="muted small">Nothing yet – click a connector on the left.</p>}
              </div>
              <p className="muted small">Each connector is a port: the room-side jack on the left of the diagram card and its tie line on the right. The face drawing shows on the card.</p>
            </>)}
          </div>
        </div>
      </div>
    </Modal>
  )
}

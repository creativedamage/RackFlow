import { create } from 'zustand'
import { cardSide, connectMany, type BulkResult, type CandidateQuality, type EquipmentInstance, type PortAddress } from '@core/index'
import { useStore } from '../store'

/** Transient state while the user drags a new wire or click-picks ports. */
interface WiringState {
  origin: PortAddress | null
  candidates: Map<string, CandidateQuality>
  start: (origin: PortAddress, c: Map<string, CandidateQuality>) => void
  end: () => void
  /** Click-picked ports, in pick order. */
  picked: PortAddress[]
  togglePick: (a: PortAddress) => void
  setPicks: (a: PortAddress[]) => void
  clearPicks: () => void
}

export const useWiring = create<WiringState>((set) => ({
  origin: null,
  candidates: new Map(),
  start: (origin, candidates) => set({ origin, candidates }),
  end: () => set({ origin: null, candidates: new Map() }),
  picked: [],
  togglePick: (a) => set((st) => {
    const has = st.picked.some((x) => x.equipment === a.equipment && x.port === a.port)
    return { picked: has ? st.picked.filter((x) => !(x.equipment === a.equipment && x.port === a.port)) : [...st.picked, a] }
  }),
  setPicks: (picked) => set({ picked }),
  clearPicks: () => set({ picked: [] }),
}))

export const pickIndex = (picked: PortAddress[], a: PortAddress) => picked.findIndex((x) => x.equipment === a.equipment && x.port === a.port)

/**
 * Click-to-wire. Clicking ports on one device picks them (shift-click picks
 * the whole run down that side, ⌘-click adds ports from another device).
 * Clicking a port on a different device then cascades: the picked ports land
 * on that port and the ones below it on the same side of the card.
 * `eq` is the device as shown (a signal view may show only some ports).
 */
export function clickPort(eq: EquipmentInstance, portId: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
  const w = useWiring.getState()
  const me: PortAddress = { equipment: eq.id, port: portId }
  const picked = w.picked
  const others = picked.filter((x) => x.equipment !== eq.id)
  const add = e.metaKey || e.ctrlKey

  // Cascade onto this device.
  if (picked.length && others.length === picked.length && !add) {
    const s = useStore.getState()
    let res: BulkResult | undefined
    const only = new Set(eq.product.ports.map((p) => p.id))
    s.apply(picked.length > 1 ? `Patch ${picked.length} Connections` : 'Connect', (d) => { res = connectMany(d, picked, me, only) })
    w.clearPicks()
    if (res) {
      const n = res.made.length, k = res.skipped.length
      if (!n) s.notify('Those ports can’t connect here – pick a compatible port', { kind: 'warning' })
      else s.notify(`Connected ${n} port${n === 1 ? '' : 's'}${k ? ` · ${k} had no free compatible port` : ''}`, { undo: true, kind: k ? 'warning' : 'success' })
      if (n) s.select([], res.made[0].cable)
    }
    return
  }

  // Shift: pick the run on this side from the last pick on this device to here.
  if (e.shiftKey) {
    const last = [...picked].reverse().find((x) => x.equipment === eq.id)
    if (last) {
      const side = cardSide(eq, portId).filter((p) => eq.product.ports.some((x) => x.id === p.id))
      const a = side.findIndex((p) => p.id === last.port), b = side.findIndex((p) => p.id === portId)
      if (a >= 0 && b >= 0) {
        const run = (a <= b ? side.slice(a, b + 1) : side.slice(b, a + 1).reverse()).map((p) => ({ equipment: eq.id, port: p.id }))
        w.setPicks([...picked.filter((x) => pickIndex(run, x) < 0), ...run])
        return
      }
    }
  }
  w.togglePick(me)
}

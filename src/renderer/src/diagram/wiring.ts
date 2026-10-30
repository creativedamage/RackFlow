import { create } from 'zustand'
import type { CandidateQuality, PortAddress } from '@core/index'

/** Transient state while the user drags a new wire. */
interface WiringState {
  origin: PortAddress | null
  candidates: Map<string, CandidateQuality>
  start: (origin: PortAddress, c: Map<string, CandidateQuality>) => void
  end: () => void
  /** Shift-clicked ports for patching multiples, in click order. */
  picked: PortAddress[]
  togglePick: (a: PortAddress) => void
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
  clearPicks: () => set({ picked: [] }),
}))

export const pickIndex = (picked: PortAddress[], a: PortAddress) => picked.findIndex((x) => x.equipment === a.equipment && x.port === a.port)

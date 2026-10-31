import { create } from 'zustand'

type Which = 'insp' | 'tp'
const LIMITS: Record<Which, { def: number; min: number; max: number }> = { insp: { def: 310, min: 260, max: 640 }, tp: { def: 460, min: 320, max: 900 } }
const read = (w: Which) => { try { const v = Number(localStorage.getItem(`rf.panel.${w}`)); return v >= LIMITS[w].min && v <= LIMITS[w].max ? v : LIMITS[w].def } catch { return LIMITS[w].def } }
const useWidths = create<Record<Which, number>>(() => ({ insp: read('insp'), tp: read('tp') }))

export const usePanelWidth = (w: Which) => useWidths((s) => s[w])

/** Drag handle on the left edge of the right-hand panel; double-click resets. */
export function PanelResizer({ which }: { which: Which }) {
  const set = (v: number) => {
    const { min, max } = LIMITS[which]
    const n = Math.round(Math.min(max, Math.max(min, v)))
    useWidths.setState({ [which]: n } as Partial<Record<Which, number>>)
    try { localStorage.setItem(`rf.panel.${which}`, String(n)) } catch { /* private mode */ }
  }
  return (
    <div className="panel-resizer" style={{ right: `calc(var(--${which}-w) - 3px)` }} title="Drag to resize · double-click to reset"
      onDoubleClick={() => set(LIMITS[which].def)}
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX, start = useWidths.getState()[which]
        const move = (ev: PointerEvent) => set(start + (startX - ev.clientX))
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing') }
        document.body.classList.add('resizing')
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }} />
  )
}

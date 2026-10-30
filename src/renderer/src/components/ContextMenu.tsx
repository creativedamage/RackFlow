import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string } | 'sep'
interface MenuState { at: { x: number; y: number } | null; items: MenuItem[] }
const useMenu = create<MenuState>(() => ({ at: null, items: [] }))

/** Shows a right-click menu at the pointer. Call from an onContextMenu handler. */
export function showContextMenu(e: React.MouseEvent | MouseEvent, items: MenuItem[]) {
  e.preventDefault()
  e.stopPropagation()
  useMenu.setState({ at: { x: e.clientX, y: e.clientY }, items })
}
const hide = () => useMenu.setState({ at: null, items: [] })

/** Rendered once by App. */
export function ContextMenu() {
  const { at, items } = useMenu()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  useLayoutEffect(() => {
    if (!at || !ref.current) { setPos(at); return }
    const r = ref.current.getBoundingClientRect()
    setPos({ x: Math.min(at.x, window.innerWidth - r.width - 6), y: Math.min(at.y, window.innerHeight - r.height - 6) })
  }, [at])
  useEffect(() => {
    if (!at) return
    const off = (e: Event) => { if (!ref.current?.contains(e.target as Node)) hide() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('pointerdown', off, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', hide)
    window.addEventListener('wheel', hide, true)
    return () => {
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('wheel', hide, true)
    }
  }, [at])
  if (!at) return null
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: (pos ?? at).x, top: (pos ?? at).y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) => it === 'sep'
        ? <div key={i} className="cm-sep" />
        : <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled}
            onClick={() => { hide(); it.onClick() }}>
            <span>{it.label}</span>{it.hint && <span className="cm-hint">{it.hint}</span>}
          </button>)}
    </div>
  )
}

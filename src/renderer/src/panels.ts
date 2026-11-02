import { createElement as h } from 'react'
import { useStore } from './store'

/** Show or collapse the left sidebar (⌃⌘S); remembered between launches. */
export function toggleSidebar(show?: boolean) {
  const s = useStore.getState()
  const next = show ?? !s.showSidebar
  s.set({ showSidebar: next, peek: null })
  try { localStorage.setItem('rackflow.sidebar', next ? 'on' : 'off') } catch { /* private mode */ }
}

/** The sidebar button: a rounded rectangle with a left pane (like macOS). */
export function SidebarButton({ side = 'left', className = '' }: { side?: 'left' | 'right'; className?: string }) {
  const on = useStore((s) => (side === 'left' ? s.showSidebar : s.showInspector))
  const label = side === 'left' ? 'Sidebar' : 'Inspector'
  return h('button', {
    className: `icon-btn sb-toggle ${on ? 'on' : ''} ${className}`,
    title: `${on ? 'Hide' : 'Show'} ${label.toLowerCase()} (${side === 'left' ? '⌃⌘S' : '⌥⌘I'})`, 'aria-label': label, 'aria-pressed': on,
    onClick: () => (side === 'left' ? toggleSidebar() : useStore.getState().set({ showInspector: !on, peek: null })),
  }, h('svg', { viewBox: '0 0 20 20', width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
    h('rect', { x: 2.5, y: 3.5, width: 15, height: 13, rx: 3 }),
    h('path', { d: side === 'left' ? 'M7.5 3.5v13' : 'M12.5 3.5v13' }),
    h('path', { d: side === 'left' ? 'M4.6 6.5h1.2M4.6 8.7h1.2M4.6 10.9h1.2' : 'M14.2 6.5h1.2M14.2 8.7h1.2M14.2 10.9h1.2', strokeLinecap: 'round' })))
}

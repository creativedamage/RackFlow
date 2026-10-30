import type { ReactNode } from 'react'
import { useStore, type ToastKind } from '../store'

const ICON: Record<ToastKind, ReactNode> = {
  success: <path d="M5 10.5l3.2 3.2L15 7" />,
  info: <><circle cx="10" cy="10" r="0.6" /><path d="M10 9v5M10 6.2v.1" /></>,
  warning: <><path d="M10 3.5l7 12.5H3z" /><path d="M10 8.5v3.5M10 14.2v.1" /></>,
  error: <><circle cx="10" cy="10" r="7" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" /></>,
}

/** Bottom-centre notification stack: icon, message, optional Undo, dismiss. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const canUndo = useStore((s) => s.past.length > 0)
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <svg className="toast-icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON[t.kind]}</svg>
          <span className="toast-msg">{t.msg}</span>
          {t.undo && canUndo && <button className="toast-action" onClick={() => { useStore.getState().undo(); dismiss(t.id) }}>Undo</button>}
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  )
}

/** Text input that commits on blur/Enter (one undo step per edit, not per keystroke). */
export function TextInput({ value, onCommit, placeholder, multiline, className }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean; className?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => { if (draft !== value) onCommit(draft) }
  if (multiline)
    return <textarea className={className} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit} rows={3} />
  return (
    <input className={className} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(value) }} />
  )
}

export function NumberInput({ value, onCommit, unit, step = 1, min, max, allowEmpty, width = 84 }: {
  value: number | null; onCommit: (v: number | null) => void; unit?: string; step?: number; min?: number; max?: number; allowEmpty?: boolean; width?: number
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(round(value)))
  useEffect(() => setDraft(value == null ? '' : String(round(value))), [value])
  const commit = () => {
    if (draft.trim() === '' && allowEmpty) { if (value != null) onCommit(null); return }
    let n = Number(draft)
    if (!Number.isFinite(n)) { setDraft(value == null ? '' : String(round(value))); return }
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    if (n !== value) onCommit(n)
    else setDraft(String(round(n)))
  }
  return (
    <span className="number-input">
      <input type="number" step={step} value={draft} style={{ width }} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      {unit && <span className="unit">{unit}</span>}
    </span>
  )
}
const round = (n: number) => Math.round(n * 1000) / 1000

export function Select<T extends string | number>({ value, options, onChange, width }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: number
}) {
  return (
    <select value={String(value)} style={width ? { width } : undefined}
      onChange={(e) => { const o = options.find((x) => String(x.value) === e.target.value); if (o) onChange(o.value) }}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Esc closes only the top-most dialog (e.g. Sheet Numbers over Print).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const all = document.querySelectorAll('.modal-backdrop')
      if (all[all.length - 1] === ref.current) onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" ref={ref} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}

export const SeverityIcon = ({ s }: { s: 'info' | 'warning' | 'error' }) =>
  <span className={`sev sev-${s}`} aria-label={s}>{s === 'error' ? '✕' : s === 'warning' ? '!' : 'i'}</span>

export const Dot = ({ color, square }: { color: string; square?: boolean }) =>
  <span className="dot" style={{ background: color, borderRadius: square ? 2 : 999 }} />

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children}</div>
}

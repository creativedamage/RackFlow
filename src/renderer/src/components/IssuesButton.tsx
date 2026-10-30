import { useEffect, useMemo, useRef, useState } from 'react'
import type { Severity } from '@core/index'
import { useStore } from '../store'

type Filter = 'all' | Severity

/** Toolbar design-rule-check pill + popover listing every issue (click to jump to it). */
export function IssuesButton() {
  const issues = useStore((s) => s.issues)
  const focus = useStore((s) => s.focusIssue)
  const project = useStore((s) => s.project)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const ref = useRef<HTMLDivElement>(null)
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length
  const errors = count('error'), warnings = count('warning'), infos = count('info')
  const shown = useMemo(() => issues.filter((i) => filter === 'all' || i.severity === filter), [issues, filter])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc) }
  }, [open])

  const state = errors ? 'error' : warnings ? 'warning' : 'ok'
  return (
    <div className="issues-wrap" ref={ref}>
      <button className={`issues-pill ${state} ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title="Design rule check">
        {state === 'ok' ? (
          <><Icon kind="ok" /><span>All clear</span></>
        ) : (
          <>
            {errors > 0 && <span className="cnt error"><Icon kind="error" />{errors}</span>}
            {warnings > 0 && <span className="cnt warning"><Icon kind="warning" />{warnings}</span>}
          </>
        )}
      </button>
      {open && (
        <div className="issues-pop">
          <div className="ip-head">
            <b>Design check</b>
            <span className="muted small">{project.equipment.length} devices · {project.cables.length} cables</span>
          </div>
          <div className="ip-tabs">
            {([['all', `All ${issues.length}`], ['error', `Errors ${errors}`], ['warning', `Warnings ${warnings}`], ['info', `Notes ${infos}`]] as [Filter, string][]).map(([k, l]) => (
              <button key={k} className={`${filter === k ? 'on' : ''} ${k}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <ul className="ip-list">
            {shown.length === 0 && <li className="ip-empty"><Icon kind="ok" /> Nothing here, all good.</li>}
            {shown.map((i, n) => (
              <li key={n} className={i.severity} onClick={() => { focus(i.subject); setOpen(false) }} title="Show it">
                <Icon kind={i.severity} />
                <div><span>{i.message}</span>{i.suggestion && <small>{i.suggestion}</small>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Icon({ kind }: { kind: Severity | 'ok' }) {
  return (
    <svg className={`ii ${kind}`} viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'ok' && <path d="M3.5 8.5l3 3 6-6.5" />}
      {kind === 'error' && <><circle cx="8" cy="8" r="6" /><path d="M6 6l4 4M10 6l-4 4" /></>}
      {kind === 'warning' && <><path d="M8 2.5l6 11H2z" /><path d="M8 6.8v3M8 11.7v.1" /></>}
      {kind === 'info' && <><circle cx="8" cy="8" r="6" /><path d="M8 7.3v4M8 4.9v.1" /></>}
    </svg>
  )
}

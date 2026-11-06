import { useEffect, useState } from 'react'
import { api, isElectron } from '../platform'
import { newDocument, openDocument, useStore } from '../store'

const nameOf = (p: string) => p.split(/[\\/]/).pop()?.replace(/\.rackflow$/, '') ?? p
const folderOf = (p: string) => { const parts = p.split(/[\\/]/); parts.pop(); return parts.join('/').replace(/^\/Users\/[^/]+/, '~') }

/**
 * What you see when RackFlow opens: New, Open and recent projects. Nothing is
 * read from disk until you pick one, so macOS never asks for folder access at launch.
 */
export function StartScreen() {
  const [recent, setRecent] = useState<string[]>([])
  const [version, setVersion] = useState('')
  const hasProject = useStore((s) => s.project.equipment.length > 0 || !!s.path)
  useEffect(() => { void api.recentList().then(setRecent); void api.appVersion().then(setVersion) }, [])
  const close = () => useStore.getState().set({ showStart: false })
  useEffect(() => {
    if (!hasProject) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [hasProject])
  const open = async (p: string) => {
    if (await api.recentOpen(p)) return
    useStore.getState().notify(`“${nameOf(p)}” has been moved or deleted – removed from the list.`, { kind: 'warning' })
    setRecent((r) => r.filter((x) => x !== p))
  }

  const row = (icon: React.ReactNode, title: string, sub: string, onClick: () => void) => (
    <button className="ss-row" onClick={onClick}><span className="ss-row-ico">{icon}</span><span><b>{title}</b><small>{sub}</small></span></button>
  )
  return (
    <div className="start-screen">
      <div className="ss-drag" />
      <div className="ss-window" role="dialog" aria-label="Welcome to RackFlow">
        <div className="ss-left">
          {hasProject && <button className="ss-close" onClick={close} aria-label="Close" title="Back to the open project (Esc)">✕</button>}
          <img src="./icon.png" alt="" className="ss-icon" onError={(e) => { (e.target as HTMLElement).style.visibility = 'hidden' }} />
          <h1>RackFlow</h1>
          <span className="ss-ver">{version && (isElectron ? `Version ${version}` : version)}</span>
          <div className="ss-rows">
            {row(<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3.5" y="2.5" width="13" height="15" rx="2" /><path d="M10 7v6M7 10h6" strokeLinecap="round" /></svg>, 'New Project', 'Start a system design from scratch', () => void newDocument())}
            {row(<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M2.5 6V15a1 1 0 001 1h13a1 1 0 001-1V7.5a1 1 0 00-1-1H9.5L8 4.5H3.5a1 1 0 00-1 1z" /></svg>, 'Open Existing Project…', 'Browse for a .rackflow file', () => void openDocument())}
            {row(<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" strokeLinecap="round" /></svg>, 'Settings…', 'Folders, units, appearance', () => useStore.getState().set({ showSettings: true }))}
          </div>
        </div>
        <div className="ss-right">
          {recent.length === 0
            ? <div className="ss-none">No Recent Projects</div>
            : <ul>
              {recent.map((p) => (
                <li key={p}>
                  <button className="ss-file" onClick={() => void open(p)} title={p}>
                    <svg viewBox="0 0 28 32" width="26" height="30"><path d="M3 2.5h15l7 7v20a1 1 0 01-1 1H3a1 1 0 01-1-1v-26a1 1 0 011-1z" fill="var(--n-content)" stroke="var(--n-sep)" /><path d="M18 2.5v6a1 1 0 001 1h6" fill="none" stroke="var(--n-sep)" /><rect x="7" y="14" width="13" height="2" rx="1" fill="var(--accent)" opacity=".8" /><rect x="7" y="18.5" width="13" height="2" rx="1" fill="var(--accent)" opacity=".5" /><rect x="7" y="23" width="9" height="2" rx="1" fill="var(--accent)" opacity=".3" /></svg>
                    <span><b>{nameOf(p)}</b><small>{folderOf(p)}</small></span>
                  </button>
                  <button className="ss-forget" title="Remove from list" onClick={() => { void api.recentForget(p); setRecent((r) => r.filter((x) => x !== p)) }}>✕</button>
                </li>
              ))}
            </ul>}
        </div>
      </div>
    </div>
  )
}

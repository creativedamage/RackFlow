import { useEffect, useRef, useState } from 'react'
import type { UpdateStatus } from '../../../preload/api'
import { api, isElectron } from '../platform'
import { newDocument, openDocument, saveDocument, useStore } from '../store'

/** Toolbar indicator for app updates: download progress, then "Restart to Update". */
export function UpdatePill() {
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' })
  const [open, setOpen] = useState(false)
  const announced = useRef('')
  useEffect(() => {
    void api.updateStatus().then(setS)
    return api.onUpdateStatus((next) => {
      setS(next)
      const n = useStore.getState().notify
      if (next.state === 'ready' && announced.current !== next.version) { announced.current = next.version; n(`RackFlow ${next.version} is ready. Click “Restart to Update” in the toolbar.`, { kind: 'info', ms: 8000 }) }
      if (next.state === 'current') n(`You’re up to date (RackFlow ${next.version}).`, { kind: 'success' })
      if (next.state === 'error') n(`Couldn’t check for updates: ${next.message}`, { kind: 'warning', ms: 6000 })
      if (next.state === 'manual' && announced.current !== next.version) { announced.current = next.version; if (next.version) setOpen(true) }
    })
  }, [])

  if (s.state === 'checking') return <span className="update-pill busy">Checking for updates…</span>
  if (s.state === 'downloading') return <span className="update-pill busy" title={`Downloading RackFlow ${s.version}`}>Updating… {s.percent}%</span>
  if (s.state !== 'ready' && !(s.state === 'manual' && s.version)) return null
  return (
    <div className="update-wrap">
      <button className="update-pill ready" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" /></svg>
        {s.state === 'ready' ? 'Restart to Update' : `Update ${s.version}`}
      </button>
      {open && (
        <div className="update-pop">
          <b>RackFlow {s.version}</b>
          {s.state === 'manual' && <p className="muted small">{s.reason}</p>}
          {s.notes && <pre className="update-notes">{s.notes}</pre>}
          <div className="update-actions">
            <button onClick={() => setOpen(false)}>Later</button>
            <button onClick={() => void api.openReleasePage(s.state === 'manual' ? s.url : undefined)}>What’s New</button>
            {s.state === 'ready'
              ? <button className="primary" onClick={() => void api.installUpdate()}>Restart Now</button>
              : <button className="primary" onClick={() => void api.openReleasePage(s.url)}>Download</button>}
          </div>
          {s.state === 'ready' && <p className="muted small">If you just quit, the update installs then and the next launch is {s.version}. Unsaved work prompts first.</p>}
        </div>
      )}
    </div>
  )
}

/** The app mark in the toolbar: shows the version and a Check for Updates button. */
export function AppMenuButton() {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { void api.appVersion().then(setVersion) }, [])
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', off)
    return () => window.removeEventListener('mousedown', off)
  }, [open])
  const check = async () => {
    setChecking(true)
    try {
      const s = await api.checkForUpdates()
      if (s.state === 'manual' && !s.version) useStore.getState().notify(s.reason, { kind: 'info' })
    } finally { setChecking(false); setOpen(false) }
  }
  return (
    <div className="app-menu" ref={ref}>
      <button className="app-mark" onClick={() => setOpen(!open)} title={`RackFlow ${version}`} aria-label="About RackFlow">▦</button>
      {open && (
        <div className="app-menu-pop">
          <b>RackFlow</b>
          <span className="muted small">Version {version}</span>
          <button className="primary" disabled={checking} onClick={() => void check()}>{checking ? 'Checking…' : 'Check for Updates'}</button>
          <button onClick={() => { void api.openReleasePage(); setOpen(false) }}>Release Notes</button>
          <hr />
          {!isElectron && <>
            <button onClick={() => { setOpen(false); void newDocument() }}>New Project</button>
            <button onClick={() => { setOpen(false); void openDocument() }}>Open…</button>
            <button onClick={() => { setOpen(false); void saveDocument() }}>Save</button>
          </>}
          <button onClick={() => { setOpen(false); useStore.getState().set({ showStart: true }) }}>Start Screen</button>
          <button onClick={() => { setOpen(false); useStore.getState().set({ showSettings: true }) }}>Settings…</button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, isElectron, isMac } from '../platform'
import { useStore } from '../store'
import { saveSettings, useSettings } from '../settings'
import { applyUnits } from '../units'
import { setTheme } from '../theme'
import { setAutoSave } from '../autosave'

type Tab = 'general' | 'files'

const TABS: { value: Tab; label: string; icon: React.ReactNode }[] = [
  { value: 'general', label: 'General', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" strokeLinecap="round" /></svg> },
  { value: 'files', label: 'Files & Folders', icon: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 7v11a1.5 1.5 0 001.5 1.5h15A1.5 1.5 0 0021 18V9a1.5 1.5 0 00-1.5-1.5H11L9 5H4.5A1.5 1.5 0 003 6.5z" /></svg> },
]

/** Settings (⌘,): a Mac Settings window – icon tabs, right-aligned labels. */
export function SettingsDialog() {
  const [tab, setTab] = useState<Tab>('general')
  const st = useSettings()
  const units = useStore((s) => s.units)
  const theme = useStore((s) => s.theme)
  const autoSave = useStore((s) => s.autoSave)
  const close = () => useStore.getState().set({ showSettings: false })
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <div className="modal-backdrop prefs-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="prefs" role="dialog" aria-label="Settings">
        <div className="prefs-bar">
          <button className="prefs-close" onClick={close} aria-label="Close" />
          <span className="prefs-title">{TABS.find((t) => t.value === tab)!.label}</span>
          <div className="prefs-tabs">
            {TABS.map((t) => <button key={t.value} className={`pref-tab ${tab === t.value ? 'on' : ''}`} onClick={() => setTab(t.value)}>{t.icon}<span>{t.label}</span></button>)}
          </div>
        </div>
        <div className="prefs-body">
          {tab === 'general' && <>
            <Row label="On launch:" note="The Start window doesn’t open any files, so macOS never asks for folder access just for opening RackFlow.">
              <Radio name="launch" value={st.onLaunch} onChange={(v) => saveSettings({ onLaunch: v })} options={[['start', 'Show the Start window'], ['reopen', 'Reopen the last project']]} />
            </Row>
            <Row label="Units:">
              <select value={units} onChange={(e) => applyUnits(e.target.value as 'imperial' | 'metric')}>
                <option value="imperial">Imperial – inches, feet, pounds</option><option value="metric">Metric – millimetres, metres, kilograms</option>
              </select>
            </Row>
            <Row label="Appearance:">
              <select value={theme} onChange={(e) => setTheme(e.target.value as 'system' | 'light' | 'dark')}>
                <option value="system">Use System Setting</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </Row>
            {isElectron && <Row label="Saving:" note="Every change is written to the project file once it has been saved.">
              <label className="prefs-check"><input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} /> Auto Save</label>
            </Row>}
          </>}

          {tab === 'files' && <>
            <Row label="Projects folder:" note="Open and Save start here. Choosing it here gives RackFlow access the standard macOS way.">
              <div className="prefs-inline">
                <span className="prefs-path" title={st.projectsFolder ?? ''}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="#5aa0f0"><path d="M1.5 4v8.5a1 1 0 001 1h11a1 1 0 001-1V5.5a1 1 0 00-1-1H7.5L6 3H2.5a1 1 0 00-1 1z" /></svg>
                  {st.projectsFolder ? st.projectsFolder.split(/[\\/]/).pop() : 'None'}
                </span>
                <button disabled={!isElectron} onClick={async () => { const f = await api.chooseFolder(); if (f) saveSettings({ projectsFolder: f }) }}>Choose…</button>
                {st.projectsFolder && <button onClick={() => saveSettings({ projectsFolder: null })}>Clear</button>}
              </div>
            </Row>
            {isMac && <Row label="Folder access:" note="macOS asks once for Desktop, Documents and Downloads the first time RackFlow opens a file there. Allow or remove access in System Settings › Privacy & Security › Files and Folders.">
              <button onClick={() => void api.openPrivacySettings()}>Open Privacy Settings…</button>
            </Row>}
          </>}

        </div>
      </div>
    </div>
  )
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="prefs-radios">{options.map(([v, l]) => <label key={v}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {l}</label>)}</div>
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="prefs-row">
      <div className="prefs-label">{label}</div>
      <div className="prefs-ctl">{children}{note && <p className="prefs-note">{note}</p>}</div>
    </div>
  )
}

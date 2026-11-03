import { openDocument, saveDocument, newDocument, useStore, type Mode } from '../store'
import { SidebarButton } from '../panels'
import { isElectron } from '../platform'
import { setAutoSave } from '../autosave'
import { openExport } from '../print/ExportAllDialog'
import { useCloud } from '../share/cloudState'
import { Segmented, TextInput } from './ui'
import { IssuesButton } from './IssuesButton'
import { AppMenuButton, UpdatePill } from './UpdatePill'
import { nextTheme, setTheme } from '../theme'

export function Toolbar() {
  const mode = useStore((s) => s.mode)
  const set = useStore((s) => s.set)
  const name = useStore((s) => s.project.info.name)
  const dirty = useStore((s) => s.dirty)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const apply = useStore((s) => s.apply)
  const sidebarShown = useStore((s) => s.showSidebar && s.mode !== 'sheet' && s.mode !== 'led')
  const canSidebar = useStore((s) => s.mode !== 'sheet')
  const theme = useStore((s) => s.theme)

  const undoLabel = useStore((s) => s.past[s.past.length - 1]?.label ?? '')
  const redoLabel = useStore((s) => s.future[0]?.label ?? '')

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        {canSidebar && !sidebarShown && <div className="tb-island tb-sb"><SidebarButton /></div>}
        <div className="tb-island tb-doc">
        <AppMenuButton />
        <TextInput className="doc-title" value={name} onCommit={(v) => apply('Rename Project', (d) => { d.info.name = v || 'Untitled Project' })} />
        {isElectron ? <AutoSaveChip /> : dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
        {!isElectron && (
          <span className="file-buttons tb-island">
            <button onClick={() => void newDocument()}>New</button>
            <button onClick={() => void openDocument()}>Open…</button>
            <button onClick={() => void saveDocument()}>Save</button>
          </span>
        )}
      </div>

      <Segmented<Mode>
        value={mode}
        onChange={(m) => set({ mode: m })}
        options={[
          { value: 'diagram', label: 'Wiring Diagram', title: '⌘1' },
          { value: 'rack', label: 'Rack Elevation', title: '⌘2' },
          { value: 'patch', label: 'Patch Labels', title: '⌘3' },
          { value: 'sheet', label: 'Schedule', title: '⌘4 · spreadsheet of every cable and device' },
          { value: 'led', label: 'LED Walls', title: '⌘5 · LED wall data & power mapping' },
        ]}
      />

      <div className="toolbar-right">
        <UpdatePill />
        <div className="tb-island tb-tools">
        <ShareButton />
        <button className="icon-btn qp-btn" onClick={() => openExport()} title="Export / Print (⌘P) – choose the drawings and schedules to save, starting with what you're looking at" aria-label="Export">
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12.5V3" /><path d="M6.5 6.5L10 3l3.5 3.5" /><path d="M4 10.5v4.5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-4.5" /></svg>
        </button>
        <div className="undo-group">
          <button className="icon-btn" disabled={!canUndo} onClick={undo} title={canUndo ? `Undo ${undoLabel} (⌘Z)` : 'Nothing to undo'} aria-label="Undo">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 5L4 8.5 7.5 12" /><path d="M4.5 8.5H12a4 4 0 010 8H9" /></svg>
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title={canRedo ? `Redo ${redoLabel} (⇧⌘Z)` : 'Nothing to redo'} aria-label="Redo">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 5L16 8.5 12.5 12" /><path d="M15.5 8.5H8a4 4 0 000 8h3" /></svg>
          </button>
        </div>
        <IssuesButton />
        <button className="icon-btn theme-btn" onClick={() => setTheme(nextTheme(theme))} aria-label="Appearance"
          title={`Appearance: ${theme === 'system' ? 'System (follows macOS)' : theme === 'light' ? 'Light' : 'Dark'} – click for ${nextTheme(theme) === 'system' ? 'System' : nextTheme(theme) === 'light' ? 'Light' : 'Dark'}`}>
          {theme === 'light'
            ? <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10" cy="10" r="3.6" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></svg>
            : theme === 'dark'
              ? <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z" /></svg>
              : <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 010 14z" fill="currentColor" /></svg>}
        </button>
        <SidebarButton side="right" />
        </div>
      </div>
    </header>
  )
}

/** Auto-save status next to the title; click to turn it on or off. */
function AutoSaveChip() {
  const on = useStore((s) => s.autoSave)
  const path = useStore((s) => s.path)
  const dirty = useStore((s) => s.dirty)
  const label = !on ? (dirty ? 'Unsaved · Auto-save off' : 'Auto-save off') : !path ? (dirty ? 'Not saved yet – ⌘S once to auto-save' : 'Auto-save') : dirty ? 'Saving…' : 'Saved'
  return (
    <button className={`autosave-chip ${on ? 'on' : ''} ${dirty ? 'dirty' : ''}`} onClick={() => setAutoSave(!on)}
      title={on ? 'Auto-save is on: every change is written to the file. Click to turn it off.' : 'Auto-save is off. Click to save every change automatically.'}>
      <i />{label}
    </button>
  )
}

/** Share: people icon; a dot shows the project is live online, a badge counts open viewer notes. */
function ShareButton() {
  const shared = useStore((s) => !!s.project.cloud)
  const status = useCloud((s) => s.status)
  const open = useCloud((s) => s.notes.filter((n) => !n.resolved).length)
  return (
    <button className={`icon-btn share-btn ${shared ? 'on' : ''}`} onClick={() => useCloud.getState().set({ open: true, tab: open ? 'notes' : 'share' })}
      title={shared ? `Shared – ${status === 'live' ? 'viewers see your changes live' : status}${open ? ` · ${open} open note${open === 1 ? '' : 's'}` : ''}` : 'Share with viewers (web)'} aria-label="Share">
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7.5" cy="7" r="2.6" /><path d="M2.8 16c.6-2.6 2.4-4 4.7-4s4.1 1.4 4.7 4" /><circle cx="14" cy="7.8" r="2" /><path d="M13.6 11.6c1.9.1 3.2 1.3 3.7 3.4" /></svg>
      {shared && <span className={`share-dot ${status}`} />}
      {open > 0 && <span className="share-badge">{open}</span>}
    </button>
  )
}

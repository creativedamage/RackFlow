import { useStore, type Mode } from '../store'
import { SidebarButton } from '../panels'
import { isElectron } from '../platform'
import { setAutoSave } from '../autosave'
import { openExport } from '../print/ExportAllDialog'
import { useCloud } from '../share/cloudState'
import { Segmented, TextInput } from './ui'
import { IssuesButton } from './IssuesButton'
import { AppMenuButton, UpdatePill } from './UpdatePill'

export function Toolbar() {
  const mode = useStore((s) => s.mode)
  const set = useStore((s) => s.set)
  const name = useStore((s) => s.project.info.name)
  const dirty = useStore((s) => s.dirty)
  const apply = useStore((s) => s.apply)
  const sidebarShown = useStore((s) => s.showSidebar && s.mode !== 'sheet' && s.mode !== 'led' && s.mode !== 'boxes' && s.mode !== 'inventory')
  const canSidebar = useStore((s) => s.mode !== 'sheet' && s.mode !== 'inventory')

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        {canSidebar && !sidebarShown && <div className="tb-island tb-sb"><SidebarButton /></div>}
        <div className="tb-island tb-doc">
          <AppMenuButton />
          <TextInput className="doc-title" value={name} onCommit={(v) => apply('Rename Project', (d) => { d.info.name = v || 'Untitled Project' })} />
          {isElectron ? <AutoSaveChip /> : dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
      </div>

      <Segmented<Mode>
        value={mode}
        onChange={(m) => set({ mode: m })}
        options={[
          { value: 'diagram', label: 'Wiring', title: 'Wiring Diagram (⌘1)' },
          { value: 'rack', label: 'Racks', title: 'Rack Elevation (⌘2)' },
          { value: 'patch', label: 'Patch Labels', title: 'Patch bay labels (⌘3)' },
          { value: 'sheet', label: 'Schedule', title: 'Every cable and device as a spreadsheet (⌘4)' },
          { value: 'led', label: 'LED Walls', title: 'LED wall data & power mapping (⌘5)' },
          { value: 'boxes', label: 'Wall Boxes', title: 'Wall boxes, plates & panels – fabrication sheets (⌘6)' },
          { value: 'inventory', label: 'Inventory', title: 'Your Google Sheet inventory & pricing vs. the diagram (⌘7)' },
        ]}
      />

      <div className="toolbar-right">
        <UpdatePill />
        <div className="tb-island tb-tools">
          <IssuesButton />
          <ShareButton />
          <button className="icon-btn qp-btn" onClick={() => openExport()} title="Export / Print (⌘P)" aria-label="Export">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12.5V3" /><path d="M6.5 6.5L10 3l3.5 3.5" /><path d="M4 10.5v4.5a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-4.5" /></svg>
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

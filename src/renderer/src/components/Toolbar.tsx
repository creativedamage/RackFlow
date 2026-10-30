import { openDocument, saveDocument, newDocument, useStore, type Mode } from '../store'
import { isElectron } from '../platform'
import { Segmented, TextInput } from './ui'
import { IssuesButton } from './IssuesButton'
import { UpdatePill } from './UpdatePill'

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
  const showInspector = useStore((s) => s.showInspector)

  const undoLabel = useStore((s) => s.past[s.past.length - 1]?.label ?? '')
  const redoLabel = useStore((s) => s.future[0]?.label ?? '')

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="app-mark" aria-hidden>▦</span>
        <TextInput className="doc-title" value={name} onCommit={(v) => apply('Rename Project', (d) => { d.info.name = v || 'Untitled Project' })} />
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        {!isElectron && (
          <span className="file-buttons">
            <button onClick={newDocument}>New</button>
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
        ]}
      />

      <div className="toolbar-right">
        <UpdatePill />
        <div className="undo-group">
          <button className="icon-btn" disabled={!canUndo} onClick={undo} title={canUndo ? `Undo ${undoLabel} (⌘Z)` : 'Nothing to undo'} aria-label="Undo">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 5L4 8.5 7.5 12" /><path d="M4.5 8.5H12a4 4 0 010 8H9" /></svg>
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title={canRedo ? `Redo ${redoLabel} (⇧⌘Z)` : 'Nothing to redo'} aria-label="Redo">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 5L16 8.5 12.5 12" /><path d="M15.5 8.5H8a4 4 0 000 8h3" /></svg>
          </button>
        </div>
        <IssuesButton />
        <button className={`icon-btn ${showInspector ? 'on' : ''}`} onClick={() => set({ showInspector: !showInspector })} title="Toggle inspector (⌥⌘I)">◧</button>
      </div>
    </header>
  )
}

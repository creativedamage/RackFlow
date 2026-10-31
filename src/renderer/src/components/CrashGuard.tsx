import { Component, type ReactNode } from 'react'
import { api } from '../platform'
import { saveDocument, useStore } from '../store'

/**
 * If anything in the UI throws, show a recovery screen instead of a frozen /
 * blank window. The document lives in the store, so it can still be saved, and
 * "Try Again" re-renders without losing it.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null; saved: string | null }> {
  override state = { error: null as Error | null, saved: null as string | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  override componentDidCatch(error: Error) { console.error('RackFlow UI error', error) }
  override render() {
    const { error, saved } = this.state
    if (!error) return this.props.children
    const s = useStore.getState()
    return (
      <div className="crash">
        <div className="crash-card">
          <h2>Something went wrong</h2>
          <p>RackFlow hit an error and stopped drawing this screen. Your project is still open{s.dirty ? ' (with unsaved changes)' : ''}.</p>
          <pre>{error.message}</pre>
          <div className="row">
            <button className="primary" onClick={async () => { if (await saveDocument()) this.setState({ saved: 'Saved.' }) }}>Save Project</button>
            <button onClick={async () => {
              const p = useStore.getState().project
              const out = await api.saveProject(null, JSON.stringify(p, null, 2), `${p.info.name || 'Untitled Project'} (recovered)`)
              if (out) this.setState({ saved: `Saved a copy to ${out.split(/[\\/]/).pop()}` })
            }}>Save a Copy…</button>
            <button onClick={() => { useStore.getState().set({ selectedAccessory: null, selection: [], selectedCable: null, editingProduct: null, editingPlate: null, editingTemplate: null, finding: null }); this.setState({ error: null }) }}>Try Again</button>
            <button onClick={() => { if (!useStore.getState().dirty || confirm('Close without saving?')) api.closeWindow() }}>Close Window</button>
          </div>
          {saved && <p className="muted">{saved}</p>}
        </div>
      </div>
    )
  }
}

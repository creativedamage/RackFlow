import { api, isElectron } from './platform'
import { markSavedSnapshot, useStore } from './store'

/**
 * Auto-save: shortly after every change, the open file is overwritten (the
 * same safe write-then-rename as ⌘S). Untitled projects need one Save first
 * so there's a file to write to. Desktop app only – the web build would
 * download a copy every time.
 */
let timer: ReturnType<typeof setTimeout> | undefined
let saving = false
let again = false
let failed = false

export function setAutoSave(on: boolean) {
  try { localStorage.setItem('rackflow.autosave', on ? 'on' : 'off') } catch { /* private mode */ }
  useStore.setState({ autoSave: on })
  useStore.getState().notify(on ? (useStore.getState().path ? 'Auto-save on – every change is saved to the file' : 'Auto-save on – save the project once and every change after that is saved') : 'Auto-save off – use ⌘S to save', { kind: 'info' })
}

const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void run(), 700) }

async function run() {
  const s = useStore.getState()
  if (!isElectron || !s.autoSave || !s.path || !s.dirty) return
  if (saving) { again = true; return }
  saving = true
  const snapshot = s.project
  try {
    const target = await api.saveProject(s.path, JSON.stringify(snapshot, null, 2), snapshot.info.name || 'Untitled Project')
    if (target) markSavedSnapshot(target, snapshot)
    failed = false
  } catch (e) {
    if (!failed) useStore.getState().notify(`Auto-save couldn’t write the file: ${(e as Error).message ?? e}. Use Save As… to pick another place.`, { kind: 'error' })
    failed = true
  } finally {
    saving = false
    if (again) { again = false; schedule() }
  }
}

export function initAutoSave() {
  useStore.subscribe((st, prev) => {
    if (st.project !== prev.project || st.autoSave !== prev.autoSave || st.path !== prev.path) schedule()
  })
}

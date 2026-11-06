// App-wide settings (Settings window, ⌘,). Saved in the app's own data folder,
// never in a project. Main reads onLaunch / projectsFolder too.

import { create } from 'zustand'
import { api } from './platform'

export interface AppSettings {
  /** What shows when RackFlow opens. */
  onLaunch: 'start' | 'reopen'
  /** Where Open / Save dialogs start (null = macOS default). */
  projectsFolder: string | null
}

const DEFAULTS: AppSettings = { onLaunch: 'start', projectsFolder: null }

export const useSettings = create<AppSettings & { loaded: boolean }>(() => ({ ...DEFAULTS, loaded: false }))

export async function loadSettings() {
  const s = await api.storeGet<Partial<AppSettings>>('Settings').catch(() => null)
  useSettings.setState({ ...DEFAULTS, ...(s ?? {}), loaded: true })
}

export function saveSettings(patch: Partial<AppSettings>) {
  useSettings.setState(patch)
  const { loaded: _l, ...all } = useSettings.getState()
  void api.storeSet('Settings', all)
}

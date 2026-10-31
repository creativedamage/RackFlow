import { api } from './platform'
import { useStore } from './store'

export type Theme = 'system' | 'light' | 'dark'

/** Reflects the theme on <html data-theme> (the CSS keys off it; "system" follows macOS). */
export function showTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  useStore.getState().set({ theme: t })
}

export function setTheme(t: Theme) {
  showTheme(t)
  void api.setTheme(t)
}

export const nextTheme = (t: Theme): Theme => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system')

/** Load the saved choice at startup. */
export const initTheme = () => api.getTheme().then(showTheme).catch(() => undefined)

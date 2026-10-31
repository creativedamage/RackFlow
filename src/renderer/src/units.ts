import { setUnits, type Units } from '@core/index'
import { useStore } from './store'

const KEY = 'rackflow.units'

/** Load the saved display units (imperial unless you chose metric). Call before the first render. */
export function initUnits() {
  let u: Units = 'imperial'
  try { if (localStorage.getItem(KEY) === 'metric') u = 'metric' } catch { /* private mode */ }
  setUnits(u)
  useStore.setState({ units: u })
}

export function applyUnits(u: Units) {
  setUnits(u)
  try { localStorage.setItem(KEY, u) } catch { /* private mode */ }
  useStore.setState({ units: u })
  useStore.getState().notify(u === 'imperial' ? 'Showing inches, feet and pounds' : 'Showing millimetres, metres and kilograms', { kind: 'success' })
}

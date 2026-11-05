// The title block new projects start with (the ★ template), cached so the store can
// use it synchronously when it makes or opens a project.
import { useTemplate, type TitleBlockPrefs, type TitleBlockTemplate } from '@core/index'
import { api } from '../platform'

let current: TitleBlockTemplate | null = null

export async function refreshDefaultTB(): Promise<TitleBlockTemplate | null> {
  try {
    const [ts, prefs] = await Promise.all([api.storeGet<TitleBlockTemplate[]>('TitleBlocks'), api.storeGet<TitleBlockPrefs>('TitleBlockPrefs')])
    current = (prefs?.defaultId && (ts ?? []).find((t) => t && t.id === prefs.defaultId)) || null
  } catch { current = null }
  return current
}

/** A copy of the default template for a project, or undefined when none is set. */
export const defaultTBForProject = () => (current ? useTemplate(current) : undefined)

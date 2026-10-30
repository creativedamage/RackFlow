import { addPatchBay, type PatchBayTemplate } from '@core/index'
import { useStore } from '../store'
import { usePatchUI } from './patchState'

/** Adds a patch bay to the project: a label block on the Patch Labels page and a
 *  device on the Wiring Diagram (placed beside the last bay, or below everything). */
export function addBayToProject(t: PatchBayTemplate): string | null {
  let bayId = '', tag = ''
  useStore.getState().apply(`Add ${t.series}`, (d) => {
    const lastBay = [...d.patchBays].reverse().map((b) => d.equipment.find((e) => e.id === b.equipment)).find(Boolean)
    const maxY = d.equipment.reduce((m, e) => Math.max(m, e.position.y), 0)
    const at = lastBay ? { x: lastBay.position.x + 300, y: lastBay.position.y } : { x: 0, y: d.equipment.length ? maxY + 400 : 0 }
    const bay = addPatchBay(d, t, at)
    bayId = bay.id
    tag = bay.name
  })
  const st = useStore.getState()
  const bay = st.project.patchBays.find((b) => b.id === bayId)
  if (!bay) return null
  st.set({ selectedBay: bay.id })
  usePatchUI.getState().setSel({ bay: bay.id, row: bay.template.rows[0].id, a: 1, b: 1 })
  st.notify(`Added ${tag}. It's also on the Wiring Diagram, ready to cable.`, { undo: true })
  requestAnimationFrame(() => document.querySelector('.pb.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  return bay.id
}

import { useCallback, useState } from 'react'
import { defaultRackPrint, rackElevationSheets, type RackPrintOptions } from '@core/index'
import { useStore } from '../store'
import { DrawingDialog } from '../print/DrawingDialog'
import { Segmented, Toggle } from '../components/ui'

let remembered: RackPrintOptions | null = null
export const lastRackOptions = () => remembered

export function RackPrintDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const [o, setO] = useState<RackPrintOptions>(() => remembered ?? defaultRackPrint())
  const set = (v: RackPrintOptions) => { remembered = v; setO(v) }
  const render = useCallback((opts: RackPrintOptions) => rackElevationSheets(useStore.getState().project, opts), [])
  const chosen = new Set(o.racks ?? project.racks.map((r) => r.id))
  return (
    <DrawingDialog title="Print / Export Rack Elevations" name={`${project.info.name} rack elevations`} options={o} setOptions={set} render={render} onClose={onClose}
      extra={<>
        <h4>Racks</h4>
        <Segmented value={o.face} onChange={(face) => set({ ...o, face })} options={[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }, { value: 'both', label: 'Both' }]} />
        {project.racks.map((r) => (
          <Toggle key={r.id} label={r.name} checked={chosen.has(r.id)} onChange={(on) => {
            const next = new Set(chosen); if (on) next.add(r.id); else next.delete(r.id)
            set({ ...o, racks: project.racks.filter((x) => next.has(x.id)).map((x) => x.id) })
          }} />
        ))}
        <Toggle label="Unit numbers" checked={o.showUnitNumbers} onChange={(v) => set({ ...o, showUnitNumbers: v })} />
        <Toggle label="Show other face (dashed)" checked={o.showOtherFace} onChange={(v) => set({ ...o, showOtherFace: v })} />
      </>} />
  )
}

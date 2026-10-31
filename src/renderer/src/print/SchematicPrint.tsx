import { useCallback, useState } from 'react'
import { defaultSchematic, schematicSheets, type SchematicOptions, type WireMode } from '@core/index'
import { useStore } from '../store'
import { DrawingDialog } from './DrawingDialog'
import { Field, Segmented, Select, Toggle } from '../components/ui'

let remembered: SchematicOptions | null = null

export function SchematicPrintDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const [o, setO] = useState<SchematicOptions>(() => remembered ?? defaultSchematic(project))
  const set = (v: SchematicOptions) => { remembered = v; setO(v) }
  const render = useCallback((opts: SchematicOptions) => schematicSheets(useStore.getState().project, opts), [])
  return (
    <DrawingDialog title="Print / Export Wiring Diagram" name={`${project.info.name} wiring`} options={o} setOptions={set} render={render} onClose={onClose}
      extra={<>
        <h4>Drawing</h4>
        <Field label="Wires">
          <Segmented<WireMode> value={o.wires} onChange={(wires) => set({ ...o, wires })} options={[
            { value: 'all', label: 'All', title: 'Draw every wire in full' },
            { value: 'smart', label: 'Smart', title: 'Long or tangled wires end in labelled off-sheet arrows' },
            { value: 'stubs', label: 'Arrows', title: 'Every wire ends in a labelled arrow naming the far end' },
          ]} />
        </Field>
        <Field label="Sheets">
          <Select value={o.split} onChange={(split) => set({ ...o, split })} options={[
            { value: 'none', label: 'Everything on one sheet' },
            { value: 'group', label: 'One sheet per page' },
            { value: 'room', label: 'One sheet per room' },
          ]} />
        </Field>
        <Toggle label="Room zones (dashed)" checked={o.rooms} onChange={(rooms) => set({ ...o, rooms })} />
        <Toggle label="Colour by signal" checked={o.color} onChange={(color) => set({ ...o, color })} />
        <p className="muted small">Tip: ✨ Tidy Up the diagram first. Wires that leave a sheet end in an arrow naming the device, port and sheet they go to.</p>
      </>} />
  )
}

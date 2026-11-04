import { useCallback, useState } from 'react'
import { defaultSchematic, exportChoices, GENERAL_PAGE, schematicSheets, viewsOf, type SchematicOptions, type WireMode } from '@core/index'
import { useStore } from '../store'
import { DrawingDialog } from './DrawingDialog'
import { Field, Segmented, Select, Toggle } from '../components/ui'

let remembered: SchematicOptions | null = null
/** The settings last used in the print dialog (quick print reuses them). */
export const lastSchematicOptions = () => remembered

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
        <h4>Pages &amp; views <span className="muted small" style={{ fontWeight: 400 }}>· tick exactly what to print</span></h4>
        {(() => {
          // One sheet per page lists every page; otherwise the main drawing is a single sheet.
          const pages = o.split === 'group'
            ? (exportChoices(project).wiring ?? []).filter((c) => !c.label.startsWith('View:')).map((c) => ({ id: c.id, label: c.label.replace(/^Page: /, '') }))
            : [{ id: GENERAL_PAGE, label: o.split === 'room' ? 'Room sheets' : 'Main diagram' }]
          const views = viewsOf(project).filter((v) => !o.views || o.views.includes(v.id)).map((v) => ({ id: v.id, label: v.name }))
          const allViews = viewsOf(project).map((v) => ({ id: v.id, label: v.name }))
          const all = [...pages, ...allViews].map((x) => x.id)
          const cur = o.onlySheets ?? all
          const isOn = (id: string) => cur.includes(id) && (pages.some((x) => x.id === id) || views.some((x) => x.id === id) || !o.views)
          const pick = (ids: string[]) => set({ ...o, views: undefined, onlySheets: ids.length === all.length ? undefined : ids })
          const toggle = (id: string, x: boolean) => pick(x ? [...new Set([...all.filter(isOn), id])] : all.filter((y) => isOn(y) && y !== id))
          const row = (c: { id: string; label: string }) => <Toggle key={c.id} label={c.label} checked={isOn(c.id)} onChange={(x) => toggle(c.id, x)} />
          const count = all.filter(isOn).length
          return (<>
            <div className="row-gap">
              <button className="link" onClick={() => pick(all)}>All</button>
              <button className="link" onClick={() => pick([])}>None</button>
              {(() => { const st = useStore.getState(); const here = st.diagramView ?? (o.split === 'group' ? st.diagramPage : null); return here && all.includes(here) ? <button className="link" onClick={() => pick([here])}>Only the one I’m on</button> : null })()}
              <span className="muted small">{count} of {all.length} selected</span>
            </div>
            {pages.length > 0 && <p className="muted small" style={{ margin: '6px 0 2px' }}>{o.split === 'group' ? 'Pages' : 'Diagram'}</p>}
            {pages.map(row)}
            {allViews.length > 0 && <p className="muted small" style={{ margin: '6px 0 2px' }}>Signal views</p>}
            {allViews.map(row)}
            {count === 0 && <p className="muted small" style={{ color: 'var(--warn)' }}>Nothing selected – tick at least one page or view.</p>}
          </>)
        })()}
        <button className="mini" onClick={() => useStore.getState().set({ editingNumbers: true })} title="Prefix + start number (AV101, AV102…) or a custom number per page">Sheet Numbers…</button>
        <Toggle label="Room zones (dashed)" checked={o.rooms} onChange={(rooms) => set({ ...o, rooms })} />
        <Toggle label="Colour by signal" checked={o.color} onChange={(color) => set({ ...o, color })} />
        <p className="muted small">Tip: ✨ Tidy Up the diagram first. Wires that leave a sheet end in an arrow naming the device, port and sheet they go to.</p>
      </>} />
  )
}

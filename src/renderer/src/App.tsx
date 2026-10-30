import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { newCustomProduct, newCustomTemplate } from '@core/index'
import { api, isMac } from './platform'
import { loadFile, newDocument, openDocument, saveDocument, useStore } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { DiagramView } from './diagram/DiagramView'
import { RackView } from './rack/RackView'
import { PatchEditor } from './patch/PatchEditor'
import { TemplatesPanel } from './patch/TemplatesPanel'
import { PlateBuilder } from './product/PlateBuilder'
import { Toasts } from './components/Toasts'
import { ScheduleView } from './sheet/ScheduleView'
import { usePatchUI } from './patch/patchState'
import { Inspector } from './inspector/Inspector'
import { ProductEditor } from './product/ProductEditor'
import { TemplateEditor } from './patch/TemplateEditor'

const inTextField = () => !!document.activeElement?.closest('input, textarea, select, [contenteditable]')

// ⌘Z goes to a text field only while it has unsaved typing in it; otherwise it's
// the document's undo (so a focused search box or a field you just tabbed into
// doesn't swallow it).
let focusValue: string | null = null
document.addEventListener('focusin', (e) => { const t = e.target as HTMLInputElement; focusValue = 'value' in t ? String(t.value) : null })
const fieldHasEdits = () => {
  const el = document.activeElement as HTMLInputElement | null
  return !!el && inTextField() && 'value' in el && String(el.value) !== focusValue
}
const docUndo = (redo: boolean) => {
  const s = useStore.getState()
  if (inTextField()) (document.activeElement as HTMLElement).blur()
  const label = redo ? s.future[0]?.label : s.past[s.past.length - 1]?.label
  if (!label) return
  if (redo) s.redo(); else s.undo()
  s.notify(`${redo ? 'Redid' : 'Undid'} ${label}`, { kind: 'info', ms: 1800 })
}

export function App() {
  const mode = useStore((s) => s.mode)
  const showInspector = useStore((s) => s.showInspector)
  const editingPlate = useStore((s) => s.editingPlate)
  const editingProduct = useStore((s) => s.editingProduct)
  const editingTemplate = useStore((s) => s.editingTemplate)
  const title = useStore((s) => s.project.info.name)
  const dirty = useStore((s) => s.dirty)
  const path = useStore((s) => s.path)

  useEffect(() => { void useStore.getState().reloadLibrary() }, [])
  useEffect(() => { api.setDocumentState({ title, dirty, path }) }, [title, dirty, path])

  // Native menu → app commands.
  useEffect(() => api.onMenu(async (cmd) => {
    const s = useStore.getState()
    switch (cmd) {
      case 'new': newDocument(); break
      case 'open': await openDocument(); break
      case 'save': await saveDocument(); break
      case 'saveAs': await saveDocument(true); break
      case 'save-and-close': if (await saveDocument()) api.closeWindow(); break
      // ⌘Z inside a text field is the field's own undo, not the document's.
      case 'undo': if (fieldHasEdits()) document.execCommand('undo'); else docUndo(false); break
      case 'redo': if (fieldHasEdits()) document.execCommand('redo'); else docUndo(true); break
      case 'selectAll':
        if (inTextField()) document.execCommand('selectAll')
        else if (s.mode === 'sheet') window.dispatchEvent(new Event('sheet:selectAll'))
        else if (s.mode === 'patch') {
          const p = usePatchUI.getState()
          const bay = p.sel && s.project.patchBays.find((b) => b.id === p.sel!.bay)
          const n = bay?.template.rows.find((r) => r.id === p.sel!.row)?.strip.channelCount
          if (p.sel && n) p.setSel({ ...p.sel, a: 1, b: n })
        } else s.select(s.project.equipment.map((e) => e.id))
        break
      case 'delete':
        if (s.mode === 'sheet') { window.dispatchEvent(new Event('sheet:delete')); break }
        if (!inTextField() && s.selection.length) s.apply('Delete', (d) => {
          const ids = new Set(s.selection)
          d.equipment = d.equipment.filter((e) => !ids.has(e.id))
          d.cables = d.cables.filter((c) => !ids.has(c.from.equipment) && !ids.has(c.to.equipment))
          d.patchBays = d.patchBays.filter((b) => !ids.has(b.equipment))
        })
        break
      case 'mode:diagram': s.set({ mode: 'diagram' }); break
      case 'mode:rack': s.set({ mode: 'rack' }); break
      case 'mode:patch': s.set({ mode: 'patch' }); break
      case 'mode:sheet': s.set({ mode: 'sheet' }); break
      case 'zoomFit': s.set({ mode: 'diagram', fitRequest: s.fitRequest + 1 }); break
      case 'toggleInspector': s.set({ showInspector: !s.showInspector }); break
      case 'newProduct': s.set({ editingProduct: newCustomProduct() }); break
      case 'newTemplate': s.set({ editingTemplate: newCustomTemplate() }); break
    }
  }), [])

  useEffect(() => api.onOpenFile((f) => {
    if (useStore.getState().dirty && !confirm('Discard unsaved changes to the current project?')) return
    loadFile(f.path, f.data)
  }), [])

  return (
    <ReactFlowProvider>
      <div className={`app ${isMac ? 'mac' : ''} ${showInspector ? '' : 'no-inspector'} mode-${mode}`}>
        <Toolbar />
        {mode !== 'sheet' && <Sidebar />}
        <main className="canvas-area">
          {mode === 'diagram' && <DiagramView />}
          {mode === 'rack' && <RackView />}
          {mode === 'patch' && <PatchEditor />}
          {mode === 'sheet' && <ScheduleView />}
        </main>
        {showInspector && mode !== 'sheet' && (mode === 'patch' ? <TemplatesPanel /> : <Inspector />)}
        {editingProduct && <ProductEditor key={editingProduct.key} initial={editingProduct} />}
        {editingPlate && <PlateBuilder key={editingPlate.product.key + (editingPlate.instanceId ?? '')} initial={editingPlate.product} instanceId={editingPlate.instanceId} />}
        {editingTemplate && <TemplateEditor key={editingTemplate.key} initial={editingTemplate} />}
        <Toasts />
      </div>
    </ReactFlowProvider>
  )
}

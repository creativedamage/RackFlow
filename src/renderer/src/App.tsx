import { createPortal } from 'react-dom'
import { ExportAllDialog } from './print/ExportAllDialog'
import { PanelResizer, usePanelWidth } from './components/PanelResizer'
import { tidyDiagram } from './diagram/tidy'
import { DeviceFinder } from './product/DeviceFinder'
import { ContextMenu } from './components/ContextMenu'
import { editSelection } from './product/openEditor'
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { newCustomProduct, newCustomTemplate, setInView } from '@core/index'
import { api, isMac } from './platform'
import { confirmDiscard, loadFile, newDocument, openDocument, saveDocument, useStore } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { DiagramView } from './diagram/DiagramView'
import { RackView } from './rack/RackView'
import { PatchEditor } from './patch/PatchEditor'
import { TemplatesPanel } from './patch/TemplatesPanel'
import { PlateBuilder } from './product/PlateBuilder'
import { Toasts } from './components/Toasts'
import { ScheduleView } from './sheet/ScheduleView'
import { LedView } from './led/LedView'
import { ViewEditor } from './diagram/ViewEditor'
import { SheetNumbersDialog } from './diagram/SheetNumbers'
import { initTheme, showTheme } from './theme'
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
  const finding = useStore((s) => s.finding)
  const exportingAll = useStore((s) => s.exportingAll)
  const editingView = useStore((s) => s.editingView)
  const editingNumbers = useStore((s) => s.editingNumbers)
  const editingTemplate = useStore((s) => s.editingTemplate)
  const title = useStore((s) => s.project.info.name)
  const dirty = useStore((s) => s.dirty)
  const path = useStore((s) => s.path)

  useEffect(() => { void useStore.getState().reloadLibrary() }, [])
  useEffect(() => { api.setDocumentState({ title, dirty, path }) }, [title, dirty, path])

  useEffect(() => { void initTheme() }, [])

  // Native menu → app commands.
  useEffect(() => api.onMenu(async (cmd) => {
    const s = useStore.getState()
    switch (cmd) {
      case 'new': await newDocument(); break
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
        if (!inTextField() && s.selection.length && s.diagramView && s.mode === 'diagram') { const vid = s.diagramView; s.apply('Remove from View', (d) => setInView(d, vid, s.selection, false)); break }
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
      case 'mode:led': s.set({ mode: 'led' }); break
      case 'theme:system': case 'theme:light': case 'theme:dark': showTheme(cmd.slice(6) as 'system' | 'light' | 'dark'); break
      case 'zoomFit': s.set({ mode: 'diagram', fitRequest: s.fitRequest + 1 }); break
      case 'toggleInspector': s.set({ showInspector: !s.showInspector }); break
      case 'newProduct': s.set({ editingProduct: newCustomProduct() }); break
      case 'editDevice': editSelection(); break
      case 'tidy': s.set({ mode: 'diagram' }); setTimeout(() => { const n = tidyDiagram({ selectionOnly: s.selection.length > 1 }); if (n) useStore.getState().notify(`Tidied ${n} devices`, { undo: true, kind: 'success' }) }, 0); break
      case 'exportAll': s.set({ exportingAll: true }); break
      case 'findDevice': s.set({ finding: { query: '' } }); break
      case 'newTemplate': s.set({ editingTemplate: newCustomTemplate() }); break
    }
  }), [])

  useEffect(() => api.onOpenFile((f) => {
    void confirmDiscard().then((ok) => { if (ok) loadFile(f.path, f.data) })
  }), [])

  // The right panel shows only when there's something to inspect (design checks live in the ⚠︎ notifications).
  const hasSubject = useStore((s) => s.selection.length > 0 || !!s.selectedCable || (s.mode === 'rack' && (!!s.selectedRack || !!s.selectedAccessory)))
  const rightPanel = showInspector && mode !== 'sheet' && mode !== 'led' && (mode === 'patch' || hasSubject)
  const inspW = usePanelWidth('insp')
  const tpW = usePanelWidth('tp')

  return (
    <ReactFlowProvider>
      <div className={`app ${isMac ? 'mac' : ''} ${rightPanel ? '' : 'no-inspector'} mode-${mode}`} style={{ ['--insp-w' as string]: `${inspW}px`, ['--tp-w' as string]: `${tpW}px` }}>
        <Toolbar />
        {mode !== 'sheet' && mode !== 'led' && <Sidebar />}
        <main className="canvas-area">
          {mode === 'diagram' && <DiagramView />}
          {mode === 'rack' && <RackView />}
          {mode === 'patch' && <PatchEditor />}
          {mode === 'sheet' && <ScheduleView />}
          {mode === 'led' && <LedView />}
        </main>
        {rightPanel && (mode === 'patch' ? <TemplatesPanel /> : <Inspector />)}
        {rightPanel && <PanelResizer which={mode === 'patch' ? 'tp' : 'insp'} />}
        {editingProduct && <ProductEditor key={editingProduct.key} initial={editingProduct} />}
        {editingPlate && <PlateBuilder key={editingPlate.product.key + (editingPlate.instanceId ?? '')} initial={editingPlate.product} instanceId={editingPlate.instanceId} />}
        {editingTemplate && <TemplateEditor key={editingTemplate.key} initial={editingTemplate} />}
        {finding && <DeviceFinder initialQuery={finding.query} />}
        {editingView && <ViewEditor key={editingView} id={editingView} onClose={() => useStore.getState().set({ editingView: null })} />}
        {editingNumbers && createPortal(<SheetNumbersDialog onClose={() => useStore.getState().set({ editingNumbers: false })} />, document.body)}
        {exportingAll && <ExportAllDialog onClose={() => useStore.getState().set({ exportingAll: false })} />}
        <Toasts />
        <ContextMenu />
      </div>
    </ReactFlowProvider>
  )
}

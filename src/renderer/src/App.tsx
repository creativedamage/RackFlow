import { createPortal } from 'react-dom'
import { ExportAllDialog, openExport } from './print/ExportAllDialog'
import { ShareDialog } from './share/ShareDialog'
import { useCloud, useCloudSync } from './share/cloudState'
import { PanelResizer, usePanelWidth } from './components/PanelResizer'
import { tidyDiagram } from './diagram/tidy'
import { DeviceFinder } from './product/DeviceFinder'
import { ContextMenu } from './components/ContextMenu'
import { editSelection } from './product/openEditor'
import { useEffect } from 'react'
import { StartScreen } from './components/StartScreen'
import { SettingsDialog } from './components/SettingsDialog'
import { InventoryView } from './inventory/InventoryView'
import { loadSettings } from './settings'
import { groupSelection, newPageCmd, pagesBySystem } from './diagram/GroupsPanel'
import { ReactFlowProvider } from '@xyflow/react'
import { addRack, makeFiberProduct, makePlateProduct, newCustomProduct, newCustomTemplate, newFiberSpec, newPlateSpec, setInView, type PlateKind } from '@core/index'
import { api, isMac } from './platform'
import { confirmDiscard, loadFile, newDocument, openDocument, saveDocument, useStore, patchQuietly } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { DiagramView } from './diagram/DiagramView'
import { RackView } from './rack/RackView'
import { PatchEditor } from './patch/PatchEditor'
import { TemplatesPanel } from './patch/TemplatesPanel'
import { PlateDesigner } from './product/PlateDesigner'
import { FiberBuilder } from './product/FiberBuilder'
import { Toasts } from './components/Toasts'
import { ScheduleView } from './sheet/ScheduleView'
import { BoxesView } from './boxes/BoxesView'
import { LedView } from './led/LedView'
import { ViewEditor } from './diagram/ViewEditor'
import { setAutoSave } from './autosave'
import { SheetNumbersDialog } from './diagram/SheetNumbers'
import { NumberingDialog } from './components/NumberingDialog'
import { initTheme, showTheme } from './theme'
import { applyUnits } from './units'
import { isLightLogo } from './rack/AccessoryInspector'
import { usePatchUI } from './patch/patchState'
import { Inspector } from './inspector/Inspector'
import { toggleSidebar } from './panels'
import { EdgePeek, Slide } from './slide'
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
  const sharing = useCloud((s) => s.open)
  useCloudSync()
  const editingView = useStore((s) => s.editingView)
  const editingNumbers = useStore((s) => s.editingNumbers)
  const editingNumbering = useStore((s) => s.editingNumbering)
  // Switching units re-draws everything with the new labels.
  const units = useStore((s) => s.units)
  const editingTemplate = useStore((s) => s.editingTemplate)
  const title = useStore((s) => s.project.info.name)
  const dirty = useStore((s) => s.dirty)
  const path = useStore((s) => s.path)

  useEffect(() => { void useStore.getState().reloadLibrary() }, [])
  const autoSave = useStore((s) => s.autoSave)
  useEffect(() => { api.setDocumentState({ title, dirty, path, autoSave }) }, [title, dirty, path, autoSave])
  useEffect(() => { void loadSettings() }, [])
  const showStart = useStore((s) => s.showStart)
  const showSettings = useStore((s) => s.showSettings)

  useEffect(() => { void initTheme() }, [])

  // Logos from older projects: work out once whether they're white artwork (printed black on drawings).
  const logos = useStore((s) => s.project.logos)
  const tbLogo = useStore((s) => s.project.titleBlock?.logo)
  useEffect(() => {
    const todo = (logos ?? []).filter((l) => l.light === undefined)
    const tb = tbLogo && tbLogo.light === undefined ? tbLogo : null
    if (!todo.length && !tb) return
    void Promise.all([...todo.map((l) => isLightLogo(l.dataUrl)), tb ? isLightLogo(tb.dataUrl) : Promise.resolve(false)]).then((res) => {
      const map = new Map(todo.map((l, i) => [l.id, res[i]]))
      patchQuietly((p) => ({
        ...p,
        logos: p.logos?.map((l) => (map.has(l.id) ? { ...l, light: map.get(l.id) } : l)),
        titleBlock: tb && p.titleBlock?.logo ? { ...p.titleBlock, logo: { ...p.titleBlock.logo, light: res[res.length - 1] } } : p.titleBlock,
      }))
    })
  }, [logos, tbLogo])

  // Native menu → app commands.
  useEffect(() => api.onMenu(async (cmd) => {
    const s = useStore.getState()
    switch (cmd) {
      case 'new': await newDocument(); break
      case 'open': await openDocument(); break
      case 'save': await saveDocument(); break
      case 'saveAs': await saveDocument(true); break
      case 'autosave:toggle': setAutoSave(!s.autoSave); break
      case 'quickPrint': openExport(); break
      case 'share': useCloud.getState().set({ open: true, tab: 'share' }); break
      case 'save-and-close': if (await saveDocument()) api.closeWindow(); break
      // ⌘Z inside a text field is the field's own undo, not the document's.
      case 'undo': if (s.editingPlate && !inTextField()) { window.dispatchEvent(new Event('designer:undo')); break } if (fieldHasEdits()) document.execCommand('undo'); else docUndo(false); break
      case 'redo': if (fieldHasEdits()) document.execCommand('redo'); else docUndo(true); break
      case 'selectAll':
        if (s.editingPlate && !inTextField()) { window.dispatchEvent(new Event('designer:selectAll')); break }
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
      case 'mode:boxes': s.set({ mode: 'boxes' }); break
      case 'theme:system': case 'theme:light': case 'theme:dark': showTheme(cmd.slice(6) as 'system' | 'light' | 'dark'); break
      case 'zoomFit': s.set({ mode: 'diagram', fitRequest: s.fitRequest + 1 }); break
      case 'toggleInspector': s.set({ showInspector: !s.showInspector }); break
      case 'toggleSidebar': toggleSidebar(); break
      case 'newProduct': s.set({ editingProduct: newCustomProduct() }); break
      case 'editDevice': editSelection(); break
      case 'tidy': s.set({ mode: 'diagram' }); setTimeout(() => { const n = tidyDiagram({ selectionOnly: s.selection.length > 1 }); if (n) useStore.getState().notify(`Tidied ${n} devices`, { undo: true, kind: 'success' }) }, 0); break
      case 'exportAll': openExport(true); break
      case 'numbering': s.set({ editingNumbering: true }); break
      case 'units:imperial': case 'units:metric': applyUnits(cmd === 'units:metric' ? 'metric' : 'imperial'); break
      case 'findDevice': s.set({ finding: { query: '' } }); break
      case 'newTemplate': s.set({ editingTemplate: newCustomTemplate() }); break
      case 'settings': s.set({ showSettings: true }); break
      case 'startScreen': s.set({ showStart: true }); break
      case 'mode:inventory': s.set({ mode: 'inventory' }); break
      case 'page:new': newPageCmd(); break
      case 'page:fromSelection': s.set({ mode: 'diagram' }); groupSelection(); break
      case 'page:bySystem': s.set({ mode: 'diagram' }); pagesBySystem(); break
      case 'view:new': s.set({ mode: 'diagram', editingView: 'new' }); break
      case 'sheetNumbers': s.set({ editingNumbers: true }); break
      case 'insert:wallBox': case 'insert:wallPlate': case 'insert:floorBox': case 'insert:rackPanel': {
        const kind = cmd.slice(7) as PlateKind
        const model = { wallBox: 'Wall Box', wallPlate: 'Wall Plate', floorBox: 'Floor Box', rackPanel: 'Connector Panel' }[kind as 'wallBox']
        s.set({ editingPlate: { product: makePlateProduct(newPlateSpec(kind), { model }), instanceId: null } }); break
      }
      case 'insert:fiber': s.set({ editingPlate: { product: makeFiberProduct(newFiberSpec('fhd-1u'), { model: '' }), instanceId: null } }); break
      case 'insert:rack': s.apply('Add Rack', (d) => { addRack(d) }); s.set({ mode: 'rack' }); break
      case 'insert:led': s.set({ mode: 'led', ledPicking: true }); break
    }
  }), [])

  useEffect(() => api.onOpenFile((f) => {
    void confirmDiscard().then((ok) => { if (ok) loadFile(f.path, f.data) })
  }), [])

  // The right panel shows only when there's something to inspect (design checks live in the ⚠︎ notifications).
  const hasSubject = useStore((s) => s.selection.length > 0 || !!s.selectedCable || s.selectedCables.length > 0 || (s.mode === 'rack' && (!!s.selectedRack || !!s.selectedAccessory)))
  const rightAvail = mode !== 'sheet' && mode !== 'led' && mode !== 'boxes' && mode !== 'inventory' && (mode === 'patch' || hasSubject)
  const rightPanel = showInspector && rightAvail
  const peek = useStore((s) => s.peek)
  const hasWalls = useStore((s) => (s.project.ledWalls?.length ?? 0) > 0)
  const hasBoxes = useStore((s) => s.project.equipment.some((e) => e.product.plate))
  const showSidebar = useStore((s) => s.showSidebar)
  const sidebarOn = showSidebar && mode !== 'sheet' && mode !== 'led' && mode !== 'boxes' && mode !== 'inventory'
  const inspW = usePanelWidth('insp')
  const tpW = usePanelWidth('tp')

  return (
    <ReactFlowProvider>
      <div key={units} className={`app ${isMac ? 'mac' : ''} ${rightPanel && mode !== 'diagram' ? '' : 'no-inspector'} ${rightPanel && mode === 'diagram' ? 'insp-float' : ''} mode-${mode} ${sidebarOn ? 'has-sidebar' : 'no-sidebar'} ${mode !== 'sheet' && mode !== 'inventory' ? 'can-sidebar' : ''}`} style={{ ['--insp-w' as string]: `${inspW}px`, ['--tp-w' as string]: `${tpW}px` }}>
        <Toolbar />
        {mode !== 'led' && mode !== 'boxes' && mode !== 'inventory' && <Slide open={sidebarOn || (peek === 'left' && mode !== 'sheet')} side="left"><Sidebar peek={!sidebarOn} /></Slide>}
        <main className="canvas-area">
          {mode === 'diagram' && <DiagramView />}
          {mode === 'rack' && <RackView />}
          {mode === 'patch' && <PatchEditor />}
          {mode === 'sheet' && <ScheduleView />}
          {mode === 'led' && <LedView />}
          {mode === 'boxes' && <BoxesView />}
          {mode === 'inventory' && <InventoryView />}
        </main>
        <Slide open={rightPanel || (peek === 'right' && rightAvail)} side="right">{mode === 'patch' ? <TemplatesPanel peek={!rightPanel} /> : <Inspector peek={!rightPanel} />}</Slide>
        <EdgePeek left={!showSidebar && mode !== 'sheet' && mode !== 'inventory'} right={!showInspector && (rightAvail || (mode === 'led' && hasWalls) || (mode === 'boxes' && hasBoxes))} />
        {rightPanel && <PanelResizer which={mode === 'patch' ? 'tp' : 'insp'} />}
        {editingProduct && <ProductEditor key={editingProduct.key} initial={editingProduct} />}
        {editingPlate && (editingPlate.product.fiber
          ? <FiberBuilder key={editingPlate.product.key + (editingPlate.instanceId ?? '')} initial={editingPlate.product} instanceId={editingPlate.instanceId} />
          : <PlateDesigner key={editingPlate.product.key + (editingPlate.instanceId ?? '')} initial={editingPlate.product} instanceId={editingPlate.instanceId} />)}
        {editingTemplate && <TemplateEditor key={editingTemplate.key} initial={editingTemplate} />}
        {finding && <DeviceFinder initialQuery={finding.query} />}
        {editingView && <ViewEditor key={editingView} id={editingView} copied={useStore.getState().copiedView === editingView}
          onClose={() => useStore.getState().set({ editingView: null, copiedView: null })}
          onCancel={() => { const s = useStore.getState(); const copy = s.copiedView === editingView; s.set({ editingView: null, copiedView: null }); if (copy) { s.undo(); s.set({ diagramView: null }) } }} />}
        {editingNumbers && createPortal(<SheetNumbersDialog onClose={() => useStore.getState().set({ editingNumbers: false })} />, document.body)}
        {editingNumbering && createPortal(<NumberingDialog onClose={() => useStore.getState().set({ editingNumbering: false })} />, document.body)}
        {sharing && <ShareDialog />}
        {exportingAll && <ExportAllDialog onClose={() => useStore.getState().set({ exportingAll: false })} />}
        {showSettings && createPortal(<SettingsDialog />, document.body)}
        {showStart && <StartScreen />}
        <Toasts />
        <ContextMenu />
      </div>
    </ReactFlowProvider>
  )
}

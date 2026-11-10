import { editPlacedDevice } from '../product/openEditor'
import { deviceMenu } from '../product/productActions'
import { showContextMenu, type MenuItem } from '../components/ContextMenu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges, Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, Panel, ReactFlow, useConnection, useReactFlow, ViewportPortal,
  type Connection, type Edge, type EdgeChange, type NodeChange, type OnConnectStart, type Viewport,
} from '@xyflow/react'
import {
  addEquipment, addPatchBay, addToGroup, arrange, type ArrangeMode, newProject, occupiedBoxes, findFreeSpot, samePage, resolveOverlap, duplicateDevices, type Box, pageNumbers, GENERAL_PAGE, layoutView, setInView, viewOffFlags, viewProject, viewsOf, nodeGeom, placeInFreeSpace, connectMany, groupColor, groupsOf, type BulkResult, candidates as findCandidates, connect, DOMAINS, portDomain, resolve, SIGNALS, validate,
  type CableId, type EquipmentId, type PortAddress, cableColorHex, needsCasing, clustersOf, clusterColor, addCluster, deleteCluster, renameCluster, clusterShownIn, clusterRect, insideRect, CLUSTER_COLORS, flagName } from '@core/index'
import { useStore } from '../store'
import { DRAG_MIME, dragState, type DragPayload } from '../components/Sidebar'
import { setViewCenterProvider } from './placement'
import { pickIndex } from './wiring'
import { DeviceNode, NODE_WIDTH, type DeviceNodeType } from './DeviceNode'
import { GroupFrame, type GroupFrameType } from './GroupFrame'
import { ClusterBox, type ClusterBoxType } from './ClusterBox'
import { CableEdge, type CableEdgeType } from './CableEdge'
import { usePageShortcuts, addToViewItems, clearViewWires, moveDevicesToPage, pageMenuItems, useGroupFocus, viewMenuItems } from './GroupsPanel'
import { NoteNode, type NoteNodeType } from './NoteNode'
import { useWiring } from './wiring'
import { SchematicPrintDialog } from '../print/SchematicPrint'
import { createPortal } from 'react-dom'
import { Segmented } from '../components/ui'
import { newId, type Annotation, type AnnotationKind, type WireMode } from '@core/index'

const nodeTypes = { device: DeviceNode, groupFrame: GroupFrame, clusterBox: ClusterBox, note: NoteNode }
const edgeTypes = { cable: CableEdge }
type AnyNode = DeviceNodeType | GroupFrameType | ClusterBoxType | NoteNodeType
const FRAME_PAD = 22, FRAME_LABEL = 26
const nodeH = (n: DeviceNodeType) => n.measured?.height ?? nodeGeom(n.data.eq).height
const GRID = 8

const pointOf = (e: MouseEvent | TouchEvent | React.MouseEvent) => ('touches' in e ? { x: (e.changedTouches[0] ?? e.touches[0])?.clientX ?? 0, y: (e.changedTouches[0] ?? e.touches[0])?.clientY ?? 0 } : { x: e.clientX, y: e.clientY })

/** Zoom / position per page or view, kept while the app is open (survives switching tabs). */
const viewports = new Map<string, Viewport>()
/** A dialog is open, or focus is outside the diagram canvas (inspector, sidebar…). */
function deleteBlocked(target: EventTarget | Element | null): boolean {
  if (document.querySelector('.modal-backdrop, [role=dialog], [aria-modal=true]')) return true
  const el = target instanceof Element ? target : null
  if (!el || el === document.body) return false
  return !!el.closest('.inspector, .sidebar, .toolbar, .modal, .context-menu') || !el.closest('.react-flow, .diagram')
}
let seenLocate = 0
let seenFit = 0

export function DiagramView() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const selectedCable = useStore((s) => s.selectedCable)
  const selectedCables = useStore((s) => s.selectedCables)
  const issues = useStore((s) => s.issues)
  const fitRequest = useStore((s) => s.fitRequest)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const { screenToFlowPosition, fitView, setViewport, getViewport, getNode, getNodesBounds } = useReactFlow()
  const focusGroup = useGroupFocus((s) => s.focus)
  usePageShortcuts()
  const page = useStore((s) => s.diagramPage)
  const viewId = useStore((s) => s.diagramView)
  const view = useMemo(() => (viewId ? viewsOf(project).find((v) => v.id === viewId) : undefined), [project, viewId])
  // What's drawn: the whole project, or a signal view's members with only its ports.
  const shown = useMemo(() => (view ? viewProject(project, view) : project), [project, view])
  const scope = view?.id ?? page
  const viewIds = useMemo(() => new Set(viewsOf(project).map((v) => v.id)), [project])
  // Let click-to-add (Makers / library) drop new gear in the middle of what's on screen.
  useEffect(() => {
    setViewCenterProvider(() => {
      const el = document.querySelector('.diagram')?.getBoundingClientRect()
      return el ? screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }) : { x: 0, y: 0 }
    })
    return () => setViewCenterProvider(null)
  }, [screenToFlowPosition])

  // Nodes are derived from the document but kept in local state so React Flow
  // can move them at 60 fps; the move is committed once on drag stop (1 undo step).
  const [nodes, setNodes] = useState<DeviceNodeType[]>([])
  useEffect(() => {
    const connected = new Map<string, Set<string>>()
    for (const c of shown.cables) for (const a of [c.from, c.to]) {
      if (!connected.has(a.equipment)) connected.set(a.equipment, new Set())
      connected.get(a.equipment)!.add(a.port)
    }
    const sel = new Set(selection)
    const groups = new Map(groupsOf(project).map((g) => [g.id, g]))
    // Page view: devices on other pages are hidden; their wires become flags on the visible port.
    const onPage = (e: { groupId?: string }) => !page || e.groupId === page
    const eqById = new Map(project.equipment.map((e) => [e.id as string, e]))
    const offPage = view ? viewOffFlags(project, view) : new Map<string, Record<string, string>>()
    if (page && !view) for (const c of project.cables) {
      const a = eqById.get(c.from.equipment), b = eqById.get(c.to.equipment)
      if (!a || !b || onPage(a) === onPage(b)) continue
      const [here, hereAddr, there, thereAddr] = onPage(a) ? [a, c.from, b, c.to] : [b, c.to, a, c.from]
      const tp = there.product.ports.find((x) => x.id === thereAddr.port)
      const pgName = there.groupId ? groups.get(there.groupId)?.name : undefined
      const pgNo = pageNumbers(project).get(there.groupId && pgName ? there.groupId : GENERAL_PAGE)
      const pg = pgName ? (pgNo ? `${pgNo} ${pgName}` : pgName) : pgNo
      offPage.set(here.id, { ...(offPage.get(here.id) ?? {}), [hereAddr.port]: `${c.label} ▸ ${there.tag} · ${tp?.label ?? ''}${pg ? ` (${pg})` : ' (no page)'}` })
    }
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return shown.equipment.map((eq) => {
        const old = byId.get(eq.id)
        const g = eq.groupId ? groups.get(eq.groupId) : undefined
        const dim = !!focusGroup && eq.groupId !== focusGroup
        return { ...(old ?? {}), id: eq.id, type: 'device' as const, position: { ...eq.position }, selected: sel.has(eq.id), hidden: !view && !onPage(eq),
          data: { eq, connected: connected.get(eq.id) ?? new Set(), group: g ? { name: g.name, color: groupColor(g) } : undefined, dim, offPage: offPage.get(eq.id) } }
      })
    })
  }, [project.equipment, project.cables, project.groups, shown, view, selection, focusGroup, page])

  // Group frames follow their devices live (including mid-drag).
  const frames = useMemo<GroupFrameType[]>(() => (page || view ? [] : groupsOf(project)).flatMap((g) => {
    const members = nodes.filter((n) => n.data.eq.groupId === g.id)
    if (!members.length) return []
    const x0 = Math.min(...members.map((n) => n.position.x)) - FRAME_PAD
    const y0 = Math.min(...members.map((n) => n.position.y)) - FRAME_PAD - FRAME_LABEL
    const x1 = Math.max(...members.map((n) => n.position.x + (n.measured?.width ?? NODE_WIDTH))) + FRAME_PAD
    const y1 = Math.max(...members.map((n) => n.position.y + nodeH(n))) + FRAME_PAD
    return [{
      id: `group:${g.id}`, type: 'groupFrame' as const, position: { x: x0, y: y0 }, zIndex: -1, selectable: false, draggable: true, dragHandle: '.gf-label',
      width: x1 - x0, height: y1 - y0, style: { width: x1 - x0, height: y1 - y0, pointerEvents: 'none' as const },
      data: { id: g.id, name: g.name, color: groupColor(g), count: members.length, system: g.system, active: focusGroup === g.id },
    }]
  }), [project, nodes, focusGroup, page, view])
  // Device groups: boxes drawn on this page / view. Devices inside a box are in that group.
  const viewIdSet = useMemo(() => new Set(viewsOf(project).map((v) => v.id)), [project])
  const groupBoxesRaw = useMemo(() => clustersOf(project).filter((c) => clusterShownIn(c, { page, view: view?.id ?? null }, viewIdSet)).map((c) => ({ c, r: clusterRect(project, c) })), [project, page, view, viewIdSet])
  const [boxes, setBoxes] = useState<ClusterBoxType[]>([])
  // Right-click › Add Group: the next drag on the canvas draws the group's box.
  const [drawingGroup, setDrawingGroup] = useState(false)
  const [drawRect, setDrawRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  useEffect(() => {
    if (!drawingGroup) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawingGroup(false); setDrawRect(null) } }
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [drawingGroup])
  const devSize = (n: DeviceNodeType) => ({ w: n.measured?.width ?? NODE_WIDTH, h: nodeH(n) })
  useEffect(() => {
    setBoxes((prev) => {
      const byId = new Map(prev.map((b) => [b.id, b]))
      return groupBoxesRaw.map(({ c, r }) => {
        const id = `cbox:${c.id}`, old = byId.get(id)
        return {
          ...(old ?? {}), id, type: 'clusterBox' as const, position: { x: r.x, y: r.y }, width: r.w, height: r.h, zIndex: 0, dragHandle: '.cb-label',
          style: { width: r.w, height: r.h }, selected: old?.selected ?? false,
          data: {
            id: c.id, name: c.name, color: clusterColor(project, c), count: 0,
            onRename: (name: string) => apply('Rename Group', (d) => renameCluster(d, c.id, name)),
            onResized: (nr: { x: number; y: number; w: number; h: number }) => apply('Resize Group', (d) => { const x = d.clusters?.find((y) => y.id === c.id); if (x) { x.x = Math.round(nr.x); x.y = Math.round(nr.y); x.w = Math.round(nr.w); x.h = Math.round(nr.h) } }),
          },
        }
      })
    })
  }, [groupBoxesRaw, project, apply])
  // Live member counts (what's inside each box right now).
  const boxesShown = useMemo<ClusterBoxType[]>(() => boxes.map((b) => {
    const r = { x: b.position.x, y: b.position.y, w: (b.width ?? 0), h: (b.height ?? 0) }
    const count = nodes.filter((n) => !n.hidden && insideRect(r, n.position, devSize(n))).length
    return count === b.data.count ? b : { ...b, data: { ...b.data, count } }
  }), [boxes, nodes])
  const boxesRef = useRef(boxesShown); boxesRef.current = boxesShown
  const framesRef = useRef(frames); framesRef.current = frames
  const nodesRef = useRef(nodes); nodesRef.current = nodes
  // Devices that were inside each group box when its drag began – only these move with it
  // (a box dragged over other devices doesn't pick them up on the way).
  const boxCrew = useRef(new Map<string, Set<string>>())
  /** Where a dragged group frame / box and its devices were when the drag began. */
  const dragStart = useRef(new Map<string, { x: number; y: number; members: Map<string, { x: number; y: number }> }>())
  // Notes / callouts / revision notes: local state for smooth dragging and resizing.
  const [notes, setNotes] = useState<NoteNodeType[]>([])
  useEffect(() => {
    setNotes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return (project.annotations ?? []).map((a) => {
        const id = `note:${a.id}`, old = byId.get(id)
        return { ...(old ?? {}), id, type: 'note' as const, position: { x: a.x, y: a.y }, width: a.w, height: a.h, zIndex: 5,
          hidden: scope ? a.page !== scope : !!a.page && viewIds.has(a.page), data: { a } }
      })
    })
  }, [project.annotations, scope, viewIds])
  const notesRef = useRef(notes); notesRef.current = notes
  const allNodes = useMemo<AnyNode[]>(() => [...frames, ...boxesShown, ...nodes, ...notes], [frames, boxesShown, nodes, notes])

  const cableSeverity = useMemo(() => {
    const m = new Map<string, 'error' | 'warning'>()
    for (const i of issues) if (i.subject.kind === 'cable' && i.severity !== 'info') {
      if (i.severity === 'error' || !m.has(i.subject.id)) m.set(i.subject.id, i.severity)
    }
    return m
  }, [issues])

  const wireMode = project.diagram?.wires ?? 'all'
  // On a page, newly added devices join that page.
  // Only devices the user just added count – not a whole file being opened, or devices
  // coming back with undo / redo (those used to be pulled into whatever page or view was open).
  const knownIds = useRef(new Set(project.equipment.map((e) => e.id as string)))
  const histSeq = useStore((s) => s.histSeq)
  const seenHist = useRef(histSeq)
  useEffect(() => {
    const replaced = seenHist.current !== histSeq
    seenHist.current = histSeq
    const fresh = replaced ? [] : project.equipment.filter((e) => !knownIds.current.has(e.id) && !e.groupId).map((e) => e.id)
    knownIds.current = new Set(project.equipment.map((e) => e.id as string))
    if (!fresh.length) return
    if (view) useStore.getState().amend((d) => {
      setInView(d, view.id, fresh, true)
      const v = viewsOf(d).find((x) => x.id === view.id)
      if (v) for (const e of d.equipment) if (fresh.includes(e.id)) v.positions[e.id] = { ...e.position }
    })
    else if (page) useStore.getState().amend((d) => addToGroup(d, fresh, page))
  }, [project.equipment, page, view, histSeq])
  // Devices that joined an auto view (e.g. added on the main diagram) get a spot in the view's layout.
  useEffect(() => {
    if (view && shown.equipment.some((e) => !view.positions[e.id])) useStore.getState().amend((d) => { layoutView(d, view.id, nodeGeom, { onlyNew: true }) })
  }, [view, shown])

  const edges: CableEdgeType[] = useMemo(() => {
    const sel = new Set(selection)
    const multi = new Set(selectedCables)
    const lanes = new Map<string, number>()
    return shown.cables.map((c) => {
      const from = resolve(shown, c.from)
      const to = resolve(shown, c.to)
      const d = from ? portDomain(from.port) : null
      const sev = cableSeverity.get(c.id)
      // The cable's own jacket colour when it has one; else its signal type's colour.
      const jacket = cableColorHex(c.color)
      const color = sev === 'error' ? '#e03131' : jacket ?? (d ? DOMAINS[d].color : '#888')
      const isSel = c.id === selectedCable || multi.has(c.id)
      // Wires touching a selected (or dragged) device draw above other devices.
      const lifted = isSel || sel.has(c.from.equipment) || sel.has(c.to.equipment)
      const pair = `${c.from.equipment}>${c.to.equipment}`
      const lane = lanes.get(pair) ?? 0
      lanes.set(pair, lane + 1)
      return {
        id: c.id, source: c.from.equipment, sourceHandle: c.from.port, target: c.to.equipment, targetHandle: c.to.port,
        // Only the selected wire shows its grab handles (drag an end to rewire) – handles on every wire slow big drawings down.
        type: 'cable' as const, selected: isSel, reconnectable: isSel && !multi.size, zIndex: lifted ? 1000 : 0,
        data: { label: c.label, color, casing: !!jacket && sev !== 'error' && needsCasing(jacket), dashed: sev === 'error', lane: lane + shown.cables.indexOf(c), onSelect: () => select([], c.id),
          mode: wireMode, toText: to ? `${to.equipment.tag} · ${to.port.label}` : undefined, fromText: from ? `${from.equipment.tag} · ${from.port.label}` : undefined,
          toPort: to?.port.label, fromPort: from?.port.label, toName: to ? flagName(to.equipment.tag, to.equipment.product.model) : undefined, fromName: from ? flagName(from.equipment.tag, from.equipment.product.model) : undefined },
      }
    })
  }, [shown, cableSeverity, selectedCable, selectedCables, selection, select, wireMode])

  // "Fit" requests (open a file, save a view…) – only new ones, so coming back from another tab doesn't re-fit.
  useEffect(() => {
    if (!fitRequest || fitRequest === seenFit) return
    seenFit = fitRequest
    viewports.clear()
    void fitView({ padding: 0.15, duration: 250 })
  }, [fitRequest, fitView])
  // Library ▸ Inventory → frame one device (after any page switch has rendered).
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; setTimeout(() => void fitView({ nodes: [{ id }], padding: 1.2, maxZoom: 1.2, duration: 300 }), 120) }
    window.addEventListener('diagram:locate', on)
    return () => window.removeEventListener('diagram:locate', on)
  }, [fitView])
  // Design check ▸ click an issue → frame the device(s) it's about (after any page / view switch has drawn).
  const locate = useStore((s) => s.locate)
  useEffect(() => {
    if (!locate || locate.seq === seenLocate) return
    const t = setTimeout(() => {
      seenLocate = locate.seq
      // Both ends if they fit at a readable size, else the first device (the one the issue names).
      const el = document.querySelector('.diagram')?.getBoundingClientRect()
      const ns = locate.ids.map((id) => getNode(id)).filter((n): n is NonNullable<typeof n> => !!n)
      if (!ns.length) return
      const b = getNodesBounds(ns)
      const both = ns.length > 1 && !!el && Math.min(el.width / (b.width * 1.5), el.height / (b.height * 1.5)) >= 0.45
      void fitView({ nodes: (both ? ns : ns.slice(0, 1)).map((n) => ({ id: n.id })), padding: both ? 0.25 : 0.6, maxZoom: 1, duration: 350 })
    }, 220)
    return () => clearTimeout(t)
  }, [locate, fitView, getNode, getNodesBounds])
  // Each page / view keeps its own zoom and position: coming back (from another page, or from the
  // rack elevation) puts you where you were; the first visit frames what's on it.
  const vpKey = viewId ?? page ?? 'all'
  useEffect(() => {
    const saved = viewports.get(vpKey)
    const t = setTimeout(() => { if (saved) void setViewport(saved); else void fitView({ padding: 0.15, duration: 250 }) }, saved ? 0 : 60)
    return () => { clearTimeout(t); viewports.set(vpKey, getViewport()) }
  }, [vpKey, fitView, setViewport, getViewport])

  const onNodesChange = useCallback((all: NodeChange<AnyNode>[]) => {
    // Dragging a group frame or a group box carries the devices in it rigidly: each device sits at
    // where it was when the drag began plus how far the frame has moved since. (Adding up per-event
    // steps against the last *rendered* frame made the devices creep away from the box when mouse
    // events came faster than renders.)
    const rigid = new Map<string, { x: number; y: number }>()
    const carry = (key: string, at: { x: number; y: number }, from: { x: number; y: number }, members: () => string[], dragging: boolean | undefined) => {
      let st = dragStart.current.get(key)
      if (!st && dragging === false) return
      if (!st) {
        const pos = new Map(nodesRef.current.map((n) => [n.id, n.position]))
        st = { x: from.x, y: from.y, members: new Map(members().map((id) => [id, { ...pos.get(id)! }])) }
        dragStart.current.set(key, st)
      }
      const dx = at.x - st.x, dy = at.y - st.y
      for (const [id, p] of st.members) rigid.set(id, { x: p.x + dx, y: p.y + dy })
      void dragging // kept until the drop (onNodeDragStop) saves where everything ended up
    }
    for (const c of all) {
      if (c.type !== 'position' || !c.position) continue
      if (c.id.startsWith('group:')) {
        const f = framesRef.current.find((x) => x.id === c.id)
        const gid = c.id.slice(6)
        if (f) carry(c.id, c.position, f.position, () => nodesRef.current.filter((n) => n.data.eq.groupId === gid).map((n) => n.id), c.dragging)
      } else if (c.id.startsWith('cbox:') && c.dragging !== undefined) {
        const b = boxesRef.current.find((x) => x.id === c.id)
        if (!b) continue
        let crew = boxCrew.current.get(c.id)
        if (!crew) {
          // Drag just started: who is in the box right now (devices being dragged themselves excluded).
          const r = { x: b.position.x, y: b.position.y, w: b.width ?? b.measured?.width ?? 0, h: b.height ?? b.measured?.height ?? 0 }
          const dragged = new Set(all.filter((x) => x.type === 'position' && x.dragging).map((x) => (x as { id: string }).id))
          crew = new Set(nodesRef.current.filter((n) => !n.hidden && !dragged.has(n.id) && insideRect(r, n.position, devSize(n))).map((n) => n.id))
          boxCrew.current.set(c.id, crew)
        }
        const ids = crew
        carry(c.id, c.position, b.position, () => [...ids], c.dragging)
      }
    }
    const boxChanges = all.filter((c) => 'id' in c && String(c.id).startsWith('cbox:')) as NodeChange<ClusterBoxType>[]
    if (boxChanges.length) setBoxes((bs) => applyNodeChanges(boxChanges.filter((c) => c.type !== 'remove'), bs))
    const noteChanges = all.filter((c) => 'id' in c && String(c.id).startsWith('note:')) as NodeChange<NoteNodeType>[]
    if (noteChanges.length) setNotes((ns) => applyNodeChanges(noteChanges.filter((c) => c.type !== 'remove'), ns))
    const changes = all.filter((c) => !('id' in c && (String(c.id).startsWith('group:') || String(c.id).startsWith('cbox:') || String(c.id).startsWith('note:')))) as NodeChange<DeviceNodeType>[]
    setNodes((ns) => {
      let next = applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns)
      if (rigid.size) next = next.map((n) => { const p = rigid.get(n.id); return p && !n.dragging ? { ...n, position: p } : n })
      if (changes.some((c) => c.type === 'select')) {
        const ids = next.filter((n) => n.selected).map((n) => n.id as EquipmentId)
        const cur = useStore.getState().selection
        if (ids.length !== cur.length || ids.some((id, i) => id !== cur[i])) queueMicrotask(() => select(ids, ids.length ? null : useStore.getState().selectedCable))
      }
      return next
    })
  }, [select])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const picked = changes.find((c) => c.type === 'select' && c.selected)
    if (picked && 'id' in picked) select([], picked.id as CableId)
  }, [select])

  const onNodeDragStop = useCallback((ev: MouseEvent | TouchEvent | React.MouseEvent, __: unknown, draggedAll: AnyNode[]) => {
    // Dropped on a page tab → move those devices to that page.
    const pt = pointOf(ev)
    const tab = (document.elementsFromPoint(pt.x, pt.y).find((el) => el instanceof HTMLElement && el.dataset.page !== undefined) as HTMLElement | undefined)
    const devs = draggedAll.filter((n) => n.type === 'device').map((n) => n.id)
    document.querySelectorAll('.pages-nav .drop').forEach((el) => el.classList.remove('drop'))
    const vid = useStore.getState().diagramView
    // A group box that was dragged: save where it is now, and the devices that moved with it.
    // Where each carried device ends up: its start + how far its frame / box moved (not the last render).
    const carried = new Map<string, { x: number; y: number }>()
    for (const n of draggedAll) {
      const st = dragStart.current.get(n.id)
      if (st) for (const [id, p] of st.members) carried.set(id, { x: p.x + n.position.x - st.x, y: p.y + n.position.y - st.y })
    }
    dragStart.current.clear()
    if (carried.size) setNodes((ns) => ns.map((n) => { const p = carried.get(n.id); return p ? { ...n, position: p } : n }))
    const posOf = (n: { id: string; position: { x: number; y: number } }) => carried.get(n.id) ?? n.position
    const movedBoxes = draggedAll.filter((n) => n.id.startsWith('cbox:'))
    const clusterIds = new Set(movedBoxes.map((n) => n.id.slice(5)))
    const crewIds = new Set(movedBoxes.flatMap((b) => [...(boxCrew.current.get(b.id) ?? [])]))
    for (const b of movedBoxes) boxCrew.current.delete(b.id)
    const clusterMembers = movedBoxes.length ? nodesRef.current.filter((n) => crewIds.has(n.id) && !draggedAll.some((x) => x.id === n.id)) : []
    if (movedBoxes.length) apply('Move Group', (d) => {
      for (const b of movedBoxes) { const x = d.clusters?.find((y) => y.id === b.id.slice(5)); if (x) { x.x = Math.round(b.position.x); x.y = Math.round(b.position.y); if (!x.w) { x.w = Math.round(b.width ?? 400); x.h = Math.round(b.height ?? 300) } } }
      const v = vid ? viewsOf(d).find((y) => y.id === vid) : undefined
      for (const n of clusterMembers) {
        const p = posOf(n)
        if (v) v.positions[n.id] = { x: Math.round(p.x), y: Math.round(p.y) }
        else { const eq = d.equipment.find((e) => e.id === n.id); if (eq) eq.position = { x: Math.round(p.x), y: Math.round(p.y) } }
      }
    })
    if (vid) {
      // In a signal view, moving only changes the view's own layout.
      const moved = draggedAll.filter((n) => n.type === 'device')
      if (moved.length) apply(moved.length > 1 ? 'Move Devices in View' : 'Move Device in View', (d) => {
        const v = viewsOf(d).find((x) => x.id === vid)
        if (v) for (const n of moved) v.positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
      })
    }
    if (tab && devs.length && !vid) {
      const target = tab.dataset.page || null
      const s = useStore.getState()
      // Undo the visual drag first (positions weren't committed), then move.
      s.set({ project: { ...s.project, equipment: [...s.project.equipment] } })
      if (target || s.project.equipment.some((e) => devs.includes(e.id) && e.groupId)) moveDevicesToPage(devs, target)
      return
    }
    const groupIds = new Set(draggedAll.filter((n) => n.type === 'groupFrame' && n.id.startsWith('group:')).map((n) => (n as GroupFrameType).data.id))
    const movedNotes = draggedAll.filter((n) => n.type === 'note')
    if (movedNotes.length) {
      apply(movedNotes.length > 1 ? 'Move Notes' : 'Move Note', (d) => {
        for (const n of movedNotes) {
          const a = d.annotations?.find((x) => `note:${x.id}` === n.id)
          if (!a) continue
          const dx = Math.round(n.position.x) - a.x, dy = Math.round(n.position.y) - a.y
          a.x += dx; a.y += dy
          if (a.leader && draggedAll.length > 1) a.leader = { x: a.leader.x + dx, y: a.leader.y + dy }
        }
      })
    }
    if (vid) return
    const dragged = [
      ...draggedAll.filter((n): n is DeviceNodeType => n.type === 'device'),
      ...nodesRef.current.filter((n) => n.data.eq.groupId && groupIds.has(n.data.eq.groupId)),
    ]
    if (!dragged.length) return
    apply(groupIds.size ? 'Move Group' : dragged.length > 1 ? 'Move Devices' : 'Move Device', (d) => {
      for (const n of dragged) {
        const eq = d.equipment.find((e) => e.id === n.id), p = posOf(n)
        if (eq) eq.position = { x: Math.round(p.x), y: Math.round(p.y) }
      }
      // Never on top of another device: slide the moved block into the nearest open space.
      resolveOverlap(d, dragged.map((n) => n.id), nodeGeom)
    })
  }, [apply])

  // ⌘⌫ deletes from the whole project – in a signal view too, where plain ⌫ only takes devices out of the view.
  const hardDelete = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== 'Backspace' && e.key !== 'Delete')) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return
      if (deleteBlocked(e.target)) return
      const st = useStore.getState()
      if (st.mode !== 'diagram' || (!st.selection.length && !st.selectedCable && !st.selectedCables.length)) return
      hardDelete.current = true
      // If React Flow doesn't pass the key on (modifier held), delete the selection ourselves.
      setTimeout(() => {
        if (!hardDelete.current) return
        hardDelete.current = false
        const s2 = useStore.getState()
        const cables = [...s2.selectedCables, ...(s2.selectedCable ? [s2.selectedCable] : [])]
        if (s2.selection.length || cables.length) deleteFromProject(new Set<string>(s2.selection), new Set<string>(cables))
      }, 0)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const deleteFromProject = useCallback((ids: Set<string>, cids: Set<string>) => {
    const devs = [...ids].filter((x) => !x.startsWith('note:'))
    apply('Delete', (d) => {
      if (d.annotations) d.annotations = d.annotations.filter((a) => !ids.has(`note:${a.id}`))
      d.equipment = d.equipment.filter((e) => !ids.has(e.id))
      d.patchBays = d.patchBays.filter((b) => !ids.has(b.equipment))
      d.cables = d.cables.filter((c) => !cids.has(c.id) && !ids.has(c.from.equipment) && !ids.has(c.to.equipment))
    })
    if (devs.length && useStore.getState().diagramView) useStore.getState().notify(`Deleted ${devs.length} device${devs.length === 1 ? '' : 's'} from the project`, { undo: true })
    select([], null)
  }, [apply, select])

  // Never delete diagram devices from a key press meant for something else (a dialog such as the
  // plate designer, the inspector, the sidebar): the selected wall box used to vanish that way.
  const onBeforeDelete = useCallback(async () => { if (deleteBlocked(document.activeElement)) { hardDelete.current = false; return false } return true }, [])
  const onDelete = useCallback(({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: { id: string }[] }) => {
    if (!ns.length && !es.length) return
    const ids = new Set(ns.map((n) => n.id))
    const cids = new Set(es.map((e) => e.id))
    const vid = useStore.getState().diagramView
    if (hardDelete.current) { hardDelete.current = false; deleteFromProject(ids, cids); return }
    if (vid) {
      // In a view, Delete takes devices out of the view; the devices stay in the project.
      const devs = [...ids].filter((x) => !x.startsWith('note:'))
      apply(devs.length ? 'Remove from View' : 'Delete', (d) => {
        setInView(d, vid, devs, false)
        if (d.annotations) d.annotations = d.annotations.filter((a) => !ids.has(`note:${a.id}`))
        // React Flow also hands over the wires attached to removed devices – those stay; only wires picked on their own are deleted.
        d.cables = d.cables.filter((c) => !cids.has(c.id) || devs.includes(c.from.equipment) || devs.includes(c.to.equipment))
      })
      if (devs.length) useStore.getState().notify(`Removed ${devs.length} device${devs.length === 1 ? '' : 's'} from this view – still on the main diagram (⌘⌫ deletes from the project)`, { undo: true })
      select([], null)
      return
    }
    deleteFromProject(ids, cids)
  }, [deleteFromProject])

  // Live validation while wiring.
  const startWiring = useWiring((s) => s.start)
  const endWiring = useWiring((s) => s.end)
  const onConnectStart: OnConnectStart = useCallback((_, { nodeId, handleId }) => {
    if (!nodeId || !handleId || rewire.current) return
    const origin: PortAddress = { equipment: nodeId as EquipmentId, port: handleId }
    startWiring(origin, findCandidates(useStore.getState().project, origin))
  }, [startWiring])

  // Grab either end of a wire and drop it on another port to rewire it (same cable number).
  const rewire = useRef<{ id: string; fixed: PortAddress; moving: 'from' | 'to' } | null>(null)
  const onReconnectStart = useCallback((_: unknown, edge: CableEdgeType, handleType: 'source' | 'target') => {
    const p = useStore.getState().project
    const c = p.cables.find((x) => x.id === edge.id)
    if (!c) return
    // React Flow reports the end that stays put.
    const moving = handleType === 'source' ? 'to' : 'from'
    const fixed = moving === 'from' ? c.to : c.from
    rewire.current = { id: c.id, fixed, moving }
    // Candidates as if this cable weren't there, so its own ports count as free.
    startWiring(fixed, findCandidates({ ...p, cables: p.cables.filter((x) => x.id !== c.id) }, fixed))
  }, [startWiring])
  const onReconnect = useCallback((_old: CableEdgeType, c: Connection) => {
    const r = rewire.current
    if (!r || !c.sourceHandle || !c.targetHandle) return
    const a = { equipment: c.source as EquipmentId, port: c.sourceHandle }, b = { equipment: c.target as EquipmentId, port: c.targetHandle }
    const next = a.equipment === r.fixed.equipment && a.port === r.fixed.port ? b : a
    let label = ''
    apply('Rewire Cable', (d) => {
      const cab = d.cables.find((x) => x.id === r.id)
      if (!cab) return
      cab[r.moving] = next
      label = cab.label
    })
    const e = useStore.getState().project.equipment.find((x) => x.id === next.equipment)
    useStore.getState().notify(`Rewired ${label} to ${e?.tag ?? ''} ${e?.product.ports.find((q) => q.id === next.port)?.label ?? ''}`, { undo: true, kind: 'success' })
    select([], r.id as CableId)
  }, [apply, select])
  const onReconnectEnd = useCallback(() => { rewire.current = null; endWiring() }, [endWiring])

  // Lasso: wires the selection box crosses get selected too.
  const lassoFrom = useRef<{ x: number; y: number } | null>(null)
  const onSelectionStart = useCallback((e: React.MouseEvent) => { lassoFrom.current = { x: e.clientX, y: e.clientY } }, [])
  const onSelectionEnd = useCallback((e: React.MouseEvent) => {
    const s0 = lassoFrom.current
    lassoFrom.current = null
    if (!s0 || (Math.abs(e.clientX - s0.x) < 4 && Math.abs(e.clientY - s0.y) < 4)) return
    const p0 = screenToFlowPosition(s0), p1 = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const box = { x0: Math.min(p0.x, p1.x), y0: Math.min(p0.y, p1.y), x1: Math.max(p0.x, p1.x), y1: Math.max(p0.y, p1.y) }
    // Each wire path is straight runs (M/L, with Q corners): test each run against the box.
    const hits = new Set<string>()
    const crosses = (x1: number, y1: number, x2: number, y2: number) =>
      Math.max(x1, x2) >= box.x0 && Math.min(x1, x2) <= box.x1 && Math.max(y1, y2) >= box.y0 && Math.min(y1, y2) <= box.y1
    document.querySelectorAll<SVGPathElement>('.react-flow__edge path.react-flow__edge-path').forEach((path) => {
      const id = path.closest('.react-flow__edge')?.getAttribute('data-id')
      if (!id || hits.has(id)) return
      const n = (path.getAttribute('d') ?? '').replace(/[MLQ]/g, ' ').trim().split(/[\s,]+/).map(Number)
      for (let k = 0; k + 3 < n.length; k += 2) if (crosses(n[k], n[k + 1], n[k + 2], n[k + 3])) { hits.add(id); return }
    })
    if (!hits.size) return
    // After React Flow has applied its own (device) selection.
    setTimeout(() => {
      const ids = [...hits] as CableId[]
      useStore.getState().set({ selectedCables: ids, selectedCable: ids.length === 1 ? ids[0] : null })
      useStore.getState().notify(`${ids.length} wire${ids.length === 1 ? '' : 's'} selected – Delete removes ${ids.length === 1 ? 'it' : 'them'}`, { kind: 'info' })
    }, 0)
  }, [screenToFlowPosition])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const { origin, candidates } = useWiring.getState()
    if (!origin) return false
    const other = c.source === origin.equipment && c.sourceHandle === origin.port ? `${c.target}/${c.targetHandle}` : `${c.source}/${c.sourceHandle}`
    return candidates.has(other)
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (!c.sourceHandle || !c.targetHandle) return
    const a = { equipment: c.source as EquipmentId, port: c.sourceHandle }
    const b = { equipment: c.target as EquipmentId, port: c.targetHandle }
    // Patching multiples: dragging from one of several shift-picked ports wires them all,
    // in pick order, onto the dropped-on port and the ones after it.
    const { picked, clearPicks } = useWiring.getState()
    const origin = useWiring.getState().origin
    const dragged = origin ?? a
    const target = origin && origin.equipment === b.equipment && origin.port === b.port ? a : b
    if (picked.length > 1 && pickIndex(picked, dragged) >= 0) {
      let res: BulkResult | undefined
      apply(`Patch ${picked.length} Connections`, (d) => { res = connectMany(d, picked, target) })
      clearPicks()
      if (res) {
        const n = res.made.length, k = res.skipped.length
        useStore.getState().notify(`Patched ${n} connection${n === 1 ? '' : 's'}${k ? ` · ${k} had no free compatible port` : ''}`, { undo: true, kind: k ? 'warning' : 'success' })
        select([], res.made[0]?.cable ?? null)
      }
      return
    }
    let created: CableId | undefined
    apply('Connect', (d) => { created = connect(d, a, b).cableId })
    if (created) select([], created)
  }, [apply, select])

  // MARK: Drop outlines – a library drag and a duplicate show the device's real size under the pointer,
  // already moved clear of other devices, and land exactly there.
  type Ghost = { at: { x: number; y: number }; rects: { x: number; y: number; w: number; h: number; label: string }[] }
  const [ghost, setGhostState] = useState<Ghost | null>(null)
  const ghostRef = useRef<Ghost | null>(null)
  const setGhost = (g: Ghost | null) => { ghostRef.current = g; setGhostState(g) }
  const dropBoxes = useRef<Box[] | null>(null)
  const sizeCache = useRef<{ key: string; w: number; h: number; label: string } | null>(null)
  const clearGhost = () => { setGhost(null); dropBoxes.current = null }
  const boxesForPage = (ignore: string[] = []) => {
    const st = useStore.getState()
    return occupiedBoxes(st.project, nodeGeom, { margin: 16, ignore, among: samePage({ groupId: st.diagramPage }) })
  }
  const payloadSize = (pl: DragPayload) => {
    if (pl.kind !== 'product' && pl.kind !== 'patch') return null
    const key = `${pl.kind}:${pl.key}`
    if (sizeCache.current?.key === key) return sizeCache.current
    const st = useStore.getState(), tmp = newProject()
    let eq
    if (pl.kind === 'product') { const prod = st.library.get(pl.key); if (!prod) return null; eq = addEquipment(tmp, prod, { x: 0, y: 0 }) }
    else { const t = st.templates.find((x) => x.key === pl.key); if (!t) return null; const b = addPatchBay(tmp, t, { x: 0, y: 0 }); eq = tmp.equipment.find((x) => x.id === b.equipment) }
    if (!eq) return null
    const g = nodeGeom(eq)
    sizeCache.current = { key, w: g.width, h: g.height, label: eq.product.model }
    return sizeCache.current
  }
  const onDragOverDiagram = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
    const pl = dragState.payload
    if (!pl || useStore.getState().diagramView) return
    const sz = payloadSize(pl)
    if (!sz) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    dropBoxes.current ??= boxesForPage()
    const at = findFreeSpot(dropBoxes.current, { width: sz.w, height: sz.h }, { x: p.x - sz.w / 2, y: p.y - 14 }, GRID, GRID)
    if (ghostRef.current && ghostRef.current.at.x === at.x && ghostRef.current.at.y === at.y) return
    setGhost({ at, rects: [{ x: at.x, y: at.y, w: sz.w, h: sz.h, label: sz.label }] })
  }

  // Duplicating: the copies follow the pointer; click drops them, Esc cancels.
  const placing = useStore((s) => s.placing)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const placeBlock = useMemo(() => {
    if (!placing) return null
    const eqs = useStore.getState().project.equipment.filter((e) => placing.ids.includes(e.id))
    if (!eqs.length) return null
    const x0 = Math.min(...eqs.map((e) => e.position.x)), y0 = Math.min(...eqs.map((e) => e.position.y))
    const items = eqs.map((e) => { const g = nodeGeom(e); return { dx: e.position.x - x0, dy: e.position.y - y0, w: g.width, h: g.height, label: e.product.model } })
    return { x0, y0, items, w: Math.max(...items.map((i) => i.dx + i.w)), h: Math.max(...items.map((i) => i.dy + i.h)), boxes: boxesForPage() }
  }, [placing])
  const movePlacing = (clientX: number, clientY: number) => {
    if (!placeBlock) return
    const p = screenToFlowPosition({ x: clientX, y: clientY })
    const at = findFreeSpot(placeBlock.boxes, { width: placeBlock.w, height: placeBlock.h }, { x: p.x - placeBlock.w / 2, y: p.y - 14 }, GRID, GRID)
    if (ghostRef.current && ghostRef.current.at.x === at.x && ghostRef.current.at.y === at.y) return
    setGhost({ at, rects: placeBlock.items.map((i) => ({ x: at.x + i.dx, y: at.y + i.dy, w: i.w, h: i.h, label: i.label })) })
  }
  useEffect(() => {
    if (!placing) { if (!dragState.payload) clearGhost(); return }
    if (lastPointer.current) movePlacing(lastPointer.current.x, lastPointer.current.y)
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { useStore.getState().set({ placing: null }); clearGhost() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [placeBlock])
  const commitPlacing = () => {
    const g = ghostRef.current
    if (!placing || !placeBlock || !g) return
    let made: string[] = [], tags: string[] = []
    apply(placing.ids.length > 1 ? `Duplicate ${placing.ids.length} Devices` : 'Duplicate Device', (d) => {
      const copies = duplicateDevices(d, placing.ids, { x: g.at.x - placeBlock.x0, y: g.at.y - placeBlock.y0 })
      made = copies.map((c) => c.id); tags = copies.map((c) => c.tag)
    })
    useStore.getState().set({ placing: null })
    clearGhost()
    if (made.length) { select(made as EquipmentId[]); useStore.getState().notify(`Duplicated as ${tags.join(', ')}`, { undo: true, kind: 'success' }) }
  }
  // MARK: Align / distribute popover – appears by the pointer when several devices are selected.
  const [alignPop, setAlignPop] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const showAlignAtPointer = () => {
    const el = document.querySelector('.diagram') as HTMLElement | null, p = lastPointer.current
    if (!el || !p) return
    const r = el.getBoundingClientRect()
    // Keep it clear of the floating inspector on the right.
    const insp = document.querySelector('.app.insp-float .inspector:not(.peek)') as HTMLElement | null
    const right = Math.min(r.right, insp ? insp.getBoundingClientRect().left : r.right) - r.left
    const W = 320
    const x = p.x - r.left + 14 + W > right ? p.x - r.left - W - 14 : p.x - r.left + 14
    setAlignPop({ x: Math.max(8, Math.min(right - W, x)), y: Math.min(r.height - 50, Math.max(8, p.y - r.top + 14)) })
  }
  const devCount = selection.length
  useEffect(() => {
    if (devCount < 2) { setAlignPop(null); return }
    if (dragging.current) return
    // A box-select is still in progress: wait for the mouse to come up.
    let done = false
    const up = () => { if (!done) { done = true; showAlignAtPointer() } }
    window.addEventListener('pointerup', up, { once: true })
    const t = setTimeout(() => { if (!done && !(window as unknown as { __rfDown?: boolean }).__rfDown) { done = true; showAlignAtPointer() } }, 250)
    return () => { window.removeEventListener('pointerup', up); clearTimeout(t) }
  }, [selection])
  useEffect(() => {
    const down = () => { (window as unknown as { __rfDown?: boolean }).__rfDown = true }
    const up = () => { (window as unknown as { __rfDown?: boolean }).__rfDown = false }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAlignPop(null) }
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('keydown', esc) }
  }, [])
  const doArrange = (mode: ArrangeMode) => {
    const s = useStore.getState(), vid = s.diagramView
    const boxes = nodesRef.current.filter((n): n is DeviceNodeType => n.type === 'device' && s.selection.includes(n.id as EquipmentId))
      .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, ...(() => { const z = devSize(n); return { w: z.w, h: z.h } })() }))
    if (boxes.length < 2) return
    const at = arrange(boxes, mode)
    const label = { left: 'Align Left', center: 'Align Centres', right: 'Align Right', top: 'Align Top', middle: 'Align Middles', bottom: 'Align Bottom', distH: 'Distribute Horizontally', distV: 'Distribute Vertically' }[mode]
    apply(label, (d) => {
      const v = vid ? viewsOf(d).find((x) => x.id === vid) : undefined
      for (const [id, p] of at) {
        if (v) v.positions[id] = p
        else { const eq = d.equipment.find((e) => e.id === id); if (eq) eq.position = p }
      }
      // Still never on top of other devices: the aligned block slides clear as one piece.
      if (!v) resolveOverlap(d, [...at.keys()], nodeGeom)
    })
  }

  // ⌘D duplicates the selection (follows the pointer until you click).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'd' || e.shiftKey || e.altKey) return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-backdrop')) return
      const st = useStore.getState()
      if (st.mode !== 'diagram' || !st.selection.length) return
      e.preventDefault()
      void import('../product/productActions').then((m) => m.duplicatePlaced(String(st.selection[0])))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    e.preventDefault()
    const payload = JSON.parse(raw) as DragPayload
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    // Where the outline showed is exactly where it lands.
    const shown = ghostRef.current?.at
    const at = shown ?? { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
    clearGhost()
    const s = useStore.getState()
    if (payload.kind === 'product') {
      const product = s.library.get(payload.key)
      if (!product) return
      let id: EquipmentId | undefined
      apply(`Add ${product.model}`, (d) => { const eq = addEquipment(d, product, at); id = eq.id; if (shown) eq.position = { ...shown }; else placeInFreeSpace(d, id, nodeGeom) })
      if (id) select([id])
    } else if (payload.kind === 'patch') {
      const t = s.templates.find((x) => x.key === payload.key)
      if (!t) return
      let bay: { id: string; equipment: EquipmentId } | undefined
      apply('Add Patch Bay', (d) => { bay = addPatchBay(d, t, at); const eq = d.equipment.find((x) => x.id === bay!.equipment); if (shown && eq) eq.position = { ...shown }; else placeInFreeSpace(d, bay.equipment, nodeGeom) })
      if (bay) { select([bay.equipment]); s.set({ selectedBay: bay.id as never }) }
    }
  }, [apply, screenToFlowPosition, select])

  return (
    <div className="diagram-wrap">
    <DiagramTools />
    <div className={`diagram ${placing ? 'placing' : ''}`} onDragOver={onDragOverDiagram} onDrop={onDrop}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) clearGhost() }}
      onMouseMove={(e) => { lastPointer.current = { x: e.clientX, y: e.clientY }; if (placing) movePlacing(e.clientX, e.clientY) }}
      onClickCapture={(e) => { if (placing) { e.stopPropagation(); e.preventDefault(); commitPlacing() } }}
      onContextMenuCapture={(e) => { if (placing) { e.preventDefault(); e.stopPropagation(); useStore.getState().set({ placing: null }); clearGhost() } }}>
      <ReactFlow<AnyNode, CableEdgeType>
        nodes={allNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(ev, n, all) => { dragging.current = false; onNodeDragStop(ev, n, all); if (useStore.getState().selection.length > 1) setTimeout(showAlignAtPointer, 0) }}
        onNodeDragStart={() => { dragging.current = true; setAlignPop(null) }}
        onNodeDrag={(ev) => {
          const pt = pointOf(ev)
          const over = document.elementsFromPoint(pt.x, pt.y).find((el) => el instanceof HTMLElement && el.dataset.page !== undefined)
          document.querySelectorAll('.pages-nav [data-page]').forEach((el) => el.classList.toggle('drop', el === over))
        }}
        onDelete={onDelete}
        onBeforeDelete={onBeforeDelete}
        onNodeDoubleClick={(ev, n) => {
          if (n.type === 'groupFrame') { select(project.equipment.filter((e) => e.groupId === (n as GroupFrameType).data.id).map((e) => e.id)); return }
          if ((ev.target as HTMLElement).closest('.react-flow__handle')) return
          select([n.id as EquipmentId]); editPlacedDevice(n.id)
        }}
        onNodeContextMenu={(ev, n) => {
          if (n.type === 'clusterBox') { showContextMenu(ev, clusterBoxMenu((n as ClusterBoxType).data.id, n.id, () => select(nodesRef.current.filter((d) => !d.hidden && insideRect({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }, d.position, devSize(d))).map((d) => d.id as EquipmentId)))); return }
          if (n.type !== 'device') return
          const cur = useStore.getState().selection
          const ids = cur.includes(n.id as EquipmentId) ? cur : [n.id as EquipmentId]
          if (ids !== cur) select(ids)
          showContextMenu(ev, [...deviceMenu(n.id), ...(view ? viewMenuItems(ids, view.id) : [...pageMenuItems(ids), ...addToViewItems(ids)])])
        }}
        edgesReconnectable={false}
        reconnectRadius={14}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onConnectStart={onConnectStart}
        onConnectEnd={endWiring}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => { select([], null); useWiring.getState().clearPicks() }}
        onPaneContextMenu={(ev) => showContextMenu(ev as React.MouseEvent, [
          { label: 'Add Group', hint: 'then drag out its box', onClick: () => setDrawingGroup(true) },
        ])}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={18}
        connectionLineStyle={{ strokeWidth: 2, strokeDasharray: '5 4' }}
        snapToGrid
        snapGrid={[GRID, GRID]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Meta', 'Shift', 'Control']}
        selectionOnDrag
        selectionKeyCode={null}
        panOnDrag={[1, 2]}
        panOnScroll
        zoomOnPinch
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={viewports.get(vpKey) ?? undefined}
        onMoveEnd={(_, vp) => viewports.set(vpKey, vp)}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1.2} />
        {ghost && <ViewportPortal>
          {ghost.rects.map((r, i) => (
            <div key={i} className="drop-ghost" style={{ transform: `translate(${r.x}px, ${r.y}px)`, width: r.w, height: r.h }}><span>{r.label}</span></div>
          ))}
        </ViewportPortal>}
        {placing && <Panel position="bottom-center" className="picked-panel place-hint">Click to place the {placing.ids.length > 1 ? `${placing.ids.length} copies` : 'copy'} · Esc to cancel</Panel>}
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--node-mini)" maskColor="var(--minimap-mask)" />
        <WiringHint />
        <PickedPanel />
        {drawingGroup && (
          <div className="group-draw nodrag nopan"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); const b = e.currentTarget.getBoundingClientRect(); setDrawRect({ x0: e.clientX - b.left, y0: e.clientY - b.top, x1: e.clientX - b.left, y1: e.clientY - b.top }) }}
            onPointerMove={(e) => { if (!drawRect) return; const b = e.currentTarget.getBoundingClientRect(); setDrawRect({ ...drawRect, x1: e.clientX - b.left, y1: e.clientY - b.top }) }}
            onPointerUp={(e) => {
              const b = e.currentTarget.getBoundingClientRect()
              if (drawRect && Math.abs(drawRect.x1 - drawRect.x0) > 8 && Math.abs(drawRect.y1 - drawRect.y0) > 8) {
                const a = screenToFlowPosition({ x: b.left + Math.min(drawRect.x0, drawRect.x1), y: b.top + Math.min(drawRect.y0, drawRect.y1) })
                const z = screenToFlowPosition({ x: b.left + Math.max(drawRect.x0, drawRect.x1), y: b.top + Math.max(drawRect.y0, drawRect.y1) })
                apply('Add Group', (d) => { addCluster(d, { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y }, view?.id ?? page ?? null) })
              }
              setDrawRect(null); setDrawingGroup(false)
            }}>
            <div className="group-draw-hint">Drag to draw the group’s box · Esc to cancel</div>
            {drawRect && <div className="group-draw-rect" style={{ left: Math.min(drawRect.x0, drawRect.x1), top: Math.min(drawRect.y0, drawRect.y1), width: Math.abs(drawRect.x1 - drawRect.x0), height: Math.abs(drawRect.y1 - drawRect.y0) }} />}
          </div>
        )}
        {view && shown.equipment.length === 0 && (
          <Panel position="top-center" className="hint-panel">Nothing in this view yet – right-click the view's tab → Edit View… to pick devices.</Panel>
        )}
        {project.equipment.length === 0 && (
          <Panel position="top-center" className="hint-panel">
            Drag gear from the library to start. Drag from a port to wire it — only valid targets light up.
          </Panel>
        )}
      </ReactFlow>
      {alignPop && devCount > 1 && !placing && (
        <div className="align-pop" style={{ left: alignPop.x, top: alignPop.y }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {([['left', 'Align left edges'], ['center', 'Align centres'], ['right', 'Align right edges']] as [ArrangeMode, string][]).map(([m, t]) => <button key={m} className="icon-btn" title={t} onClick={() => doArrange(m)}><AlignIcon m={m} /></button>)}
          <span className="ap-sep" />
          {([['top', 'Align top edges'], ['middle', 'Align middles'], ['bottom', 'Align bottom edges']] as [ArrangeMode, string][]).map(([m, t]) => <button key={m} className="icon-btn" title={t} onClick={() => doArrange(m)}><AlignIcon m={m} /></button>)}
          <span className="ap-sep" />
          {([['distH', 'Distribute horizontally (equal gaps)'], ['distV', 'Distribute vertically (equal gaps)']] as [ArrangeMode, string][]).map(([m, t]) => <button key={m} className="icon-btn" title={t} onClick={() => doArrange(m)}><AlignIcon m={m} /></button>)}
          <span className="ap-sep" />
          <span className="ap-n">{devCount}</span>
          <button className="icon-btn ap-x" title="Hide (Esc)" onClick={() => setAlignPop(null)}>✕</button>
        </div>
      )}
    </div>
    </div>
  )
}

/** Align / distribute glyphs. */
function AlignIcon({ m }: { m: ArrangeMode }) {
  const p = { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const }
  const bar = { fill: 'currentColor', stroke: 'none', opacity: 0.85 }
  switch (m) {
    case 'left': return <svg {...p}><path d="M3 2v16" /><rect x="5" y="4" width="11" height="4" rx="1" {...bar} /><rect x="5" y="12" width="7" height="4" rx="1" {...bar} /></svg>
    case 'center': return <svg {...p}><path d="M10 2v16" strokeDasharray="2 1.5" /><rect x="3" y="4" width="14" height="4" rx="1" {...bar} /><rect x="5.5" y="12" width="9" height="4" rx="1" {...bar} /></svg>
    case 'right': return <svg {...p}><path d="M17 2v16" /><rect x="4" y="4" width="11" height="4" rx="1" {...bar} /><rect x="8" y="12" width="7" height="4" rx="1" {...bar} /></svg>
    case 'top': return <svg {...p}><path d="M2 3h16" /><rect x="4" y="5" width="4" height="11" rx="1" {...bar} /><rect x="12" y="5" width="4" height="7" rx="1" {...bar} /></svg>
    case 'middle': return <svg {...p}><path d="M2 10h16" strokeDasharray="2 1.5" /><rect x="4" y="3" width="4" height="14" rx="1" {...bar} /><rect x="12" y="5.5" width="4" height="9" rx="1" {...bar} /></svg>
    case 'bottom': return <svg {...p}><path d="M2 17h16" /><rect x="4" y="4" width="4" height="11" rx="1" {...bar} /><rect x="12" y="8" width="4" height="7" rx="1" {...bar} /></svg>
    case 'distH': return <svg {...p}><path d="M2 3v14M18 3v14" /><rect x="5" y="6" width="3" height="8" rx="1" {...bar} /><rect x="12" y="6" width="3" height="8" rx="1" {...bar} /></svg>
    case 'distV': return <svg {...p}><path d="M3 2h14M3 18h14" /><rect x="6" y="5" width="8" height="3" rx="1" {...bar} /><rect x="6" y="12" width="8" height="3" rx="1" {...bar} /></svg>
  }
}

/** Explains why the hovered target is (in)valid while a wire is in progress. */
function WiringHint() {
  const connection = useConnection()
  const origin = useWiring((s) => s.origin)
  if (!connection.inProgress || !origin) return null
  const to = connection.toHandle
  let msg = 'Drag to a highlighted port'
  let cls = 'neutral'
  if (to?.nodeId && to.id && !(to.nodeId === origin.equipment && to.id === origin.port)) {
    const p = useStore.getState().project
    const v = validate(p, origin, { equipment: to.nodeId as EquipmentId, port: to.id })
    const err = v.issues.find((i) => i.severity === 'error')
    const warn = v.issues.find((i) => i.severity === 'warning')
    if (err) { msg = `✕ ${err.message}`; cls = 'error' }
    else if (warn) { msg = `! ${warn.message}`; cls = 'warning' }
    else if (v.signal) { msg = `✓ ${SIGNALS[v.signal].name}${v.suggestedCables[0] ? ` · ${v.suggestedCables[0].name}` : ''}`; cls = 'ok' }
  }
  const picked = useWiring.getState().picked
  if (picked.length > 1 && pickIndex(picked, origin) >= 0 && cls !== 'error') msg = `Patching ${picked.length} → ${msg.replace(/^✓ /, '')}`
  return <Panel position="bottom-center" className={`wiring-hint ${cls}`}>{msg}</Panel>
}

/** Shows the shift-picked ports and how to use them. Esc clears. */
function PickedPanel() {
  const picked = useWiring((s) => s.picked)
  const clear = useWiring((s) => s.clearPicks)
  const origin = useWiring((s) => s.origin)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useWiring.getState().clearPicks() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!picked.length || origin) return null
  return (
    <Panel position="bottom-center" className="picked-panel">
      <b>{picked.length}</b> port{picked.length === 1 ? '' : 's'} picked.{' '}
      Click the first port on the other device – {picked.length > 1 ? 'they cascade down that side in order.' : 'or shift-click another port here to pick the whole run.'}
      <button className="mini" onClick={clear}>Clear (Esc)</button>
    </Panel>
  )
}

/** Diagram bar: page name, wire drawing mode, notes, print. */
function DiagramTools() {
  const settings = useStore((s) => s.project.diagram)
  const viewId = useStore((s) => s.diagramView)
  const selection = useStore((s) => s.selection)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const { fitView } = useReactFlow()
  const [printing, setPrinting] = useState(false)
  const { screenToFlowPosition } = useReactFlow()
  const addNote = (kind: AnnotationKind) => {
    const el = document.querySelector('.diagram')?.getBoundingClientRect()
    const c = el ? screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }) : { x: 0, y: 0 }
    const s = useStore.getState()
    const revs = s.project.revisions ?? []
    const a: Annotation = {
      id: newId(), kind, x: Math.round(c.x - 110), y: Math.round(c.y - 40), w: kind === 'note' ? 240 : 220, h: kind === 'revision' ? 70 : 80,
      text: kind === 'revision' ? (revs[revs.length - 1]?.description ?? '') : '', page: s.diagramView ?? s.diagramPage ?? undefined,
      leader: kind === 'callout' ? { x: Math.round(c.x - 200), y: Math.round(c.y + 120) } : undefined,
      rev: kind === 'revision' ? (revs[revs.length - 1]?.rev ?? s.project.info.revision ?? 'A') : undefined,
    }
    s.apply(kind === 'callout' ? 'Add Callout' : kind === 'revision' ? 'Add Revision Note' : 'Add Note', (d) => { d.annotations = [...(d.annotations ?? []), a] })
    s.notify('Double-click the note to type · drag to move · drag its corners to resize' + (kind === 'callout' ? ' · drag the arrow’s dot to aim it' : ''), { kind: 'info' })
  }
  const set = (label: string, patch: Partial<NonNullable<typeof settings>>) => apply(label, (d) => { d.diagram = { ...(d.diagram ?? {}), ...patch } })
  const pageName = useStore((s) => s.diagramView ? viewsOf(s.project).find((v) => v.id === s.diagramView)?.name : s.diagramPage ? (s.project.groups ?? []).find((g) => g.id === s.diagramPage)?.name : 'All Pages')
  return (
    <div className="diagram-tools diagram-bar">
      <span className="db-title" title="The page or view shown – pick another in the sidebar">{pageName}</span>
      <span className="db-sep" />
      <span className="db-label">Wires</span>
      <Segmented<WireMode> value={settings?.wires ?? 'all'} onChange={(v) => set('Wire Style', { wires: v })} options={[
        { value: 'all', label: 'All wires', title: 'Draw every wire in full' },
        { value: 'smart', label: 'Smart', title: 'Long or tangled wires become labelled stubs at each end (like a CAD drawing). Select one to see it in full.' },
        { value: 'stubs', label: 'Stubs', title: 'Every wire is a labelled stub at each end' },
      ]} />
      <button onClick={(e) => showContextMenu(e, [
        { label: 'Callout (box + arrow)', onClick: () => addNote('callout') },
        { label: 'Note', onClick: () => addNote('note') },
        { label: 'Revision Note (Δ cloud)', onClick: () => addNote('revision') },
      ])} title="Place a callout, note or revision note anywhere on the diagram">＋ Note ▾</button>
      {viewId && <button className="danger" onClick={() => clearViewWires(viewId)} title="Delete every cable drawn on this view. Cables of other signal types (not on this view) are kept. Undo with ⌘Z.">Remove Connections</button>}
      <span className="db-fill" />
      <button onClick={() => setPrinting(true)} title="Print or export a CAD-style wiring drawing">Print…</button>
      {printing && createPortal(<SchematicPrintDialog onClose={() => setPrinting(false)} />, document.body)}
    </div>
  )
}

/** Right-click on a group box: select what's in it, rename, colour, delete. */
function clusterBoxMenu(id: string, nodeId: string, selectInside: () => void): MenuItem[] {
  const s = useStore.getState()
  const c = clustersOf(s.project).find((x) => x.id === id)
  if (!c) return []
  return [
    { label: 'Select Devices in Group', onClick: selectInside },
    { label: 'Rename…', hint: 'double-click the label', onClick: () => (document.querySelector(`.react-flow__node[data-id="${nodeId}"] .cb-label`) as HTMLElement | null)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) },
    'sep',
    ...CLUSTER_COLORS.map((col, i): MenuItem => ({ label: `${clusterColor(s.project, c) === col ? '● ' : '○ '}${['Indigo', 'Teal', 'Amber', 'Pink', 'Violet', 'Cyan', 'Lime', 'Orange', 'Grey'][i]}`, onClick: () => s.apply('Group Colour', (d) => { const x = d.clusters?.find((y) => y.id === id); if (x) x.color = col }) })),
    'sep',
    { label: 'Delete Group (keeps the devices)', danger: true, onClick: () => s.apply('Delete Group', (d) => deleteCluster(d, id)) },
  ]
}

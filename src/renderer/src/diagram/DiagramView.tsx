import { editPlacedDevice } from '../product/openEditor'
import { deviceMenu } from '../product/productActions'
import { showContextMenu } from '../components/ContextMenu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyNodeChanges, Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, Panel, ReactFlow, useConnection, useReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange, type OnConnectStart,
} from '@xyflow/react'
import {
  addEquipment, addPatchBay, addToGroup, nodeGeom, placeInFreeSpace, connectMany, groupColor, groupsOf, type BulkResult, candidates as findCandidates, connect, DOMAINS, portDomain, resolve, SIGNALS, validate,
  type CableId, type EquipmentId, type PortAddress,
} from '@core/index'
import { useStore } from '../store'
import { DRAG_MIME, type DragPayload } from '../components/Sidebar'
import { setViewCenterProvider } from './placement'
import { pickIndex } from './wiring'
import { DeviceNode, headerHeight, NODE_WIDTH, ROW_H, splitPorts, type DeviceNodeType } from './DeviceNode'
import { GroupFrame, type GroupFrameType } from './GroupFrame'
import { CableEdge, type CableEdgeType } from './CableEdge'
import { GroupsPanel, PageTabs, moveDevicesToPage, pageMenuItems, useGroupFocus } from './GroupsPanel'
import { NoteNode, type NoteNodeType } from './NoteNode'
import { useWiring } from './wiring'
import { tidyDiagram } from './tidy'
import { SchematicPrintDialog } from '../print/SchematicPrint'
import { createPortal } from 'react-dom'
import { Segmented } from '../components/ui'
import { newId, type Annotation, type AnnotationKind, type WireMode } from '@core/index'

const nodeTypes = { device: DeviceNode, groupFrame: GroupFrame, note: NoteNode }
const edgeTypes = { cable: CableEdge }
type AnyNode = DeviceNodeType | GroupFrameType | NoteNodeType
const FRAME_PAD = 22, FRAME_LABEL = 26
const nodeH = (n: DeviceNodeType) => n.measured?.height ?? headerHeight(n.data.eq) + Math.max(...Object.values(splitPorts(n.data.eq)).map((x) => x.length), 1) * ROW_H + 8
const GRID = 8

const pointOf = (e: MouseEvent | TouchEvent | React.MouseEvent) => ('touches' in e ? { x: (e.changedTouches[0] ?? e.touches[0])?.clientX ?? 0, y: (e.changedTouches[0] ?? e.touches[0])?.clientY ?? 0 } : { x: e.clientX, y: e.clientY })

export function DiagramView() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const selectedCable = useStore((s) => s.selectedCable)
  const issues = useStore((s) => s.issues)
  const fitRequest = useStore((s) => s.fitRequest)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const { screenToFlowPosition, fitView } = useReactFlow()
  const focusGroup = useGroupFocus((s) => s.focus)
  const page = useStore((s) => s.diagramPage)
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
    for (const c of project.cables) for (const a of [c.from, c.to]) {
      if (!connected.has(a.equipment)) connected.set(a.equipment, new Set())
      connected.get(a.equipment)!.add(a.port)
    }
    const sel = new Set(selection)
    const groups = new Map(groupsOf(project).map((g) => [g.id, g]))
    // Page view: devices on other pages are hidden; their wires become flags on the visible port.
    const onPage = (e: { groupId?: string }) => !page || e.groupId === page
    const eqById = new Map(project.equipment.map((e) => [e.id as string, e]))
    const offPage = new Map<string, Record<string, string>>()
    if (page) for (const c of project.cables) {
      const a = eqById.get(c.from.equipment), b = eqById.get(c.to.equipment)
      if (!a || !b || onPage(a) === onPage(b)) continue
      const [here, hereAddr, there, thereAddr] = onPage(a) ? [a, c.from, b, c.to] : [b, c.to, a, c.from]
      const tp = there.product.ports.find((x) => x.id === thereAddr.port)
      const pg = there.groupId ? groups.get(there.groupId)?.name : undefined
      offPage.set(here.id, { ...(offPage.get(here.id) ?? {}), [hereAddr.port]: `${c.label} ▸ ${there.tag} · ${tp?.label ?? ''}${pg ? ` (${pg})` : ' (no page)'}` })
    }
    setNodes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return project.equipment.map((eq) => {
        const old = byId.get(eq.id)
        const g = eq.groupId ? groups.get(eq.groupId) : undefined
        const dim = !!focusGroup && eq.groupId !== focusGroup
        return { ...(old ?? {}), id: eq.id, type: 'device' as const, position: { ...eq.position }, selected: sel.has(eq.id), hidden: !onPage(eq),
          data: { eq, connected: connected.get(eq.id) ?? new Set(), group: g ? { name: g.name, color: groupColor(g) } : undefined, dim, offPage: offPage.get(eq.id) } }
      })
    })
  }, [project.equipment, project.cables, project.groups, selection, focusGroup, page])

  // Group frames follow their devices live (including mid-drag).
  const frames = useMemo<GroupFrameType[]>(() => (page ? [] : groupsOf(project)).flatMap((g) => {
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
  }), [project, nodes, focusGroup, page])
  const framesRef = useRef(frames); framesRef.current = frames
  const nodesRef = useRef(nodes); nodesRef.current = nodes
  // Notes / callouts / revision notes: local state for smooth dragging and resizing.
  const [notes, setNotes] = useState<NoteNodeType[]>([])
  useEffect(() => {
    setNotes((prev) => {
      const byId = new Map(prev.map((n) => [n.id, n]))
      return (project.annotations ?? []).map((a) => {
        const id = `note:${a.id}`, old = byId.get(id)
        return { ...(old ?? {}), id, type: 'note' as const, position: { x: a.x, y: a.y }, width: a.w, height: a.h, zIndex: 5,
          hidden: !!page && a.page !== page, data: { a } }
      })
    })
  }, [project.annotations, page])
  const notesRef = useRef(notes); notesRef.current = notes
  const allNodes = useMemo<AnyNode[]>(() => [...frames, ...nodes, ...notes], [frames, nodes, notes])

  const cableSeverity = useMemo(() => {
    const m = new Map<string, 'error' | 'warning'>()
    for (const i of issues) if (i.subject.kind === 'cable' && i.severity !== 'info') {
      if (i.severity === 'error' || !m.has(i.subject.id)) m.set(i.subject.id, i.severity)
    }
    return m
  }, [issues])

  const wireMode = project.diagram?.wires ?? 'all'
  const autoTidy = !!project.diagram?.autoTidy
  // On a page, newly added devices join that page.
  const knownIds = useRef(new Set(project.equipment.map((e) => e.id as string)))
  useEffect(() => {
    const fresh = project.equipment.filter((e) => !knownIds.current.has(e.id) && !e.groupId).map((e) => e.id)
    knownIds.current = new Set(project.equipment.map((e) => e.id as string))
    if (page && fresh.length) useStore.getState().amend((d) => addToGroup(d, fresh, page))
  }, [project.equipment, page])

  // Auto-tidy: when devices or cables are added, re-arrange in the same undo step.
  const counts = useRef({ e: project.equipment.length, c: project.cables.length })
  useEffect(() => {
    const prev = counts.current
    counts.current = { e: project.equipment.length, c: project.cables.length }
    if (autoTidy && (project.equipment.length > prev.e || project.cables.length > prev.c)) tidyDiagram({ amend: true })
  }, [project.equipment.length, project.cables.length, autoTidy])

  const edges: CableEdgeType[] = useMemo(() => {
    const sel = new Set(selection)
    const lanes = new Map<string, number>()
    return project.cables.map((c) => {
      const from = resolve(project, c.from)
      const to = resolve(project, c.to)
      const d = from ? portDomain(from.port) : null
      const sev = cableSeverity.get(c.id)
      const color = sev === 'error' ? '#e03131' : d ? DOMAINS[d].color : '#888'
      const isSel = c.id === selectedCable
      // Wires touching a selected (or dragged) device draw above other devices.
      const lifted = isSel || sel.has(c.from.equipment) || sel.has(c.to.equipment)
      const pair = `${c.from.equipment}>${c.to.equipment}`
      const lane = lanes.get(pair) ?? 0
      lanes.set(pair, lane + 1)
      return {
        id: c.id, source: c.from.equipment, sourceHandle: c.from.port, target: c.to.equipment, targetHandle: c.to.port,
        type: 'cable' as const, selected: isSel, zIndex: lifted ? 1000 : 0,
        data: { label: c.label, color, dashed: sev === 'error', lane: lane + project.cables.indexOf(c), onSelect: () => select([], c.id),
          mode: wireMode, toText: to ? `${to.equipment.tag} · ${to.port.label}` : undefined, fromText: from ? `${from.equipment.tag} · ${from.port.label}` : undefined },
      }
    })
  }, [project, cableSeverity, selectedCable, selection, select, wireMode])

  useEffect(() => { if (fitRequest) void fitView({ padding: 0.15, duration: 250 }) }, [fitRequest, fitView])
  // Library ▸ Inventory → frame one device (after any page switch has rendered).
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; setTimeout(() => void fitView({ nodes: [{ id }], padding: 1.2, maxZoom: 1.2, duration: 300 }), 120) }
    window.addEventListener('diagram:locate', on)
    return () => window.removeEventListener('diagram:locate', on)
  }, [fitView])
  // Switching page frames what's on it.
  useEffect(() => { const t = setTimeout(() => void fitView({ padding: 0.15, duration: 250 }), 60); return () => clearTimeout(t) }, [page, fitView])

  const onNodesChange = useCallback((all: NodeChange<AnyNode>[]) => {
    // Dragging a group frame moves its members by the same amount.
    const moves = new Map<string, { dx: number; dy: number; dragging?: boolean }>()
    for (const c of all) {
      if (c.type !== 'position' || !c.id.startsWith('group:') || !c.position) continue
      const f = framesRef.current.find((x) => x.id === c.id)
      if (f) moves.set(c.id.slice(6), { dx: c.position.x - f.position.x, dy: c.position.y - f.position.y, dragging: c.dragging })
    }
    const noteChanges = all.filter((c) => 'id' in c && String(c.id).startsWith('note:')) as NodeChange<NoteNodeType>[]
    if (noteChanges.length) setNotes((ns) => applyNodeChanges(noteChanges.filter((c) => c.type !== 'remove'), ns))
    const changes = all.filter((c) => !('id' in c && (String(c.id).startsWith('group:') || String(c.id).startsWith('note:')))) as NodeChange<DeviceNodeType>[]
    setNodes((ns) => {
      let next = applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns)
      if (moves.size) next = next.map((n) => {
        const m = n.data.eq.groupId ? moves.get(n.data.eq.groupId) : undefined
        return m ? { ...n, position: { x: n.position.x + m.dx, y: n.position.y + m.dy } } : n
      })
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
    document.querySelectorAll('.page-tabs .drop').forEach((el) => el.classList.remove('drop'))
    if (tab && devs.length) {
      const target = tab.dataset.page || null
      const s = useStore.getState()
      // Undo the visual drag first (positions weren't committed), then move.
      s.set({ project: { ...s.project, equipment: [...s.project.equipment] } })
      if (target || s.project.equipment.some((e) => devs.includes(e.id) && e.groupId)) moveDevicesToPage(devs, target)
      return
    }
    const groupIds = new Set(draggedAll.filter((n) => n.type === 'groupFrame').map((n) => (n as GroupFrameType).data.id))
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
    const dragged = [
      ...draggedAll.filter((n): n is DeviceNodeType => n.type === 'device'),
      ...nodesRef.current.filter((n) => n.data.eq.groupId && groupIds.has(n.data.eq.groupId)),
    ]
    if (!dragged.length) return
    apply(groupIds.size ? 'Move Group' : dragged.length > 1 ? 'Move Devices' : 'Move Device', (d) => {
      for (const n of dragged) {
        const eq = d.equipment.find((e) => e.id === n.id)
        if (eq) eq.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
      }
    })
  }, [apply])

  const onDelete = useCallback(({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: { id: string }[] }) => {
    if (!ns.length && !es.length) return
    const ids = new Set(ns.map((n) => n.id))
    const cids = new Set(es.map((e) => e.id))
    apply('Delete', (d) => {
      if (d.annotations) d.annotations = d.annotations.filter((a) => !ids.has(`note:${a.id}`))
      d.equipment = d.equipment.filter((e) => !ids.has(e.id))
      d.patchBays = d.patchBays.filter((b) => !ids.has(b.equipment))
      d.cables = d.cables.filter((c) => !cids.has(c.id) && !ids.has(c.from.equipment) && !ids.has(c.to.equipment))
    })
    select([], null)
  }, [apply, select])

  // Live validation while wiring.
  const startWiring = useWiring((s) => s.start)
  const endWiring = useWiring((s) => s.end)
  const onConnectStart: OnConnectStart = useCallback((_, { nodeId, handleId }) => {
    if (!nodeId || !handleId) return
    const origin: PortAddress = { equipment: nodeId as EquipmentId, port: handleId }
    startWiring(origin, findCandidates(useStore.getState().project, origin))
  }, [startWiring])

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

  const onDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    e.preventDefault()
    const payload = JSON.parse(raw) as DragPayload
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const at = { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID }
    const s = useStore.getState()
    if (payload.kind === 'product') {
      const product = s.library.get(payload.key)
      if (!product) return
      let id: EquipmentId | undefined
      apply(`Add ${product.model}`, (d) => { id = addEquipment(d, product, at).id; placeInFreeSpace(d, id, nodeGeom) })
      if (id) select([id])
    } else if (payload.kind === 'patch') {
      const t = s.templates.find((x) => x.key === payload.key)
      if (!t) return
      let bay: { id: string; equipment: EquipmentId } | undefined
      apply('Add Patch Bay', (d) => { bay = addPatchBay(d, t, at); placeInFreeSpace(d, bay.equipment, nodeGeom) })
      if (bay) { select([bay.equipment]); s.set({ selectedBay: bay.id as never }) }
    }
  }, [apply, screenToFlowPosition, select])

  return (
    <div className="diagram-wrap">
    <PageTabs />
    <div className="diagram" onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }} onDrop={onDrop}>
      <ReactFlow<AnyNode, CableEdgeType>
        nodes={allNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeDrag={(ev) => {
          const pt = pointOf(ev)
          const over = document.elementsFromPoint(pt.x, pt.y).find((el) => el instanceof HTMLElement && el.dataset.page !== undefined)
          document.querySelectorAll('.page-tabs [data-page]').forEach((el) => el.classList.toggle('drop', el === over))
        }}
        onDelete={onDelete}
        onNodeDoubleClick={(ev, n) => {
          if (n.type === 'groupFrame') { select(project.equipment.filter((e) => e.groupId === (n as GroupFrameType).data.id).map((e) => e.id)); return }
          if ((ev.target as HTMLElement).closest('.react-flow__handle')) return
          select([n.id as EquipmentId]); editPlacedDevice(n.id)
        }}
        onNodeContextMenu={(ev, n) => {
          if (n.type !== 'device') return
          const cur = useStore.getState().selection
          const ids = cur.includes(n.id as EquipmentId) ? cur : [n.id as EquipmentId]
          if (ids !== cur) select(ids)
          showContextMenu(ev, [...deviceMenu(n.id), ...pageMenuItems(ids)])
        }}
        onConnectStart={onConnectStart}
        onConnectEnd={endWiring}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => { select([], null); useWiring.getState().clearPicks() }}
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
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={32} size={1.2} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--node-mini)" maskColor="var(--minimap-mask)" />
        <WiringHint />
        <PickedPanel />
        <DiagramTools />
        <GroupsPanel />
        {project.equipment.length === 0 && (
          <Panel position="top-center" className="hint-panel">
            Drag gear from the library to start. Drag from a port to wire it — only valid targets light up.
          </Panel>
        )}
      </ReactFlow>
    </div>
    </div>
  )
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
      {picked.length > 1 ? 'Drag from any of them to the first destination port. The rest land on the ports after it.' : 'Shift-click more ports to patch them together.'}
      <button className="mini" onClick={clear}>Clear (Esc)</button>
    </Panel>
  )
}

/** Top-right tools: Tidy Up, wire drawing mode, auto-tidy. */
function DiagramTools() {
  const settings = useStore((s) => s.project.diagram)
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
      text: kind === 'revision' ? (revs[revs.length - 1]?.description ?? '') : '', page: s.diagramPage ?? undefined,
      leader: kind === 'callout' ? { x: Math.round(c.x - 200), y: Math.round(c.y + 120) } : undefined,
      rev: kind === 'revision' ? (revs[revs.length - 1]?.rev ?? s.project.info.revision ?? 'A') : undefined,
    }
    s.apply(kind === 'callout' ? 'Add Callout' : kind === 'revision' ? 'Add Revision Note' : 'Add Note', (d) => { d.annotations = [...(d.annotations ?? []), a] })
    s.notify('Double-click the note to type · drag to move · drag its corners to resize' + (kind === 'callout' ? ' · drag the arrow’s dot to aim it' : ''), { kind: 'info' })
  }
  const set = (label: string, patch: Partial<NonNullable<typeof settings>>) => apply(label, (d) => { d.diagram = { ...(d.diagram ?? {}), ...patch } })
  const tidy = (sel: boolean) => {
    const n = tidyDiagram({ selectionOnly: sel })
    if (n) { notify(`Tidied ${n} device${n === 1 ? '' : 's'} by signal flow`, { undo: true, kind: 'success' }); setTimeout(() => void fitView({ padding: 0.12, duration: 300 }), 60) }
  }
  return (
    <Panel position="top-right" className="diagram-tools">
      <button className="primary" onClick={() => tidy(selection.length > 1)} title={selection.length > 1 ? 'Arrange the selected devices by signal flow (⌥⌘L)' : 'Arrange the whole diagram by signal flow: sources left, destinations right, groups kept together (⌥⌘L)'}>
        ✨ Tidy {selection.length > 1 ? 'Selection' : 'Up'}
      </button>
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
      <button onClick={() => setPrinting(true)} title="Print or export a CAD-style wiring drawing">Print…</button>
      {printing && createPortal(<SchematicPrintDialog onClose={() => setPrinting(false)} />, document.body)}
      <label className="check" title="Re-arrange automatically whenever you add a device or cable">
        <input type="checkbox" checked={!!settings?.autoTidy} onChange={(e) => { set('Auto-Tidy', { autoTidy: e.target.checked }); if (e.target.checked) tidyDiagram({ amend: true }) }} /> Auto-tidy
      </label>
    </Panel>
  )
}

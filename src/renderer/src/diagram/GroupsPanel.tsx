import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { autoGroupBySystem, createGroup, deleteView, duplicateView, layoutView, pageNumbers, GENERAL_PAGE, DOMAINS, groupColor, groupsOf, membersOf, moveToPage, nodeGeom, setInView, ungroup, removeViewConnections, viewMembers, viewsOf, type DeviceGroup, type SignalDomain } from '@core/index'
import { showContextMenu } from '../components/ContextMenu'
import { tidyDiagram } from './tidy'
import type { MenuItem } from '../components/ContextMenu'
import { useStore } from '../store'

/** Which group (if any) is spotlighted; everything else dims. */
export const useGroupFocus = create<{ focus: string | null; set: (id: string | null) => void }>((set) => ({ focus: null, set: (focus) => set({ focus }) }))

export const SYSTEM_OPTIONS: { value: DeviceGroup['system']; label: string }[] = [
  ...(Object.keys(DOMAINS) as SignalDomain[]).map((d) => ({ value: d, label: DOMAINS[d].name })),
  { value: 'custom', label: 'Custom colour' },
]

/** Makes a page from the current selection (⌘G) – shared by the panel, the inspector and the keyboard. */
export function groupSelection(name?: string, system?: DeviceGroup['system']) {
  const s = useStore.getState()
  const ids = s.selection
  if (ids.length < 1) { s.notify('Select the devices for the new page first (drag a box or ⌘-click).', { kind: 'info' }); return }
  let g: DeviceGroup | undefined
  s.apply('New Page', (d) => { g = createGroup(d, ids, { name: name ?? nextPageName(d.groups ?? []), system }) })
  if (g) s.notify(`Moved ${ids.length} device${ids.length === 1 ? '' : 's'} to page “${g.name}”`, { undo: true })
}

/** Moves devices to a page (null = off all pages); the block lands in open space there. */
export function moveDevicesToPage(ids: string[], pageId: string | null | 'new') {
  const s = useStore.getState()
  if (!ids.length) return
  let name = 'no page', target: string | null = null
  s.apply(pageId === null ? 'Remove from Page' : 'Move to Page', (d) => {
    if (pageId === 'new') { const g = createGroup(d, [], { name: nextPageName(d.groups ?? []) }); target = g.id; name = g.name }
    else { target = pageId; name = groupsOf(d).find((g) => g.id === pageId)?.name ?? name }
    moveToPage(d, ids, target, nodeGeom)
  })
  const st = useStore.getState()
  const cross = st.project.cables.filter((c) => (ids.includes(c.from.equipment) !== ids.includes(c.to.equipment))).length
  st.notify(`Moved ${ids.length} device${ids.length === 1 ? '' : 's'} to ${target ? `“${name}”` : 'no page'}${cross ? ` – ${cross} wire${cross === 1 ? '' : 's'} to other pages show as off-page flags` : ''}`, { undo: true, kind: 'success' })
  // Follow the devices if we're looking at a single page.
  if (st.diagramPage && st.diagramPage !== target) st.set({ diagramPage: target })
}

/** Signal-view items for a device's context menu on the normal diagram: "Add to View ▸ Audio". */
export function addToViewItems(ids: string[]): MenuItem[] {
  const s = useStore.getState()
  const views = viewsOf(s.project)
  if (!views.length) return []
  const n = ids.length > 1 ? ` (${ids.length})` : ''
  return ['sep', ...views.filter((v) => { const m = new Set(viewMembers(s.project, v).map((e) => e.id as string)); return ids.some((id) => !m.has(id)) })
    .map((v): MenuItem => ({ label: `Add${n} to View ▸ ${v.name}`, onClick: () => {
      s.apply('Add to View', (d) => setInView(d, v.id, ids, true))
      s.notify(`Added to “${v.name}”`, { undo: true, kind: 'success' })
    } }))]
}

/** Context menu items inside a signal view. */
export function viewMenuItems(ids: string[], viewId: string): MenuItem[] {
  const n = ids.length > 1 ? ` ${ids.length} Devices` : ''
  return ['sep',
    { label: `Remove${n} from This View`, hint: '⌫', onClick: () => { useStore.getState().apply('Remove from View', (d) => setInView(d, viewId, ids, false)) } },
    { label: `Delete${n} from Project`, hint: '⌘⌫', danger: true, onClick: () => {
      const set = new Set(ids)
      useStore.getState().apply('Delete', (d) => {
        d.equipment = d.equipment.filter((e) => !set.has(e.id))
        d.patchBays = d.patchBays.filter((b) => !set.has(b.equipment))
        d.cables = d.cables.filter((c) => !set.has(c.from.equipment) && !set.has(c.to.equipment))
      })
      useStore.getState().select([], null)
      useStore.getState().notify(`Deleted ${ids.length} device${ids.length === 1 ? '' : 's'} from the project`, { undo: true })
    } },
    { label: 'Show on Main Diagram', onClick: () => { useStore.getState().set({ diagramView: null, diagramPage: null }); setTimeout(() => window.dispatchEvent(new CustomEvent('diagram:locate', { detail: ids[0] })), 50) } },
  ]
}

export const openView = (id: string | null) => useStore.getState().set({ diagramView: id, diagramPage: null, selection: [], selectedCable: null })

/** "Move to Page" items for a device context menu. */
export function pageMenuItems(ids: string[]): MenuItem[] {
  const s = useStore.getState()
  const pages = groupsOf(s.project)
  const current = new Set(s.project.equipment.filter((e) => ids.includes(e.id)).map((e) => e.groupId ?? null))
  const n = ids.length > 1 ? ` (${ids.length})` : ''
  return [
    'sep',
    ...pages.filter((g) => !(current.size === 1 && current.has(g.id))).map((g): MenuItem => ({ label: `Move${n} to Page ▸ ${g.name}`, onClick: () => moveDevicesToPage(ids, g.id) })),
    { label: `Move${n} to New Page`, onClick: () => moveDevicesToPage(ids, 'new') },
    ...(pages.length && [...current].some(Boolean) ? [{ label: `Remove${n} from Page`, onClick: () => moveDevicesToPage(ids, null) } as MenuItem] : []),
  ]
}

const nextPageName = (gs: DeviceGroup[]) => { let n = gs.length + 1; while (gs.some((g) => g.name === `Page ${n}`)) n++; return `Page ${n}` }

const newPage = () => {
  const s = useStore.getState()
  if (s.selection.length) { groupSelection(); return }
  let g: DeviceGroup | undefined
  s.apply('New Page', (d) => {
    // The first page takes everything that's already drawn, so nothing goes missing.
    const first = !(d.groups ?? []).length && d.equipment.length
    g = createGroup(d, [], { name: first ? 'Page 1' : nextPageName(d.groups ?? []) })
    if (first) { for (const e of d.equipment) e.groupId = g.id; g = createGroup(d, [], { name: 'Page 2' }) }
  })
  if (g) { s.set({ mode: 'diagram', diagramPage: g!.id, diagramView: null }); s.notify(`New page “${g!.name}” – anything you add now goes on it`, { kind: 'success' }) }
}
export const newPageCmd = newPage

export function pagesBySystem() {
  const s = useStore.getState()
  let n = 0
  s.apply('Pages by System', (d) => { n = autoGroupBySystem(d) })
  s.notify(n ? `Put ${n} device${n === 1 ? '' : 's'} on Audio / Video / Lighting… pages` : 'Every device is already on a page.', { undo: !!n, kind: n ? 'success' : 'info' })
}

/** ⌘G new page from selection, ⇧⌘G delete the selected devices' pages. */
export function usePageShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'g') return
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return
      e.preventDefault()
      const s = useStore.getState()
      if (e.shiftKey) {
        const gids = new Set(s.project.equipment.filter((x) => s.selection.includes(x.id) && x.groupId).map((x) => x.groupId!))
        if (!gids.size) return
        s.apply('Remove from Page', (d) => { for (const id of gids) ungroup(d, id) })
        s.notify(`Deleted ${gids.size} page${gids.size === 1 ? '' : 's'}`, { undo: true })
      } else groupSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function viewMenu(v: { id: string; name: string }): MenuItem[] {
  const set = useStore.getState().set
  const st = useStore.getState()
  const view = viewsOf(st.project).find((x) => x.id === v.id)
  const have = new Set(view ? viewMembers(st.project, view).map((e) => e.id as string) : [])
  const add = st.selection.filter((id) => !have.has(id))
  return [
    { label: 'Edit View…', onClick: () => set({ editingView: v.id }) },
    ...(add.length ? [{ label: `Add ${add.length} Selected Device${add.length === 1 ? '' : 's'} to “${v.name}”`, onClick: () => {
      st.apply('Add to View', (d) => { setInView(d, v.id, add, true); layoutView(d, v.id, nodeGeom, { onlyNew: true }) })
      st.notify(`Added ${add.length} device${add.length === 1 ? '' : 's'} to “${v.name}”`, { undo: true, kind: 'success' })
    } } as MenuItem] : []),
    { label: 'Duplicate View…', onClick: () => {
      let copy = ''
      useStore.getState().apply('Duplicate View', (d) => { copy = duplicateView(d, v.id)?.id ?? '' })
      if (!copy) return
      openView(copy)
      set({ editingView: copy, copiedView: copy })
    } },
    { label: 'Tidy This View', onClick: () => { openView(v.id); tidyDiagram() } },
    'sep',
    { label: 'Remove All Connections in This View…', danger: true, onClick: () => clearViewWires(v.id) },
    { label: 'Delete View', danger: true, onClick: () => { useStore.getState().apply('Delete View', (d) => deleteView(d, v.id)); useStore.getState().notify(`Deleted view “${v.name}” – the devices are still on the diagram`, { undo: true }) } },
  ]
}

/**
 * Pages & Views – the sidebar's own section on the Wiring Diagram. Click to show a
 * page, drop devices on it to move them, double-click to rename, right-click for more.
 */
export function PagesNav() {
  const project = useStore((s) => s.project)
  const page = useStore((s) => s.diagramPage)
  const viewId = useStore((s) => s.diagramView)
  const set = useStore((s) => s.set)
  const apply = useStore((s) => s.apply)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('rackflow.pagesOpen') !== 'off' } catch { return true } })
  const toggle = () => { const v = !open; setOpen(v); try { localStorage.setItem('rackflow.pagesOpen', v ? 'on' : 'off') } catch { /* ignore */ } }
  const list = project.groups ?? []
  const views = project.views ?? []
  const nums = pageNumbers(project)
  useEffect(() => { if (viewId && !views.some((v) => v.id === viewId)) set({ diagramView: null }) }, [views, viewId, set])
  useEffect(() => { if (page && !list.some((g) => g.id === page)) set({ diagramPage: null }) }, [list, page, set])
  const count = (id: string | null) => project.equipment.filter((e) => (id ? e.groupId === id : true)).length
  const show = (id: string | null) => set({ mode: 'diagram', diagramPage: id, diagramView: null })

  const pageMenu = (e: React.MouseEvent, g: DeviceGroup) => showContextMenu(e, [
    { label: 'Show This Page', onClick: () => show(g.id) },
    { label: 'Rename…', onClick: () => setRenaming(g.id) },
    'sep',
    ...SYSTEM_OPTIONS.filter((o) => o.value !== 'custom').map((o): MenuItem => ({ label: `${g.system === o.value ? '✓ ' : ''}Colour ▸ ${o.label}`, onClick: () => apply('Change Group System', (d) => { const x = d.groups?.find((y) => y.id === g.id); if (x) x.system = o.value }) })),
    'sep',
    { label: 'Sheet Numbers…', onClick: () => set({ editingNumbers: true }) },
    { label: 'Delete Page', danger: true, onClick: () => { apply('Delete Page', (d) => ungroup(d, g.id)); useStore.getState().notify(`Deleted page “${g.name}” – its devices are still on the diagram`, { undo: true }) } },
  ])
  const rename = (g: DeviceGroup) => (
    <input className="pn-rename" autoFocus defaultValue={g.name} onClick={(e) => e.stopPropagation()}
      onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== g.name) apply('Rename Page', (d) => { const x = d.groups?.find((y) => y.id === g.id); if (x) x.name = v }) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} />
  )

  const chev = <svg className="pn-chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return (
    <section className={`sb-section pages-nav ${open ? '' : 'closed'}`}>
      <div className="sb-section-head">
        <button className="pn-title" onClick={toggle} aria-expanded={open}>Pages {chev}</button>
        <button className="pn-add" onClick={(e) => showContextMenu(e, [
          { label: 'New Page', hint: '⌘G with a selection', onClick: newPage },
          { label: 'New Signal View…', onClick: () => set({ mode: 'diagram', editingView: 'new' }) },
          'sep',
          { label: 'Pages by System', onClick: pagesBySystem },
          { label: 'Sheet Numbers…', onClick: () => set({ editingNumbers: true }) },
        ])} title="New page, signal view, sheet numbers"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
      </div>
      {open && <div className="pn-list">
        <button data-page="" className={`pn-row ${page === null && !viewId ? 'on' : ''}`} onClick={() => show(null)} title="Every page together">
          <span className="pn-ico"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="4.5" y="1.5" width="9" height="11" rx="1.5" /><path d="M2.5 4v9a1.5 1.5 0 001.5 1.5h7" /></svg></span>
          <span className="pn-name">All Pages</span>{!list.length && nums.get(GENERAL_PAGE) && <b className="pn-num">{nums.get(GENERAL_PAGE)}</b>}<span className="pn-n">{count(null)}</span>
        </button>
        {list.map((g) => (
          <button key={g.id} data-page={g.id} className={`pn-row ${page === g.id && !viewId ? 'on' : ''}`} onClick={() => show(g.id)}
            onDoubleClick={() => setRenaming(g.id)} onContextMenu={(e) => pageMenu(e, g)} title={`Show only “${g.name}”. Drop devices here to move them to this page. Double-click to rename.`}>
            <span className="pn-ico"><i className="pn-sw" style={{ background: groupColor(g) }} /></span>
            {renaming === g.id ? rename(g) : <span className="pn-name">{g.name}</span>}
            {nums.get(g.id) && <b className="pn-num">{nums.get(g.id)}</b>}<span className="pn-n">{count(g.id)}</span>
          </button>
        ))}
        {views.length > 0 && <div className="pn-gap" />}
        {views.map((v) => (
          <button key={v.id} className={`pn-row view ${viewId === v.id ? 'on' : ''}`} onClick={() => { set({ mode: 'diagram' }); openView(v.id) }}
            onDoubleClick={() => set({ editingView: v.id })} onContextMenu={(e) => showContextMenu(e, viewMenu(v))}
            title={`Signal view: only ${v.domains.map((d) => DOMAINS[d].name).join(', ')} ports. Double-click to edit.`}>
            <span className="pn-doms">{v.domains.slice(0, 3).map((d) => <i key={d} style={{ background: DOMAINS[d].color }} />)}</span>
            <span className="pn-name">{v.name}</span>{nums.get(v.id) && <b className="pn-num">{nums.get(v.id)}</b>}<span className="pn-n">{viewMembers(project, v).length}</span>
          </button>
        ))}
        <button className="pn-row ghost" onClick={newPage} title="New page (from the selected devices, or empty)">
          <span className="pn-ico"><svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span><span className="pn-name">Add Page</span>
        </button>
      </div>}
    </section>
  )
}

/** Deletes the cables on a view (only the ones drawn there), with Undo. */
export function clearViewWires(viewId: string) {
  const s = useStore.getState()
  const v = viewsOf(s.project).find((x) => x.id === viewId)
  if (!v) return
  let n = 0
  s.apply('Remove View Connections', (d) => { n = removeViewConnections(d, viewId) })
  s.notify(n ? `Removed ${n} connection${n === 1 ? '' : 's'} from “${v.name}” – other cables are untouched` : `“${v.name}” has no connections`, { undo: n > 0, kind: n ? 'success' : 'info' })
}

import { useEffect, useState } from 'react'
import { Panel } from '@xyflow/react'
import { create } from 'zustand'
import { autoGroupBySystem, createGroup, DOMAINS, groupColor, groupsOf, membersOf, ungroup, type DeviceGroup, type SignalDomain } from '@core/index'
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

const nextPageName = (gs: DeviceGroup[]) => { let n = gs.length + 1; while (gs.some((g) => g.name === `Page ${n}`)) n++; return `Page ${n}` }

/** Top tab bar: All pages · each page · + New Page. Anything in a page group is its own page. */
export function PageTabs() {
  const groups = useStore((s) => s.project.groups)
  const page = useStore((s) => s.diagramPage)
  const counts = useStore((s) => s.project.equipment)
  const set = useStore((s) => s.set)
  const list = groups ?? []
  useEffect(() => { if (page && !list.some((g) => g.id === page)) set({ diagramPage: null }) }, [list, page, set])
  const n = (id: string | null) => counts.filter((e) => (id ? e.groupId === id : true)).length
  const unassigned = counts.filter((e) => !e.groupId || !list.some((g) => g.id === e.groupId)).length
  return (
    <div className="page-tabs" role="tablist">
      <button className={page === null ? 'on' : ''} onClick={() => set({ diagramPage: null })} title="Show every page together">All pages <span>{n(null)}</span></button>
      {list.map((g) => (
        <button key={g.id} className={page === g.id ? 'on' : ''} onClick={() => set({ diagramPage: g.id })} title={`Show only “${g.name}”. Wires to other pages show as labelled flags.`}>
          <i style={{ background: groupColor(g) }} />{g.name} <span>{n(g.id)}</span>
        </button>
      ))}
      {list.length > 0 && unassigned > 0 && <span className="muted small pt-hint">{unassigned} not on a page</span>}
      <button className="pt-add" onClick={() => {
        const s = useStore.getState()
        if (s.selection.length) { groupSelection(); return }
        let g: DeviceGroup | undefined
        s.apply('New Page', (d) => { g = createGroup(d, [], { name: nextPageName(d.groups ?? []) }) })
        if (g) { s.set({ diagramPage: g!.id }); s.notify(`New page “${g!.name}” – anything you add now goes on it`, { kind: 'success' }) }
      }} title="New page (from the selected devices, or empty)">＋ Page</button>
    </div>
  )
}

/** Top-left diagram panel: every group with its colour, spotlight, rename, ungroup; group / auto-group buttons. */
export function GroupsPanel() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const apply = useStore((s) => s.apply)
  const focus = useGroupFocus((s) => s.focus)
  const setFocus = useGroupFocus((s) => s.set)
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const groups = groupsOf(project)

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
  useEffect(() => { if (focus && !groups.some((g) => g.id === focus)) setFocus(null) }, [groups, focus, setFocus])

  if (!project.equipment.length) return null
  return (
    <Panel position="top-left" className={`groups-panel ${open ? '' : 'closed'}`}>
      <div className="gp-head" onClick={() => setOpen(!open)}>
        <span>Pages</span>{groups.length > 0 && <span className="gp-n">{groups.length}</span>}<span className="gp-caret">{open ? '▾' : '▸'}</span>
      </div>
      {open && <>
        {groups.length === 0 && <p className="gp-empty">Put devices on pages (e.g. Audio, Video, Stage). Each page is its own tab and prints as its own sheet, named after the page.</p>}
        <ul className="gp-list">
          {groups.map((g) => {
            const n = membersOf(project, g.id).length
            return (
              <li key={g.id} className={focus === g.id ? 'on' : ''}>
                <label className="gp-swatch" style={{ background: groupColor(g) }} title="Change system / colour">
                  <select value={g.system} onChange={(e) => { const v = e.target.value as DeviceGroup['system']; apply('Change Group System', (d) => { const x = d.groups?.find((y) => y.id === g.id); if (x) { x.system = v; if (v === 'custom' && !x.color) x.color = '#868e96' } }) }}>
                    {SYSTEM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                {g.system === 'custom' && <input type="color" className="gp-color" value={g.color ?? '#868e96'} onChange={(e) => { const v = e.target.value; apply('Group Colour', (d) => { const x = d.groups?.find((y) => y.id === g.id); if (x) x.color = v }) }} />}
                {renaming === g.id ? (
                  <input className="gp-rename" autoFocus defaultValue={g.name}
                    onBlur={(e) => { const v = e.target.value.trim(); setRenaming(null); if (v && v !== g.name) apply('Rename Group', (d) => { const x = d.groups?.find((y) => y.id === g.id); if (x) x.name = v }) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} />
                ) : (
                  <button className="gp-name" title="Click to show this page · double-click to rename"
                    onClick={() => useStore.getState().set({ diagramPage: g.id })}
                    onDoubleClick={() => setRenaming(g.id)}>{g.name}</button>
                )}
                <span className="gp-count">{n}</span>
                <button className={`gp-icon ${useStore.getState().diagramPage === g.id ? 'on' : ''}`} title="Show only this page" onClick={() => useStore.getState().set({ diagramPage: g.id })}>▤</button>
                <button className="gp-icon" title="Delete page (its devices stay on the diagram, unassigned)" onClick={() => { apply('Delete Page', (d) => ungroup(d, g.id)); useStore.getState().notify(`Deleted page “${g.name}” – its devices are still on the diagram`, { undo: true }) }}>×</button>
              </li>
            )
          })}
        </ul>
        <div className="gp-actions">
          <button disabled={!selection.length} onClick={() => groupSelection()} title="Move the selected devices to a new page (⌘G)">New page from selection{selection.length ? ` (${selection.length})` : ''}</button>
          <button onClick={() => {
            let n = 0
            apply('Pages by System', (d) => { n = autoGroupBySystem(d) })
            useStore.getState().notify(n ? `Put ${n} device${n === 1 ? '' : 's'} on Audio / Video / Lighting… pages` : 'Every device is already on a page.', { undo: !!n, kind: n ? 'success' : 'info' })
          }} title="Put every device that isn't on a page onto Audio, Video, Lighting… pages by what it mostly carries">Pages by system</button>
        </div>
      </>}
    </Panel>
  )
}

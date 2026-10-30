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

/** Groups the current selection (⌘G) – shared by the panel, the inspector and the keyboard. */
export function groupSelection(name?: string, system?: DeviceGroup['system']) {
  const s = useStore.getState()
  const ids = s.selection
  if (ids.length < 1) { s.notify('Select the devices to group first (drag a box or ⌘-click).', { kind: 'info' }); return }
  let g: DeviceGroup | undefined
  s.apply('Group Devices', (d) => { g = createGroup(d, ids, { name, system }) })
  if (g) s.notify(`Grouped ${ids.length} device${ids.length === 1 ? '' : 's'} as “${g.name}”`, { undo: true })
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
        s.apply('Ungroup', (d) => { for (const id of gids) ungroup(d, id) })
        s.notify(`Ungrouped ${gids.size} group${gids.size === 1 ? '' : 's'}`, { undo: true })
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
        <span>Groups</span>{groups.length > 0 && <span className="gp-n">{groups.length}</span>}<span className="gp-caret">{open ? '▾' : '▸'}</span>
      </div>
      {open && <>
        {groups.length === 0 && <p className="gp-empty">Group devices by system (Audio, Video, Lighting…) to colour-code and move them together.</p>}
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
                  <button className="gp-name" title="Click to select its devices · double-click to rename"
                    onClick={() => useStore.getState().select(membersOf(project, g.id).map((e) => e.id))}
                    onDoubleClick={() => setRenaming(g.id)}>{g.name}</button>
                )}
                <span className="gp-count">{n}</span>
                <button className={`gp-icon ${focus === g.id ? 'on' : ''}`} title={focus === g.id ? 'Show everything' : 'Spotlight this group (dim the rest)'} onClick={() => setFocus(focus === g.id ? null : g.id)}>◉</button>
                <button className="gp-icon" title="Ungroup" onClick={() => { apply('Ungroup', (d) => ungroup(d, g.id)); useStore.getState().notify(`Ungrouped “${g.name}”`, { undo: true }) }}>×</button>
              </li>
            )
          })}
        </ul>
        <div className="gp-actions">
          <button disabled={!selection.length} onClick={() => groupSelection()} title="Group the selected devices (⌘G)">Group selected{selection.length ? ` (${selection.length})` : ''}</button>
          <button onClick={() => {
            let n = 0
            apply('Auto-group by System', (d) => { n = autoGroupBySystem(d) })
            useStore.getState().notify(n ? `Grouped ${n} device${n === 1 ? '' : 's'} by system` : 'Every device is already in a group.', { undo: !!n, kind: n ? 'success' : 'info' })
          }} title="Put every ungrouped device into Audio, Video, Lighting… by what it mostly carries">Auto-group by system</button>
        </div>
      </>}
    </Panel>
  )
}

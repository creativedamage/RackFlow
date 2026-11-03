import { useEffect } from 'react'
import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { notes as fetchNotes, onAuth, pushProject, session as getSession, watchProject, type CloudNote } from '../cloud'
import { useStore } from '../store'

interface CloudState {
  session: Session | null
  status: 'off' | 'syncing' | 'live' | 'error' | 'other-owner'
  error: string
  lastSync: number
  notes: CloudNote[]
  open: boolean
  tab: 'share' | 'notes'
  set: (p: Partial<CloudState>) => void
}
export const useCloud = create<CloudState>((set) => ({ session: null, status: 'off', error: '', lastSync: 0, notes: [], open: false, tab: 'share', set }))

/**
 * Keeps a shared project's cloud copy in step with the file: every change is
 * pushed (debounced) so viewers see it live, and viewers' notes stream in.
 */
export function useCloudSync() {
  const cloudId = useStore((s) => s.project.cloud?.id)
  const owner = useStore((s) => s.project.cloud?.owner)
  const sess = useCloud((s) => s.session)
  useEffect(() => {
    void getSession().then((s) => useCloud.getState().set({ session: s }))
    return onAuth((s) => useCloud.getState().set({ session: s }))
  }, [])
  useEffect(() => {
    const c = useCloud.getState()
    if (!cloudId) { c.set({ status: 'off', notes: [] }); return }
    if (!sess) { c.set({ status: 'off' }); return }
    if (sess.user.id !== owner) { c.set({ status: 'other-owner' }); return }
    let timer: ReturnType<typeof setTimeout> | null = null, alive = true, last = useStore.getState().project
    const push = async () => {
      if (!alive) return
      c.set({ status: 'syncing' })
      try { await pushProject(cloudId, useStore.getState().project); if (alive) useCloud.getState().set({ status: 'live', error: '', lastSync: Date.now() }) }
      catch (e) { if (alive) useCloud.getState().set({ status: 'error', error: String((e as Error).message ?? e) }) }
    }
    void push()
    const unsub = useStore.subscribe((s) => {
      if (s.project === last) return
      last = s.project
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void push(), 1200)
    })
    void fetchNotes(cloudId).then((n) => { if (alive) useCloud.getState().set({ notes: n }) }).catch(() => {})
    const unwatch = watchProject(cloudId, {
      note: (kind, n) => {
        const cur = useCloud.getState().notes
        const next = kind === 'DELETE' ? cur.filter((x) => x.id !== n.id) : [...cur.filter((x) => x.id !== n.id), n].sort((a, b) => a.created_at.localeCompare(b.created_at))
        useCloud.getState().set({ notes: next })
        if (kind === 'INSERT' && n.author !== sess.user.id) useStore.getState().notify(`New note from ${n.author_email} on ${n.sheet_title || 'the drawings'}`, { kind: 'info' })
      },
    })
    return () => { alive = false; if (timer) clearTimeout(timer); unsub(); unwatch() }
  }, [cloudId, owner, sess])
}

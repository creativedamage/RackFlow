// RackFlow Cloud: sharing projects with viewers (Supabase). Shared by the
// desktop app (owner: publish, sync, manage viewers, read notes) and the web
// viewer (viewer: sign in, open shared projects, add notes). Everything here
// is guarded by row-level security in the database: viewers can only read
// projects shared with their confirmed email, and only add / edit their own notes.

import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Project } from '@core/index'

export const CLOUD_URL = 'https://lsqibvlbqakdjaoirvyh.supabase.co'
/** Publishable (public) key – safe in the app; access is enforced by row-level security. */
export const CLOUD_KEY = 'sb_publishable_Imz5QD72-_9MskBJWIhO1g_K53ekKxl'

let client: SupabaseClient | null = null
export function cloud(): SupabaseClient {
  client ??= createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rackflow.cloud.session' } })
  return client
}

export interface CloudProject { id: string; owner: string; owner_email: string; name: string; revision: number; updated_at: string }
export interface CloudShare { project_id: string; email: string; created_at: string }
export interface CloudNote {
  id: string; project_id: string; author: string; author_email: string
  sheet: string; sheet_title: string; x: number; y: number; body: string; resolved: boolean
  created_at: string; updated_at: string
}

// MARK: Auth

export async function session(): Promise<Session | null> { return (await cloud().auth.getSession()).data.session }
export function onAuth(fn: (s: Session | null) => void) {
  const { data } = cloud().auth.onAuthStateChange((_e, s) => fn(s))
  return () => data.subscription.unsubscribe()
}
export async function signIn(email: string, password: string) {
  const { data, error } = await cloud().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw new Error(friendly(error.message))
  return data.session
}
/** Creates an account; Supabase emails a confirmation link (the account works once it's confirmed). */
export async function signUp(email: string, password: string, redirectTo?: string) {
  const { data, error } = await cloud().auth.signUp({ email: email.trim().toLowerCase(), password, options: redirectTo ? { emailRedirectTo: redirectTo } : undefined })
  if (error) throw new Error(friendly(error.message))
  return { session: data.session, needsConfirm: !data.session }
}
export async function resetPassword(email: string, redirectTo?: string) {
  const { error } = await cloud().auth.resetPasswordForEmail(email.trim().toLowerCase(), redirectTo ? { redirectTo } : undefined)
  if (error) throw new Error(friendly(error.message))
}
export async function setPassword(password: string) {
  const { error } = await cloud().auth.updateUser({ password })
  if (error) throw new Error(friendly(error.message))
}
export async function signOut() { await cloud().auth.signOut() }

const friendly = (m: string) =>
  /invalid login/i.test(m) ? 'Wrong email or password.'
  : /email not confirmed/i.test(m) ? 'Confirm your email first – open the link we sent you, then sign in.'
  : /already registered/i.test(m) ? 'That email already has an account – sign in instead.'
  : /password should be/i.test(m) ? 'Use a password of at least 6 characters.'
  : m

// MARK: Projects (owner)

/** Starts sharing a project: creates the cloud copy and returns its id. */
export async function publish(p: Project): Promise<CloudProject> {
  const db = cloud()
  const { data, error } = await db.from('projects').insert({ name: p.info.name || 'Untitled Project' }).select().single()
  if (error) throw new Error(error.message)
  const row = data as CloudProject
  const { error: e2 } = await db.from('project_data').insert({ project_id: row.id, data: { ...p, cloud: { id: row.id, owner: row.owner } } })
  if (e2) throw new Error(e2.message)
  return row
}

/** Pushes the latest project to its cloud copy; viewers get it live. */
export async function pushProject(id: string, p: Project) {
  const db = cloud()
  const { error } = await db.from('project_data').update({ data: p, updated_at: new Date().toISOString() }).eq('project_id', id)
  if (error) throw new Error(error.message)
  const { data: cur } = await db.from('projects').select('revision').eq('id', id).single()
  const { error: e2 } = await db.from('projects').update({ name: p.info.name || 'Untitled Project', revision: ((cur as { revision?: number } | null)?.revision ?? 0) + 1 }).eq('id', id)
  if (e2) throw new Error(e2.message)
}

export async function stopSharing(id: string) {
  const { error } = await cloud().from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function shares(id: string): Promise<CloudShare[]> {
  const { data, error } = await cloud().from('project_shares').select('*').eq('project_id', id).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as CloudShare[]
}
export async function addShare(id: string, email: string) {
  const e = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That doesn’t look like an email address.')
  const { error } = await cloud().from('project_shares').insert({ project_id: id, email: e })
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message)
}
export async function removeShare(id: string, email: string) {
  const { error } = await cloud().from('project_shares').delete().eq('project_id', id).eq('email', email)
  if (error) throw new Error(error.message)
}

// MARK: Projects (viewer)

/** Every project the signed-in person can open: their own and the ones shared with them. */
export async function myProjects(): Promise<CloudProject[]> {
  const { data, error } = await cloud().from('projects').select('*').order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CloudProject[]
}
export async function loadProject(id: string): Promise<{ meta: CloudProject; project: Project }> {
  const db = cloud()
  const [{ data: meta, error: e1 }, { data, error: e2 }] = await Promise.all([
    db.from('projects').select('*').eq('id', id).single(),
    db.from('project_data').select('data').eq('project_id', id).single(),
  ])
  if (e1 || e2) throw new Error((e1 ?? e2)!.message)
  return { meta: meta as CloudProject, project: (data as { data: Project }).data }
}

// MARK: Notes

export async function notes(projectId: string): Promise<CloudNote[]> {
  const { data, error } = await cloud().from('notes').select('*').eq('project_id', projectId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as CloudNote[]
}
export async function addNote(n: Pick<CloudNote, 'project_id' | 'sheet' | 'sheet_title' | 'x' | 'y' | 'body'>) {
  const { data, error } = await cloud().from('notes').insert(n).select().single()
  if (error) throw new Error(error.message)
  return data as CloudNote
}
export async function updateNote(id: string, patch: Partial<Pick<CloudNote, 'body' | 'resolved' | 'x' | 'y'>>) {
  const { error } = await cloud().from('notes').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteNote(id: string) {
  const { error } = await cloud().from('notes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// MARK: Live updates

/**
 * Live changes for one project: the project was updated (new revision), or a
 * note was added / changed / removed. Returns an unsubscribe function.
 */
export function watchProject(projectId: string, on: { revision?: (rev: number) => void; note?: (kind: 'INSERT' | 'UPDATE' | 'DELETE', note: CloudNote) => void; gone?: () => void }) {
  const ch: RealtimeChannel = cloud().channel(`rf:${projectId}:${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` }, (m) => {
      if (m.eventType === 'DELETE') on.gone?.()
      else on.revision?.((m.new as CloudProject).revision)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `project_id=eq.${projectId}` }, (m) => {
      on.note?.(m.eventType as 'INSERT' | 'UPDATE' | 'DELETE', (m.eventType === 'DELETE' ? m.old : m.new) as CloudNote)
    })
    .subscribe()
  return () => { void cloud().removeChannel(ch) }
}

/** Live changes to which projects are shared with me (for the viewer's project list). */
export function watchMyProjects(on: () => void) {
  const ch = cloud().channel(`rf:mine:${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => on())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_shares' }, () => on())
    .subscribe()
  return () => { void cloud().removeChannel(ch) }
}

/** Where people open shared projects (set once in Share… after the viewer is hosted). */
export const viewerUrl = () => { try { return localStorage.getItem('rackflow.viewerUrl') ?? '' } catch { return '' } }
export const setViewerUrl = (u: string) => { try { localStorage.setItem('rackflow.viewerUrl', u.trim()) } catch { /* private mode */ } }

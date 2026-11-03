import { useEffect, useState } from 'react'
import { addShare, deleteNote, publish, removeShare, resetPassword, setViewerUrl, shares as fetchShares, signIn, signOut, signUp, stopSharing, updateNote, viewerUrl, type CloudShare } from '../cloud'
import { useStore } from '../store'
import { Modal } from '../components/ui'
import { useCloud } from './cloudState'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Share…: sign in, publish the project for viewers, manage who can see it, and read their notes. */
export function ShareDialog() {
  const { session, status, error, lastSync, notes, tab, set } = useCloud()
  const close = () => set({ open: false })
  return (
    <Modal title="Share" onClose={close}>
      <div className="share">
        {!session ? <SignIn /> : <>
          <div className="share-tabs segmented-lite">
            <button className={tab === 'share' ? 'on' : ''} onClick={() => set({ tab: 'share' })}>Viewers</button>
            <button className={tab === 'notes' ? 'on' : ''} onClick={() => set({ tab: 'notes' })}>Notes{notes.filter((n) => !n.resolved).length ? ` (${notes.filter((n) => !n.resolved).length})` : ''}</button>
            <span className="spacer" />
            <span className="muted small">Signed in as {session.user.email}</span>
            <button className="link" onClick={() => void signOut()}>Sign out</button>
          </div>
          {tab === 'share' ? <Viewers status={status} error={error} lastSync={lastSync} /> : <Notes />}
        </>}
      </div>
    </Modal>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = async (kind: 'in' | 'up' | 'reset') => {
    setBusy(true); setMsg('')
    try {
      if (kind === 'in') await signIn(email, pw)
      else if (kind === 'up') { const r = await signUp(email, pw, viewerUrl() || undefined); if (r.needsConfirm) setMsg('Check your email and click the confirmation link, then sign in here.') }
      else { await resetPassword(email, viewerUrl() || undefined); setMsg('Password reset email sent.') }
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="share-signin" onSubmit={(e) => { e.preventDefault(); void go('in') }}>
      <h3>Share projects with viewers</h3>
      <p className="muted small">Sign in to RackFlow Cloud to share this project. The people you add open it in their web browser – they can look at every drawing and leave notes, but can’t change anything. Your edits reach them live.</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" /></label>
      <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
      {msg && <p className="share-msg">{msg}</p>}
      <div className="share-actions">
        <button className="link" type="button" disabled={!email || busy} onClick={() => void go('reset')}>Forgot password?</button>
        <span className="spacer" />
        <button type="button" disabled={!email || pw.length < 6 || busy} onClick={() => void go('up')}>Create Account</button>
        <button className="primary" type="submit" disabled={!email || !pw || busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
      </div>
    </form>
  )
}

function Viewers({ status, error, lastSync }: { status: string; error: string; lastSync: number }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const notify = useStore((s) => s.notify)
  const id = project.cloud?.id
  const [list, setList] = useState<CloudShare[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState(viewerUrl())
  const refresh = () => { if (id) void fetchShares(id).then(setList).catch((e) => notify((e as Error).message, { kind: 'error' })) }
  useEffect(refresh, [id])

  const start = async () => {
    setBusy(true)
    try {
      const row = await publish(project)
      apply('Share Project', (d) => { d.cloud = { id: row.id, owner: row.owner } })
      notify('Shared – add the people who should see it', { kind: 'success' })
    } catch (e) { notify((e as Error).message, { kind: 'error' }) } finally { setBusy(false) }
  }
  const stop = async () => {
    if (!id || !confirm('Stop sharing this project? Viewers lose access and their notes are deleted.')) return
    try { await stopSharing(id); apply('Stop Sharing', (d) => { delete d.cloud }); notify('No longer shared') } catch (e) { notify((e as Error).message, { kind: 'error' }) }
  }
  const add = async () => {
    if (!id) return
    try { await addShare(id, email); setEmail(''); refresh() } catch (e) { notify((e as Error).message, { kind: 'error' }) }
  }
  const link = id && url ? `${url.replace(/\/+$/, '')}/#/p/${id}` : ''

  if (status === 'other-owner') return <p className="muted">This file is shared from another RackFlow account. Sign in as its owner to manage viewers.</p>
  if (!id) return (
    <div className="share-start">
      <h3>{project.info.name || 'Untitled Project'}</h3>
      <p className="muted small">Not shared yet. Sharing puts a live, view-only copy of this project online. Every change you make here (auto-saved) shows up for viewers within a couple of seconds.</p>
      <button className="primary" disabled={busy} onClick={() => void start()}>{busy ? 'Sharing…' : 'Start Sharing'}</button>
    </div>
  )
  return (
    <div className="share-live">
      <div className="share-status">
        <span className={`share-dot ${status}`} />
        <b>{status === 'syncing' ? 'Syncing…' : status === 'error' ? 'Not synced' : 'Live'}</b>
        <span className="muted small">{status === 'error' ? error : lastSync ? `Viewers have your latest changes (${new Date(lastSync).toLocaleTimeString()})` : ''}</span>
      </div>
      <h4>People who can view</h4>
      <form className="share-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary" disabled={!email.trim()}>Add Viewer</button>
      </form>
      <ul className="share-list">
        {list.length === 0 && <li className="muted small">No one yet. Add their email – they sign in (or create an account) with that same email to see this project.</li>}
        {list.map((s) => <li key={s.email}><span>{s.email}</span><span className="muted small">added {when(s.created_at)}</span><button className="link danger" onClick={() => void removeShare(id, s.email).then(refresh)}>Remove</button></li>)}
      </ul>
      <h4>Viewer link</h4>
      <div className="share-add">
        <input placeholder="Viewer address, e.g. https://rackflow-viewer.vercel.app" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => setViewerUrl(url)} />
        <button disabled={!link} onClick={() => { void navigator.clipboard.writeText(link); notify('Link copied', { kind: 'success' }) }}>Copy Link</button>
      </div>
      <p className="muted small">{link || 'Enter the address where the RackFlow viewer is hosted (once) to get a link to send.'}</p>
      <div className="share-actions"><span className="spacer" /><button className="danger" onClick={() => void stop()}>Stop Sharing</button></div>
    </div>
  )
}

function Notes() {
  const notes = useCloud((s) => s.notes)
  const [showResolved, setShowResolved] = useState(false)
  const notify = useStore((s) => s.notify)
  const list = notes.filter((n) => showResolved || !n.resolved).slice().reverse()
  const act = (p: Promise<unknown>) => void p.catch((e) => notify((e as Error).message, { kind: 'error' }))
  return (
    <div className="share-notes">
      <div className="share-actions"><span className="muted small">Notes viewers left on the drawings. They update live.</span><span className="spacer" /><label className="check"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label></div>
      {list.length === 0 && <p className="muted">No {showResolved ? '' : 'open '}notes.</p>}
      <ul className="note-list">
        {list.map((n) => (
          <li key={n.id} className={n.resolved ? 'resolved' : ''}>
            <div className="note-head"><b>{n.author_email}</b><span className="muted small">{n.sheet_title} · {when(n.created_at)}</span></div>
            <p>{n.body}</p>
            <div className="note-actions">
              <button className="link" onClick={() => act(updateNote(n.id, { resolved: !n.resolved }))}>{n.resolved ? 'Reopen' : 'Resolve'}</button>
              <button className="link danger" onClick={() => act(deleteNote(n.id))}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

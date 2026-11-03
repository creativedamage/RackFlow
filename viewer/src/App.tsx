import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cableRows, drawingSet, type DrawingSheet, type Project } from '@core/index'
import {
  addNote, deleteNote, loadProject, myProjects, notes as fetchNotes, onAuth, resetPassword, session as getSession, setPassword,
  signIn, signOut, signUp, updateNote, watchMyProjects, watchProject, cloud, type CloudNote, type CloudProject,
} from '../../src/renderer/src/cloud'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const useHash = () => {
  const [h, setH] = useState(location.hash)
  useEffect(() => { const f = () => setH(location.hash); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return h
}

export function App() {
  const [sess, setSess] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    void getSession().then(setSess)
    const { data } = cloud().auth.onAuthStateChange((e, s) => { setSess(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true) })
    return () => data.subscription.unsubscribe()
  }, [])
  void onAuth
  const hash = useHash()
  if (sess === undefined) return <div className="center muted">Loading…</div>
  if (recovery && sess) return <NewPassword onDone={() => setRecovery(false)} />
  if (!sess) return <Login />
  const m = /^#\/p\/([0-9a-f-]{36})/.exec(hash)
  return m ? <ProjectView id={m[1]} me={sess} /> : <Projects me={sess} />
}

function Shell({ children, title, back, right }: { children: ReactNode; title?: ReactNode; back?: boolean; right?: ReactNode }) {
  return (
    <div className="shell">
      <header className="bar">
        {back ? <a className="pill" href="#/">‹ Projects</a> : <span className="brand"><img src="./icon.png" alt="" />RackFlow</span>}
        <div className="bar-title">{title}</div>
        {right}
        <button className="pill ghost" onClick={() => void signOut()}>Sign out</button>
      </header>
      {children}
    </div>
  )
}

// MARK: Sign in

function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const here = location.origin + location.pathname
  const go = async () => {
    setBusy(true); setMsg('')
    try {
      if (mode === 'in') await signIn(email, pw)
      else { const r = await signUp(email, pw, here); if (r.needsConfirm) setMsg('Almost there – open the confirmation email we just sent, then come back and sign in.') }
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="login">
      <form className="card" onSubmit={(e) => { e.preventDefault(); void go() }}>
        <img className="logo" src="./icon.png" alt="" />
        <h1>RackFlow Viewer</h1>
        <p className="muted">{mode === 'in' ? 'Sign in to see the projects shared with you.' : 'Create an account with the email the project was shared to.'}</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        {msg && <p className="msg">{msg}</p>}
        <button className="primary" disabled={busy || !email || pw.length < (mode === 'up' ? 6 : 1)}>{busy ? '…' : mode === 'in' ? 'Sign In' : 'Create Account'}</button>
        <div className="row">
          <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
          {mode === 'in' && <button type="button" className="link" disabled={!email} onClick={() => void resetPassword(email, here).then(() => setMsg('Password reset email sent.')).catch((e) => setMsg((e as Error).message))}>Forgot password?</button>}
        </div>
      </form>
    </div>
  )
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <div className="login">
      <form className="card" onSubmit={(e) => { e.preventDefault(); void setPassword(pw).then(onDone).catch((er) => setMsg((er as Error).message)) }}>
        <h1>Choose a new password</h1>
        <input type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {msg && <p className="msg">{msg}</p>}
        <button className="primary" disabled={pw.length < 6}>Save Password</button>
      </form>
    </div>
  )
}

// MARK: Projects

function Projects({ me }: { me: Session }) {
  const [list, setList] = useState<CloudProject[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const load = () => void myProjects().then(setList).catch((e) => setErr((e as Error).message))
    load()
    return watchMyProjects(load)
  }, [])
  return (
    <Shell title="Projects">
      <main className="projects">
        <h2>Shared with you</h2>
        {err && <p className="msg">{err}</p>}
        {list === null ? <p className="muted">Loading…</p> : list.length === 0 ? (
          <div className="empty card">
            <h3>Nothing shared yet</h3>
            <p className="muted">When someone shares a RackFlow project with <b>{me.user.email}</b>, it appears here – live.</p>
          </div>
        ) : (
          <div className="grid">
            {list.map((p) => (
              <a key={p.id} className="card proj" href={`#/p/${p.id}`}>
                <b>{p.name}</b>
                <span className="muted small">{p.owner === me.user.id ? 'Yours' : `From ${p.owner_email}`}</span>
                <span className="muted small">Updated {when(p.updated_at)}</span>
              </a>
            ))}
          </div>
        )}
      </main>
    </Shell>
  )
}

// MARK: One project

const MM = 96 / 25.4 // px per mm at 100%

function ProjectView({ id, me }: { id: string; me: Session }) {
  const [meta, setMeta] = useState<CloudProject | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState<CloudNote[]>([])
  const [fresh, setFresh] = useState(0)
  const [sheetId, setSheetId] = useState<string>('')
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [panel, setPanel] = useState<'sheet' | 'all'>('sheet')
  const [focus, setFocus] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => loadProject(id).then(({ meta: m, project: p }) => { if (alive) { setMeta(m); setProject(p) } }).catch((e) => alive && setErr((e as Error).message))
    void load()
    void fetchNotes(id).then((n) => alive && setNotes(n)).catch(() => {})
    const stop = watchProject(id, {
      revision: () => { void load().then(() => setFresh(Date.now())) },
      gone: () => setErr('This project is no longer shared.'),
      note: (kind, n) => setNotes((cur) => kind === 'DELETE' ? cur.filter((x) => x.id !== n.id) : [...cur.filter((x) => x.id !== n.id), n].sort((a, b) => a.created_at.localeCompare(b.created_at))),
    })
    return () => { alive = false; stop() }
  }, [id])

  const sheets = useMemo(() => (project ? drawingSet(project) : []), [project])
  const cur = sheets.find((s) => s.id === sheetId) ?? sheets[0]
  useEffect(() => { if (cur && cur.id !== sheetId) setSheetId(cur.id) }, [cur, sheetId])
  const pages = useMemo(() => { try { return cur ? cur.render() : [] } catch (e) { return [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40"><text x="10" y="24" font-size="8">Couldn’t draw this sheet: ${String(e).replace(/</g, '')}</text></svg>`] } }, [cur])
  useEffect(() => { if (page >= pages.length) setPage(0) }, [pages, page])
  const noteKey = cur ? `${cur.id}#${page}` : ''
  const groups = useMemo(() => {
    const g = new Map<string, DrawingSheet[]>()
    for (const s of sheets) if (!q || `${s.group} ${s.title}`.toLowerCase().includes(q.toLowerCase())) g.set(s.group, [...(g.get(s.group) ?? []), s])
    return [...g]
  }, [sheets, q])
  const isOwner = meta?.owner === me.user.id
  const openCount = (sid: string) => notes.filter((n) => !n.resolved && n.sheet.startsWith(`${sid}#`)).length

  if (err) return <Shell back title="Project"><div className="center"><p className="msg">{err}</p><a className="pill" href="#/">Back to projects</a></div></Shell>
  if (!project || !meta) return <Shell back title="Loading…"><div className="center muted">Loading project…</div></Shell>
  const shown = panel === 'sheet' ? notes.filter((n) => n.sheet === noteKey) : notes
  return (
    <Shell back title={<><b>{meta.name}</b><span className="muted small"> · {isOwner ? 'yours' : meta.owner_email}</span></>}
      right={<span className={`live ${fresh && Date.now() - fresh < 4000 ? 'flash' : ''}`} title="Changes the owner makes appear here automatically"><i />Live · updated {when(meta.updated_at)}</span>}>
      <div className="workspace">
        <aside className="sheets">
          <input className="search" type="search" placeholder="Find a drawing…" value={q} onChange={(e) => setQ(e.target.value)} />
          {groups.map(([g, list]) => (
            <section key={g}>
              <h4>{g}</h4>
              {list.map((s) => (
                <button key={s.id} className={`sheet-item ${cur?.id === s.id ? 'on' : ''}`} onClick={() => { setSheetId(s.id); setPage(0); setFocus(null) }}>
                  <span>{s.title}</span>{openCount(s.id) > 0 && <em>{openCount(s.id)}</em>}
                </button>
              ))}
            </section>
          ))}
          <section>
            <h4>Schedules</h4>
            <button className={`sheet-item ${sheetId === 'sched:cables' ? 'on' : ''}`} onClick={() => setSheetId('sched:cables')}><span>Cable schedule</span></button>
          </section>
        </aside>
        {sheetId === 'sched:cables' ? <CableTable project={project} /> : cur && (
          <SheetCanvas key={`${cur.id}#${page}`} svg={pages[page] ?? ''} notes={notes.filter((n) => n.sheet === noteKey)} me={me} isOwner={isOwner} focus={focus}
            pager={pages.length > 1 ? <div className="pager">{pages.map((_, i) => <button key={i} className={i === page ? 'on' : ''} onClick={() => setPage(i)}>{i + 1}</button>)}</div> : null}
            onAdd={(x, y, body) => addNote({ project_id: id, sheet: noteKey, sheet_title: `${cur.title}${pages.length > 1 ? ` (${page + 1})` : ''}`, x, y, body }).then((n) => setNotes((c) => c.some((x2) => x2.id === n.id) ? c : [...c, n]))} />
        )}
        <aside className="notes">
          <div className="seg">
            <button className={panel === 'sheet' ? 'on' : ''} onClick={() => setPanel('sheet')}>This sheet</button>
            <button className={panel === 'all' ? 'on' : ''} onClick={() => setPanel('all')}>All notes ({notes.filter((n) => !n.resolved).length})</button>
          </div>
          {shown.length === 0 && <p className="muted small pad">{panel === 'sheet' ? 'No notes here. Click “Add note” and then the drawing to leave one.' : 'No notes yet.'}</p>}
          <ul>
            {shown.slice().reverse().map((n) => (
              <NoteItem key={n.id} n={n} me={me} isOwner={isOwner} num={notes.filter((x) => x.sheet === n.sheet).indexOf(n) + 1}
                onShow={() => { const [sid, pg] = n.sheet.split('#'); setSheetId(sid); setPage(Number(pg) || 0); setFocus(n.id) }} />
            ))}
          </ul>
        </aside>
      </div>
    </Shell>
  )
}

function NoteItem({ n, me, isOwner, num, onShow }: { n: CloudNote; me: Session; isOwner: boolean; num: number; onShow: () => void }) {
  const [edit, setEdit] = useState<string | null>(null)
  const mine = n.author === me.user.id
  return (
    <li className={`note ${n.resolved ? 'resolved' : ''}`}>
      <button className="note-head" onClick={onShow}><span className="pin-n">{num}</span><b>{mine ? 'You' : n.author_email}</b><span className="muted small">{n.sheet_title} · {when(n.created_at)}</span></button>
      {edit == null ? <p>{n.body}</p> : (
        <form onSubmit={(e) => { e.preventDefault(); void updateNote(n.id, { body: edit }).then(() => setEdit(null)) }}>
          <textarea value={edit} onChange={(e) => setEdit(e.target.value)} autoFocus rows={3} />
          <div className="row"><button type="button" className="link" onClick={() => setEdit(null)}>Cancel</button><button className="primary small" disabled={!edit.trim()}>Save</button></div>
        </form>
      )}
      <div className="row">
        {(mine || isOwner) && <button className="link" onClick={() => void updateNote(n.id, { resolved: !n.resolved })}>{n.resolved ? 'Reopen' : 'Resolve'}</button>}
        {mine && edit == null && <button className="link" onClick={() => setEdit(n.body)}>Edit</button>}
        {(mine || isOwner) && <button className="link danger" onClick={() => { if (confirm('Delete this note?')) void deleteNote(n.id) }}>Delete</button>}
      </div>
    </li>
  )
}

/** One drawing: pan (drag), zoom (wheel / pinch / buttons), numbered note pins, click to add a note. */
function SheetCanvas({ svg, notes, me, isOwner, onAdd, pager, focus }: { svg: string; notes: CloudNote[]; me: Session; isOwner: boolean; onAdd: (x: number, y: number, body: string) => Promise<unknown>; pager: ReactNode; focus: string | null }) {
  const box = useRef<HTMLDivElement>(null)
  const size = useMemo(() => {
    const m = /viewBox="([\d.\s-]+)"/.exec(svg)
    const v = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 400, 280]
    return { w: v[2], h: v[3] }
  }, [svg])
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<{ x: number; y: number; body: string } | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const fit = () => {
    const el = box.current
    if (!el) return
    const k = Math.min(el.clientWidth / (size.w * MM), el.clientHeight / (size.h * MM)) * 0.96
    setView({ k, x: (el.clientWidth - size.w * MM * k) / 2, y: (el.clientHeight - size.h * MM * k) / 2 })
  }
  useEffect(fit, [size.w, size.h])
  useEffect(() => {
    const n = notes.find((x) => x.id === focus), el = box.current
    if (!n || !el) return
    const k = Math.max(view.k, 1.4)
    setView({ k, x: el.clientWidth / 2 - n.x * MM * k, y: el.clientHeight / 2 - n.y * MM * k })
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const zoomAt = (cx: number, cy: number, f: number) => setView((v) => { const k = Math.min(12, Math.max(0.05, v.k * f)); return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) } })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40 && !e.deltaX) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)))
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const toSheet = (e: React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - view.x) / (MM * view.k), y: (e.clientY - r.top - view.y) / (MM * view.k) }
  }
  void me; void isOwner
  return (
    <section className="canvas">
      <div className="canvas-tools">
        {pager}
        <span className="spacer" />
        <button className={`pill ${adding ? 'primary' : ''}`} onClick={() => { setAdding(!adding); setDraft(null) }}>{adding ? 'Click the drawing…' : '＋ Add note'}</button>
        <button className="pill ghost" onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1 / 1.3) }}>−</button>
        <button className="pill ghost" onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1.3) }}>＋</button>
        <button className="pill ghost" onClick={fit}>Fit</button>
      </div>
      <div ref={box} className={`stage ${adding ? 'adding' : ''}`}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.pin, .draft')) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true; if (d.moved) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })) }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved && adding) { const p = toSheet(e); if (p.x >= 0 && p.y >= 0 && p.x <= size.w && p.y <= size.h) setDraft({ ...p, body: '' }) } }}>
        <div className="paper" style={{ width: size.w * MM, height: size.h * MM, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <div className="svg" dangerouslySetInnerHTML={{ __html: svg.replace(/width="[^"]*mm" height="[^"]*mm"/, 'width="100%" height="100%"') }} />
          {notes.map((n, i) => (
            <div key={n.id} className={`pin ${n.resolved ? 'resolved' : ''} ${focus === n.id ? 'focus' : ''}`} style={{ left: n.x * MM, top: n.y * MM, transform: `translate(-50%, -100%) scale(${1 / view.k})` }} title={`${n.author_email}: ${n.body}`}>
              <span>{i + 1}</span>
            </div>
          ))}
          {draft && (
            <form className="draft" style={{ left: draft.x * MM, top: draft.y * MM, transform: `scale(${1 / view.k})` }} onSubmit={(e) => { e.preventDefault(); const d = draft; void onAdd(d.x, d.y, d.body.trim()).then(() => { setDraft(null); setAdding(false) }) }}>
              <textarea autoFocus placeholder="Your note…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={3}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); if (e.key === 'Escape') setDraft(null) }} />
              <div className="row"><button type="button" className="link" onClick={() => setDraft(null)}>Cancel</button><button className="primary small" disabled={!draft.body.trim()}>Post note</button></div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

function CableTable({ project }: { project: Project }) {
  const rows = useMemo(() => cableRows(project), [project])
  const [q, setQ] = useState('')
  const shown = rows.filter((r) => !q || [r.cable.label, r.fromTag, r.fromPort, r.toTag, r.toPort, r.signal, r.cableType].join(' ').toLowerCase().includes(q.toLowerCase()))
  return (
    <section className="canvas table-wrap">
      <div className="canvas-tools"><input className="search" type="search" placeholder="Filter cables…" value={q} onChange={(e) => setQ(e.target.value)} /><span className="muted small">{shown.length} cables</span></div>
      <div className="table">
        <table>
          <thead><tr><th>Label</th><th>From</th><th>Port</th><th>To</th><th>Port</th><th>Signal</th><th>Cable</th></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.cable.id}><td><b>{r.cable.label}</b></td><td>{r.fromTag}</td><td>{r.fromPort}</td><td>{r.toTag}</td><td>{r.toPort}</td><td>{r.signal}</td><td>{r.cableType}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}

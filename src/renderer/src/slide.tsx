import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from './store'

type Side = 'left' | 'right'
const DURATION = 340
const MAX_BLUR = 16
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** One horizontal-only blur filter per side, so both sidebars can move at once. */
function blurFilter(side: Side): SVGFEGaussianBlurElement | null {
  const id = `rf-mblur-${side}`
  let fe = document.querySelector<SVGFEGaussianBlurElement>(`#${id} feGaussianBlur`)
  if (!fe) {
    const ns = 'http://www.w3.org/2000/svg'
    let svg = document.getElementById('rf-mblur-defs') as SVGSVGElement | null
    if (!svg) {
      svg = document.createElementNS(ns, 'svg') as SVGSVGElement
      svg.id = 'rf-mblur-defs'
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
      document.body.appendChild(svg)
    }
    const f = document.createElementNS(ns, 'filter')
    f.id = id
    f.setAttribute('x', '-20%'); f.setAttribute('width', '140%'); f.setAttribute('y', '0'); f.setAttribute('height', '100%')
    fe = document.createElementNS(ns, 'feGaussianBlur') as SVGFEGaussianBlurElement
    fe.setAttribute('stdDeviation', '0 0')
    f.appendChild(fe); svg.appendChild(f)
  }
  return fe
}

export type SlideRun = { done: Promise<void>; cancel: () => void }

/**
 * Slide a panel in from (or out to) its edge with a horizontal motion blur that
 * follows its speed: strongest while it moves fastest, sharp once it settles.
 */
export function slide(el: HTMLElement, side: Side, dir: 'in' | 'out'): SlideRun {
  if (reduced() || typeof el.animate !== 'function') return { done: Promise.resolve(), cancel: () => {} }
  const off = side === 'left' ? 'translateX(calc(-100% - 24px))' : 'translateX(calc(100% + 24px))'
  const fe = blurFilter(side)
  el.style.filter = `url(#rf-mblur-${side})`
  el.style.willChange = 'transform, filter'
  const anim = el.animate(
    [{ transform: off, opacity: 0.35 }, { transform: 'translateX(0)', opacity: 1 }],
    { duration: DURATION, easing: dir === 'in' ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.7, 0, 0.84, 0)', direction: dir === 'in' ? 'normal' : 'reverse', fill: 'both' },
  )
  let raf = 0
  const tick = () => {
    const t = Math.min(1, Number(anim.currentTime ?? 0) / DURATION)
    // Speed of the easing curve: fast at the start of an entrance, at the end of an exit.
    const v = dir === 'in' ? (1 - t) ** 2.2 : t ** 2.2
    fe?.setAttribute('stdDeviation', `${(MAX_BLUR * v).toFixed(2)} 0`)
    if (t < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  const clean = () => {
    cancelAnimationFrame(raf)
    fe?.setAttribute('stdDeviation', '0 0')
    el.style.filter = ''; el.style.willChange = ''
  }
  const done = anim.finished.then(() => { clean(); if (dir === 'in') anim.cancel() }, () => { clean() })
  return { done, cancel: () => { anim.cancel(); clean() } }
}

/**
 * Mounts its single child panel while `open`, sliding it in and out. On the way
 * out the panel is lifted out of the layout (fixed where it was) so the rest of
 * the window settles at once while it slides away.
 */
export function Slide({ open, side, children }: { open: boolean; side: Side; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  const entering = useRef(false)
  const panel = () => ref.current?.firstElementChild as HTMLElement | null

  useEffect(() => {
    if (open && !mounted) { entering.current = true; setMounted(true); return }
    if (!open && mounted) {
      const el = panel()
      if (!el) { setMounted(false); return }
      const r = el.getBoundingClientRect()
      if (getComputedStyle(el).position !== 'fixed') {
        Object.assign(el.style, { position: 'fixed', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '95' })
      }
      let live = true
      const run = slide(el, side, 'out')
      void run.done.then(() => { if (live) setMounted(false) })
      return () => {
        live = false; run.cancel()
        Object.assign(el.style, { position: '', top: '', left: '', width: '', height: '', margin: '', zIndex: '' })
      }
    }
  }, [open, mounted, side])

  useLayoutEffect(() => {
    if (!mounted || !entering.current) return
    entering.current = false
    const el = panel()
    if (el) slide(el, side, 'in')
  }, [mounted, side])

  return mounted ? <div ref={ref} className="slide-host" style={{ display: 'contents' }}>{children}</div> : null
}

/**
 * Edge peek: with a sidebar collapsed, push the pointer all the way to that edge
 * of the window and the sidebar slides out over the content; it stays while the
 * pointer is over it and slides away once the pointer leaves.
 */
export function EdgePeek({ left, right }: { left: boolean; right: boolean }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let dragging = false
    const stop = () => { if (timer) { clearTimeout(timer); timer = null } }
    const close = () => { stop(); if (useStore.getState().peek) useStore.getState().set({ peek: null }) }
    const busy = () => dragging || !!document.querySelector('.context-menu, .modal-backdrop')

    const onMove = (e: MouseEvent) => {
      const peek = useStore.getState().peek
      const w = window.innerWidth
      if (!peek) {
        if (e.buttons) return
        if (left && e.clientX <= 2) useStore.getState().set({ peek: 'left' })
        else if (right && e.clientX >= w - 3) useStore.getState().set({ peek: 'right' })
        return
      }
      const el = document.querySelector('.peek')
      if (!el) return
      const r = el.getBoundingClientRect()
      const inside = peek === 'left' ? e.clientX <= r.right + 16 : e.clientX >= r.left - 16
      if (inside || busy()) stop()
      else if (!timer) timer = setTimeout(close, 260)
    }
    const onDragStart = () => { dragging = true }
    const onDragEnd = () => { dragging = false }
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget && useStore.getState().peek && !busy()) { stop(); timer = setTimeout(close, 400) } }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('dragstart', onDragStart, true)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('drop', onDragEnd, true)
    document.addEventListener('mouseout', onLeave)
    return () => {
      stop()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('dragstart', onDragStart, true)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('drop', onDragEnd, true)
      document.removeEventListener('mouseout', onLeave)
    }
  }, [left, right])

  // Nothing to peek at any more (e.g. the sidebar was docked or the mode changed).
  const peek = useStore((s) => s.peek)
  useEffect(() => {
    if ((peek === 'left' && !left) || (peek === 'right' && !right)) useStore.getState().set({ peek: null })
  }, [peek, left, right])
  return null
}

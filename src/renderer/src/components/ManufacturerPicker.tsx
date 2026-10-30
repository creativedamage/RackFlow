import { useEffect, useMemo, useRef, useState } from 'react'
import { MAKER_CATEGORIES, type MakerMatch } from '@core/index'
import { useStore } from '../store'

/**
 * Searchable manufacturer field. Suggests listed makers (matching names and
 * product lines, e.g. "dLive" → Allen & Heath) and offers "+ Add … as a new
 * manufacturer" when nothing matches. The new maker is saved with the product.
 */
export function ManufacturerPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const makers = useStore((s) => s.makers)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => setText(value), [value])

  const matches = useMemo(() => makers.search(text, null, 8), [makers, text])
  const exact = makers.get(text)
  const canAdd = text.trim().length > 0 && !exact
  const options: (MakerMatch | 'add')[] = [...matches, ...(canAdd ? ['add' as const] : [])]

  const choose = (o: MakerMatch | 'add') => {
    const name = o === 'add' ? text.trim() : o.maker.name
    setText(name)
    onChange(name)
    setOpen(false)
  }

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const listed = makers.get(value)
  const alias = !listed && value ? makers.resolve(value) : undefined

  return (
    <div className="maker-picker" ref={box}>
      <input
        value={text}
        placeholder="Search 350+ manufacturers…"
        onFocus={() => { setOpen(true); setHi(0) }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setHi(0) }}
        onBlur={() => { if (text !== value && !open) onChange(text.trim()) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); const o = options[hi]; if (open && o) choose(o); else onChange(text.trim()) }
          else if (e.key === 'Escape') { setOpen(false); setText(value) }
        }}
      />
      {open && options.length > 0 && (
        <ul className="maker-options" role="listbox">
          {options.map((o, i) => o === 'add' ? (
            <li key="__add" className={`add ${hi === i ? 'hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); choose(o) }}>
              + Add “{text.trim()}” as a new manufacturer
            </li>
          ) : (
            <li key={o.maker.name} className={hi === i ? 'hi' : ''} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); choose(o) }}>
              <span className="mk-name">{o.maker.name}{o.maker.source === 'user' && <span className="badge">Yours</span>}</span>
              <span className="mk-sub">{o.via ? `${o.via} · ` : ''}{o.maker.categories.map((c) => MAKER_CATEGORIES[c]).slice(0, 2).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mk-status">
        {!value ? <span className="muted">Pick a manufacturer, or type a new one.</span>
          : listed ? <span className="ok">✓ {listed.source === 'user' ? 'Your manufacturer' : 'Listed manufacturer'}</span>
          : alias ? <span className="warn-text">“{value}” is a {alias.maker.name} product line. <button type="button" className="link" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setText(alias.maker.name); onChange(alias.maker.name) }}>Use {alias.maker.name}</button></span>
          : <span className="new">New manufacturer: saved to your list with this product.</span>}
      </div>
    </div>
  )
}

// Faceplate pictures for the rack elevation: drop in the manufacturer's drawing or
// photo (PNG / JPG / WebP / SVG / PDF page / DXF), crop it to the panel, and every
// unit of that product – in this project and in your library – shows it.

import { useEffect, useMemo, useRef, useState } from 'react'
import DxfParser from 'dxf-parser'
import { U_MM, RACK_W_MM, type FaceImage, type ProductDefinition, type RackFace } from '@core/index'
import { api } from '../platform'
import { useStore } from '../store'
import { Modal } from '../components/ui'

type Src = { kind: 'canvas'; canvas: HTMLCanvasElement; name: string } | { kind: 'pdf'; doc: PdfDoc; page: number; name: string }
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }

/** Puts (or clears) a face picture on every placed unit of the product and on the library copy. */
export async function applyFaceImage(product: ProductDefinition, panel: RackFace, img: FaceImage | null) {
  const st = useStore.getState()
  const key = product.key
  st.apply(img ? `Set ${panel === 'front' ? 'Front' : 'Rear'} Image` : `Remove ${panel === 'front' ? 'Front' : 'Rear'} Image`, (d) => {
    for (const e of d.equipment) if (e.product.key === key) {
      const f = { ...(e.product.faceImages ?? {}) }
      if (img) f[panel] = img
      else delete f[panel]
      e.product.faceImages = f.front || f.rear ? f : undefined
    }
  })
  // Library: keep the picture with the product for future projects.
  const libKey = key.split('@')[0]
  const lib = st.library.get(libKey) ?? product
  const f = { ...(lib.faceImages ?? {}) }
  if (img) f[panel] = img
  else delete f[panel]
  try {
    await api.saveUserProduct({ ...structuredClone(lib), key: libKey, faceImages: f.front || f.rear ? f : undefined, source: 'user', revision: (lib.revision ?? 0) + 1 })
    await st.reloadLibrary()
  } catch { st.notify('Saved in this project (your library couldn’t be updated)', { kind: 'warning' }) }
}

const readAs = (f: File, how: 'url' | 'text' | 'buf') => new Promise<string | ArrayBuffer>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result as string | ArrayBuffer); r.onerror = () => rej(r.error)
  if (how === 'url') r.readAsDataURL(f); else if (how === 'text') r.readAsText(f); else r.readAsArrayBuffer(f)
})
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Unreadable image')); i.src = src })
function toCanvas(img: CanvasImageSource & { width: number; height: number }, w = img.width, h = img.height, bg?: string) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d')!
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height) }
  g.drawImage(img, 0, 0, c.width, c.height)
  return c
}

/** DXF (lines, polylines, circles, arcs) → SVG, black on white. */
function dxfToSVG(text: string): string {
  const dxf = new DxfParser().parseSync(text) as { entities: { type: string; vertices?: { x: number; y: number; bulge?: number }[]; center?: { x: number; y: number }; radius?: number; startAngle?: number; endAngle?: number; shape?: boolean }[] } | null
  if (!dxf) throw new Error('Unreadable DXF')
  const parts: string[] = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const see = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (const e of dxf.entities) {
    if ((e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices?.length) {
      e.vertices.forEach((v) => see(v.x, v.y))
      parts.push(`<polyline points="${e.vertices.map((v) => `${v.x},${-v.y}`).join(' ')}${e.shape ? ` ${e.vertices[0].x},${-e.vertices[0].y}` : ''}"/>`)
    } else if (e.type === 'CIRCLE' && e.center && e.radius) {
      see(e.center.x - e.radius, e.center.y - e.radius); see(e.center.x + e.radius, e.center.y + e.radius)
      parts.push(`<circle cx="${e.center.x}" cy="${-e.center.y}" r="${e.radius}"/>`)
    } else if (e.type === 'ARC' && e.center && e.radius != null) {
      const a0 = e.startAngle ?? 0, a1 = e.endAngle ?? Math.PI * 2, r = e.radius
      const sx = e.center.x + r * Math.cos(a0), sy = e.center.y + r * Math.sin(a0), ex = e.center.x + r * Math.cos(a1), ey = e.center.y + r * Math.sin(a1)
      let sweep = a1 - a0; if (sweep < 0) sweep += Math.PI * 2
      see(e.center.x - r, e.center.y - r); see(e.center.x + r, e.center.y + r)
      parts.push(`<path d="M ${sx} ${-sy} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 0 ${ex} ${-ey}"/>`)
    }
  }
  if (!parts.length) throw new Error('No drawable lines in that DXF')
  const w = x1 - x0, h = y1 - y0, lw = Math.max(w, h) / 900
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - w * 0.01} ${-y1 - h * 0.01} ${w * 1.02} ${h * 1.02}" width="2400" height="${Math.round(2400 * h / w)}"><rect x="${x0 - w}" y="${-y1 - h}" width="${w * 3}" height="${h * 3}" fill="#fff"/><g fill="none" stroke="#000" stroke-width="${lw}">${parts.join('')}</g></svg>`
}

async function openFile(f: File): Promise<Src> {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  const name = f.name
  if (ext === 'dwg' || ext === 'dwf') throw new Error(`${ext.toUpperCase()} can’t be read directly – save it as DXF or PDF (e.g. with the free ODA File Converter or Autodesk Viewer), then add that`)
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist')
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = worker
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await readAs(f, 'buf') as ArrayBuffer) }).promise
    return { kind: 'pdf', doc: doc as unknown as PdfDoc, page: 1, name }
  }
  if (ext === 'dxf') {
    const svg = dxfToSVG(await readAs(f, 'text') as string)
    const img = await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    return { kind: 'canvas', canvas: toCanvas(img, 2400, 2400 * img.height / img.width, '#fff'), name }
  }
  const url = await readAs(f, 'url') as string
  const img = await loadImg(url)
  const scale = ext === 'svg' ? Math.max(1, 2400 / (img.width || 2400)) : 1
  return { kind: 'canvas', canvas: toCanvas(img, (img.width || 2400) * scale, (img.height || 600) * scale), name }
}

async function renderPdf(doc: PdfDoc, n: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n)
  const v1 = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(4, 2800 / v1.width) })
  const c = document.createElement('canvas'); c.width = Math.round(viewport.width); c.height = Math.round(viewport.height)
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: g, viewport }).promise
  return c
}

/** Bounds of the content: trims margins that match the corner colour. */
function autoTrim(c: HTMLCanvasElement, within?: Rect): Rect {
  const r = within ?? { x: 0, y: 0, w: c.width, h: c.height }
  const d = c.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h).data
  const at = (x: number, y: number) => { const i = (y * r.w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]] }
  const bg = at(0, 0)
  const differs = (x: number, y: number) => { const p = at(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) + Math.abs(p[3] - bg[3]) > 48 }
  const rowHas = (y: number) => { for (let x = 0; x < r.w; x += 2) if (differs(x, y)) return true; return false }
  const colHas = (x: number) => { for (let y = 0; y < r.h; y += 2) if (differs(x, y)) return true; return false }
  let t = 0, b = r.h - 1, l = 0, rr = r.w - 1
  while (t < b && !rowHas(t)) t++
  while (b > t && !rowHas(b)) b--
  while (l < rr && !colHas(l)) l++
  while (rr > l && !colHas(rr)) rr--
  return { x: r.x + l, y: r.y + t, w: rr - l + 1, h: b - t + 1 }
}
interface Rect { x: number; y: number; w: number; h: number }

function rotate(c: HTMLCanvasElement) {
  const o = document.createElement('canvas'); o.width = c.height; o.height = c.width
  const g = o.getContext('2d')!; g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0)
  return o
}

export function pickFaceFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.png,.jpg,.jpeg,.webp,.svg,.pdf,.dxf,.dwg,.dwf'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/** Crop a picked file to the faceplate, preview it at the unit's size, and save it to the product. */
export function FaceImageDialog({ product, panel, heightU, half, onClose }: { product: ProductDefinition; panel: RackFace; heightU: number; half?: boolean; onClose: () => void }) {
  const [src, setSrc] = useState<Src | null>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const view = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const choose = async () => {
    const f = await pickFaceFile()
    if (!f) return
    setErr(''); setBusy(true)
    try { const s = await openFile(f); setSrc(s) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { void choose() }, [])
  useEffect(() => {
    if (!src) return
    let live = true
    void (async () => {
      const c = src.kind === 'pdf' ? await renderPdf(src.doc, src.page) : src.canvas
      if (!live) return
      setCanvas(c); setCrop(src.kind === 'pdf' ? null : autoTrim(c))
    })()
    return () => { live = false }
  }, [src])

  const W = 860, H = 420
  const k = canvas ? Math.min(W / canvas.width, H / canvas.height) : 1
  const toImg = (e: React.MouseEvent) => { const b = view.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas!.width, (e.clientX - b.left) / k)), y: Math.max(0, Math.min(canvas!.height, (e.clientY - b.top) / k)) } }
  const aspect = (half ? RACK_W_MM / 2 : RACK_W_MM) / (heightU * U_MM)

  const full = useMemo(() => canvas?.toDataURL('image/jpeg', 0.8) ?? '', [canvas])
  const preview = useMemo(() => {
    if (!canvas) return ''
    const r = crop ?? { x: 0, y: 0, w: canvas.width, h: canvas.height }
    const o = document.createElement('canvas'); o.width = Math.min(1800, Math.max(200, Math.round(r.w))); o.height = Math.max(20, Math.round(o.width / aspect))
    o.getContext('2d')!.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, o.width, o.height)
    return o.toDataURL('image/webp', 0.88)
  }, [canvas, crop, aspect])

  const save = async () => {
    if (!preview) return
    setBusy(true)
    await applyFaceImage(product, panel, { src: preview, source: src?.name })
    useStore.getState().notify(`${product.model}: ${panel} image set`, { kind: 'success', undo: true })
    onClose()
  }

  return (
    <Modal title={`${panel === 'front' ? 'Front' : 'Rear'} panel image · ${product.manufacturer} ${product.model}`} onClose={onClose} wide
      footer={<>
        <button onClick={choose} disabled={busy}>Choose File…</button>
        {canvas && <button onClick={() => setCrop(autoTrim(canvas, crop ?? undefined))} title="Trim plain margins around the panel">Auto-trim</button>}
        {canvas && <button onClick={() => { const c = rotate(canvas); setCanvas(c); setCrop(autoTrim(c)) }}>Rotate 90°</button>}
        {canvas && <button onClick={() => setCrop(null)}>Whole image</button>}
        {src?.kind === 'pdf' && <>
          <button disabled={src.page <= 1} onClick={() => setSrc({ ...src, page: src.page - 1 })}>◀</button>
          <span className="muted small">Page {src.page} / {src.doc.numPages}</span>
          <button disabled={src.page >= src.doc.numPages} onClick={() => setSrc({ ...src, page: src.page + 1 })}>▶</button>
        </>}
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!canvas || busy} onClick={save}>Use Image</button>
      </>}>
      <div className="face-dlg">
      <p className="muted small">PNG, JPG, SVG, a PDF page (datasheet or CAD sheet) or DXF. Drag a box round the faceplate{panel === 'front' ? ', ears included' : ''}. DWG/DWF: save as DXF or PDF first.</p>
      {err && <p className="error">{err}</p>}
      {busy && !canvas && <p className="muted">Opening…</p>}
      {canvas && (
        <div className="face-crop" ref={view} style={{ width: canvas.width * k, height: canvas.height * k }}
          onMouseDown={(e) => { drag.current = toImg(e); setCrop(null) }}
          onMouseMove={(e) => { if (!drag.current || !(e.buttons & 1)) return; const p = toImg(e), a = drag.current; setCrop({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) }) }}
          onMouseUp={() => { drag.current = null; if (crop && (crop.w < 8 || crop.h < 4)) setCrop(null) }}>
          <img src={full} alt="" draggable={false} style={{ width: '100%', height: '100%' }} />
          {crop && <div className="face-crop-box" style={{ left: crop.x * k, top: crop.y * k, width: crop.w * k, height: crop.h * k }} />}
        </div>
      )}
      {preview && <>
        <h5 className="muted" style={{ margin: '10px 0 4px' }}>In the rack ({heightU}U{half ? ', half width' : ''})</h5>
        <div className="face-preview" style={{ aspectRatio: String(aspect) }}><img src={preview} alt="" /></div>
      </>}
      </div>
    </Modal>
  )
}

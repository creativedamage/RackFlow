// Tiny SVG writer for printed drawings (rack elevations, schematics).
// Coordinates are millimetres on the sheet.

export const CAD_FONT = `'Arial Narrow', 'Helvetica Neue Condensed', 'Roboto Condensed', 'Liberation Sans Narrow', Arial, sans-serif`
const AVG_EM = 0.5 // average glyph advance for a condensed face, in ems

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => (Math.round(v * 100) / 100).toString()

export interface TextOpts {
  size: number
  anchor?: 'start' | 'middle' | 'end'
  weight?: 'normal' | 'bold'
  /** Squeeze (never stretch) to fit this width. */
  maxWidth?: number
  fill?: string
  baseline?: 'middle' | 'alphabetic' | 'hanging'
  italic?: boolean
}

export class Svg {
  private parts: string[] = []
  constructor(readonly widthMM: number, readonly heightMM: number) {}

  raw(s: string) { this.parts.push(s); return this }
  rect(x: number, y: number, w: number, h: number, o: { stroke?: string; fill?: string; lw?: number; rx?: number; dash?: string } = {}) {
    this.parts.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${o.rx ? ` rx="${n(o.rx)}"` : ''} fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? '#000'}" stroke-width="${n(o.lw ?? 0.25)}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`)
    return this
  }
  line(x1: number, y1: number, x2: number, y2: number, o: { stroke?: string; lw?: number; dash?: string } = {}) {
    this.parts.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${o.stroke ?? '#000'}" stroke-width="${n(o.lw ?? 0.25)}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`)
    return this
  }
  polyline(pts: { x: number; y: number }[], o: { stroke?: string; lw?: number; dash?: string } = {}) {
    this.parts.push(`<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${o.stroke ?? '#000'}" stroke-width="${n(o.lw ?? 0.25)}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`)
    return this
  }
  path(d: string, o: { stroke?: string; fill?: string; lw?: number } = {}) {
    this.parts.push(`<path d="${d}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? '#000'}" stroke-width="${n(o.lw ?? 0.25)}"/>`)
    return this
  }
  circle(cx: number, cy: number, r: number, o: { stroke?: string; fill?: string; lw?: number } = {}) {
    this.parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? '#000'}" stroke-width="${n(o.lw ?? 0.25)}"/>`)
    return this
  }
  text(x: number, y: number, s: string, o: TextOpts) {
    if (!s) return this
    const est = s.length * AVG_EM * o.size
    const fit = o.maxWidth && est > o.maxWidth ? ` textLength="${n(o.maxWidth)}" lengthAdjust="spacingAndGlyphs"` : ''
    this.parts.push(`<text x="${n(x)}" y="${n(y)}" font-family="${esc(CAD_FONT)}" font-size="${n(o.size)}"${o.weight === 'bold' ? ' font-weight="bold"' : ''}${o.italic ? ' font-style="italic"' : ''} text-anchor="${o.anchor ?? 'start'}" dominant-baseline="${o.baseline ?? 'middle'}" fill="${o.fill ?? '#000'}"${fit}>${esc(s)}</text>`)
    return this
  }
  image(x: number, y: number, w: number, h: number, href: string) {
    this.parts.push(`<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid meet" href="${esc(href)}"/>`)
    return this
  }
  group(transform: string, fn: (s: Svg) => void) {
    this.parts.push(`<g transform="${transform}">`)
    fn(this)
    this.parts.push('</g>')
    return this
  }
  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(this.widthMM)}mm" height="${n(this.heightMM)}mm" viewBox="0 0 ${n(this.widthMM)} ${n(this.heightMM)}">\n<rect width="100%" height="100%" fill="#fff"/>\n${this.parts.join('\n')}\n</svg>`
  }
}

/** Rough text width in mm for the CAD font (for layout decisions). */
export const textWidth = (s: string, size: number) => s.length * AVG_EM * size

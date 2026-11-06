// Photo-real connector faces for the plate designer (rack panels, wall boxes):
// Neutrik-style D-series housings with screw heads, chrome, gold contacts and
// PUSH latches on a brushed panel. Print / fabrication drawings keep the line
// drawings in platelayout.ts. All in mm, centred on the jack.

import { footprint, jackSVG } from './platelayout'

const n = (v: number) => Math.round(v * 100) / 100

/** Gradients and the brushed-metal texture, once per <svg>. */
export function realDefs(dark: boolean): string {
  const line = dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)'
  return `<defs>
<radialGradient id="rf-screw" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d6d8db"/><stop offset="1" stop-color="#8b8e93"/></radialGradient>
<radialGradient id="rf-chrome" cx="0.4" cy="0.3" r="0.85"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#d9dcdf"/><stop offset="0.7" stop-color="#9ca0a5"/><stop offset="1" stop-color="#d0d3d7"/></radialGradient>
<linearGradient id="rf-flange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3d42"/><stop offset="1" stop-color="#26282c"/></linearGradient>
<radialGradient id="rf-body" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#2c2e31"/><stop offset="1" stop-color="#0f1011"/></radialGradient>
<linearGradient id="rf-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#b8862b"/></linearGradient>
<linearGradient id="rf-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f2"/><stop offset="1" stop-color="#9da1a6"/></linearGradient>
<linearGradient id="rf-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.07 : 0.35}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.18 : 0.06}"/></linearGradient>
<pattern id="rf-brush" width="10" height="1.7" patternUnits="userSpaceOnUse"><path d="M0 0.35H10" stroke="${line}" stroke-width="0.3"/><path d="M0 1.15H10" stroke="${line}" stroke-opacity="0.55" stroke-width="0.45"/></pattern>
</defs>`
}

/** A Phillips screw head. */
export function realScrew(x: number, y: number, r = 1.9): string {
  const c = r * 0.55
  return `<g transform="translate(${n(x)} ${n(y)})"><circle r="${n(r)}" fill="url(#rf-screw)" stroke="#5d6065" stroke-width="0.18"/><path d="M${n(-c)} 0H${n(c)}M0 ${n(-c)}V${n(c)}" stroke="#55585d" stroke-width="${n(r * 0.24)}" stroke-linecap="round"/></g>`
}

const push = (y: number) => `<rect x="-3" y="${n(y)}" width="6" height="2.5" rx="0.5" fill="#e4e5e7" stroke="#9a9da1" stroke-width="0.12"/><text x="0" y="${n(y + 1.75)}" font-family="Helvetica, Arial, sans-serif" font-size="1.35" font-weight="bold" text-anchor="middle" fill="#3a3c40">PUSH</text>`
const ring = (r = 10.4, w = 1.1) => `<circle r="${r}" fill="url(#rf-body)"/><circle r="${n(r - w / 2)}" fill="none" stroke="url(#rf-chrome)" stroke-width="${w}"/>`
const hole = (x: number, y: number, r: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#050505" stroke="#3b3d40" stroke-width="0.15"/>`
const pin = (x: number, y: number, r: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#rf-gold)" stroke="#7a5a1c" stroke-width="0.1"/>`
const rj45 = (x: number, y: number, w = 10.4, h = 7.6) => {
  const p: string[] = [`<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="0.5" fill="#060606" stroke="#55585c" stroke-width="0.2"/>`]
  for (let i = 0; i < 8; i++) p.push(`<rect x="${n(x - w / 2 + 1.1 + i * ((w - 2.2) / 8) + 0.15)}" y="${n(y - h / 2 + 0.5)}" width="${n((w - 2.2) / 8 - 0.3)}" height="2" fill="url(#rf-gold)"/>`)
  p.push(`<rect x="${n(x - 2.2)}" y="${n(y + h / 2 - 1.6)}" width="4.4" height="1.6" fill="#222"/>`)
  return p.join('')
}

/** D-series housing: 26 × 31 flange with two screws (top-left, bottom-right). */
function dFlange(w: number, h: number, inner = ''): string {
  const hw = w / 2, hh = h / 2
  return `<rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="2.6" fill="url(#rf-flange)" stroke="#55585e" stroke-width="0.3"/>`
    + `<rect x="${-hw + 0.4}" y="${-hh + 0.4}" width="${w - 0.8}" height="${h - 0.8}" rx="2.3" fill="url(#rf-sheen)"/>`
    + inner
    + realScrew(-hw + 3.5, -hh + 3.5, 1.65) + realScrew(hw - 3.5, hh - 3.5, 1.65)
}

/** One connector, photo-style, centred on (0,0). */
export function realJackSVG(module: string): string {
  const f = footprint(module)
  if (f.shape === 'd') {
    switch (f.icon) {
      case 'xlrF': return dFlange(f.w, f.h, ring() + hole(-4.4, -1.4, 1.25) + hole(4.4, -1.4, 1.25) + hole(0, 4.6, 1.25) + `<rect x="-1.6" y="-9.6" width="3.2" height="1.8" rx="0.4" fill="#050505"/>` + push(-14.3))
      case 'xlr5': return dFlange(f.w, f.h, ring() + [[-4.3, -1.6], [4.3, -1.6], [0, 4.4], [-3.1, 3.2], [3.1, 3.2]].map(([x, y]) => hole(x, y, 0.9)).join('') + push(-14.3))
      case 'xlrM': return dFlange(f.w, f.h, `<circle r="10.4" fill="url(#rf-chrome)"/><circle r="8.6" fill="url(#rf-body)"/>` + pin(-4.4, -1.4, 0.95) + pin(4.4, -1.4, 0.95) + pin(0, 4.6, 0.95) + `<rect x="-1.4" y="-8.8" width="2.8" height="1.6" fill="#999"/>`)
      case 'ethercon': return dFlange(f.w, f.h, ring() + rj45(0, 0.4) + push(-14.3))
      case 'oc': case 'lc': return dFlange(f.w, f.h, ring() + `<rect x="-6.4" y="-3.2" width="5.4" height="6.6" rx="0.6" fill="#2563c9"/><rect x="1" y="-3.2" width="5.4" height="6.6" rx="0.6" fill="#2563c9"/><circle cx="-3.7" cy="0.1" r="1" fill="#e9eef7"/><circle cx="3.7" cy="0.1" r="1" fill="#e9eef7"/>`)
      case 'bnc': return dFlange(f.w, f.h, `<circle r="10.4" fill="url(#rf-body)"/><circle r="7.2" fill="url(#rf-chrome)" stroke="#6d7075" stroke-width="0.2"/><rect x="-6.4" y="-0.7" width="1.6" height="1.4" rx="0.3" fill="url(#rf-chrome)"/><rect x="4.8" y="-0.7" width="1.6" height="1.4" rx="0.3" fill="url(#rf-chrome)"/><circle r="4.6" fill="#2a2b2d"/><circle r="3.3" fill="#f2efe4"/><circle r="0.8" fill="url(#rf-gold)"/>`)
      case 'hdmi': return dFlange(f.w, f.h, `<rect x="-9.5" y="-6.5" width="19" height="13" rx="1.6" fill="#141517"/><path d="M -7 -2.4 L 7 -2.4 L 7 0.7 L 5.3 2.4 L -5.3 2.4 L -7 0.7 Z" fill="url(#rf-shell)" stroke="#6b6e73" stroke-width="0.15"/><path d="M -5.9 -1.5 L 5.9 -1.5 L 5.9 0.4 L 4.7 1.5 L -4.7 1.5 L -5.9 0.4 Z" fill="#050505"/><rect x="-4.8" y="-0.7" width="9.6" height="0.9" fill="#1d1d1f"/>`)
      case 'dp': return dFlange(f.w, f.h, `<rect x="-9.5" y="-6.5" width="19" height="13" rx="1.6" fill="#141517"/><path d="M -8 -2.6 L 8 -2.6 L 8 2.6 L -6.4 2.6 L -8 1 Z" fill="url(#rf-shell)" stroke="#6b6e73" stroke-width="0.15"/><path d="M -6.9 -1.6 L 6.9 -1.6 L 6.9 1.6 L -5.8 1.6 L -6.9 0.6 Z" fill="#050505"/>`)
      case 'usbA': return dFlange(f.w, f.h, `<rect x="-9.5" y="-6.5" width="19" height="13" rx="1.6" fill="#141517"/><rect x="-6.2" y="-2.4" width="12.4" height="4.8" rx="0.3" fill="url(#rf-shell)" stroke="#6b6e73" stroke-width="0.15"/><rect x="-5.4" y="-1.7" width="10.8" height="3.4" fill="#050505"/><rect x="-4.6" y="-1.7" width="9.2" height="1.6" fill="#1d6fe8"/>`)
      case 'usbB': return dFlange(f.w, f.h, `<rect x="-9.5" y="-6.5" width="19" height="13" rx="1.6" fill="#141517"/><path d="M -4.2 -3.9 L 2.8 -3.9 L 4.2 -2.5 L 4.2 3.9 L -4.2 3.9 Z" fill="url(#rf-shell)"/><path d="M -3.3 -3 L 2.4 -3 L 3.3 -2.1 L 3.3 3 L -3.3 3 Z" fill="#050505"/><rect x="-2" y="-1.6" width="4" height="3.2" fill="#1d6fe8"/>`)
      case 'usbC': return dFlange(f.w, f.h, `<rect x="-9.5" y="-6.5" width="19" height="13" rx="1.6" fill="#141517"/><rect x="-4.4" y="-1.5" width="8.8" height="3" rx="1.5" fill="url(#rf-shell)"/><rect x="-3.7" y="-0.9" width="7.4" height="1.8" rx="0.9" fill="#050505"/><rect x="-2.6" y="-0.3" width="5.2" height="0.6" fill="#333"/>`)
      case 'trs': return dFlange(f.w, f.h, `<circle r="10.4" fill="url(#rf-body)"/><path d="M 6.4 0 L 3.2 5.54 L -3.2 5.54 L -6.4 0 L -3.2 -5.54 L 3.2 -5.54 Z" fill="url(#rf-chrome)" stroke="#6d7075" stroke-width="0.2"/><circle r="4.4" fill="url(#rf-chrome)"/><circle r="3.2" fill="#050505"/>`)
      case 'nl4': return dFlange(f.w, f.h, `<circle r="10.4" fill="url(#rf-body)"/><circle r="9.4" fill="none" stroke="#3a3c40" stroke-width="0.5"/><circle r="5.4" fill="#0a0a0a" stroke="#45474b" stroke-width="0.3"/><rect x="-1.1" y="-8.6" width="2.2" height="3.2" fill="#050505"/><rect x="-1.1" y="5.4" width="2.2" height="3.2" fill="#050505"/><path d="M -7 -4 A 8 8 0 0 1 -4 -7" stroke="#050505" stroke-width="1.2" fill="none"/><path d="M 7 4 A 8 8 0 0 1 4 7" stroke="#050505" stroke-width="1.2" fill="none"/>`)
      case 'true1': return `<rect x="-17.7" y="-17.7" width="35.4" height="35.4" rx="2.6" fill="url(#rf-flange)" stroke="#0b0c0d" stroke-width="0.35"/>`
        + `<circle r="13" fill="url(#rf-chrome)"/><circle r="11.2" fill="#f2c200"/><circle r="9.6" fill="url(#rf-body)"/>` + [-0.5, 0.5, Math.PI].map((a) => hole(Math.sin(a) * 5.5, -Math.cos(a) * 5.5, 1.3)).join('')
        + realScrew(-14, -14, 1.7) + realScrew(14, 14, 1.7)
      case 'blankD': return dFlange(f.w, f.h)
      default: return dFlange(f.w, f.h, ring())
    }
  }
  if (f.shape === 'keystone') {
    const hw = f.w / 2, hh = f.h / 2
    const base = `<rect x="${-hw}" y="${-hh}" width="${f.w}" height="${f.h}" rx="0.8" fill="url(#rf-flange)" stroke="#0b0c0d" stroke-width="0.3"/><rect x="${-hw + 0.3}" y="${-hh + 0.3}" width="${f.w - 0.6}" height="${f.h - 0.6}" rx="0.6" fill="url(#rf-sheen)"/>`
    if (f.icon === 'rj45') return base + rj45(0, -0.5, 11, 8)
    if (f.icon === 'rca') return base + `<circle r="4.2" fill="url(#rf-chrome)"/><circle r="2.4" fill="#050505"/><circle r="1" fill="url(#rf-gold)"/>`
    if (f.icon === 'blankKs') return base
    return base + `<circle r="3.2" fill="url(#rf-chrome)"/><circle r="1.9" fill="#050505"/>`
  }
  if (f.icon === 'de9' || f.icon === 'de15') {
    // D-sub on a small plate: chrome shell, black insert, gold sockets, jack-screws.
    const rows = f.icon === 'de15' ? [[5, -2.2], [5, 0], [5, 2.2]] : [[5, -1.3], [4, 1.3]]
    let pins = ''
    for (const [k, y] of rows) for (let i = 0; i < k; i++) pins += pin((i - (k - 1) / 2) * 2.77, y, 0.5)
    return `<rect x="${-f.w / 2}" y="${-f.h / 2}" width="${f.w}" height="${f.h}" rx="1.4" fill="url(#rf-flange)" stroke="#55585e" stroke-width="0.3"/>`
      + `<path d="M -9.4 -4.9 L 9.4 -4.9 L 8.2 4.9 L -8.2 4.9 Z" fill="url(#rf-shell)" stroke="#6b6e73" stroke-width="0.2" stroke-linejoin="round"/>`
      + `<path d="M -8.2 -3.9 L 8.2 -3.9 L 7.2 3.9 L -7.2 3.9 Z" fill="#111" stroke-linejoin="round"/>` + pins
      + `<g transform="translate(-12.5 0)"><circle r="2" fill="url(#rf-chrome)"/><circle r="0.9" fill="#222"/></g><g transform="translate(12.5 0)"><circle r="2" fill="url(#rf-chrome)"/><circle r="0.9" fill="#222"/></g>`
  }
  // Everything else: the line drawing on a dark plate.
  return `<rect x="${-f.w / 2}" y="${-f.h / 2}" width="${f.w}" height="${f.h}" rx="1.5" fill="url(#rf-flange)"/><g color="#d4d6da">${jackSVG(module)}</g>`
}

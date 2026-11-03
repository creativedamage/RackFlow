import { expect, it } from 'vitest'
import { addPatchBay, BUILT_IN_PATCH_TEMPLATES, defaultPrintOptions, layoutLabels, newProject, pageToSVG, rowLetter, rowMode, setNormals } from './index'

it('strip ends carry the row letter and its normalling word; cells carry the row arrow', () => {
  const p = newProject()
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.rows.length >= 2 && x.rows[0].strip.channelCount >= 24)!
  const bay = addPatchBay(p, t, { x: 0, y: 0 })
  const b = p.patchBays.find((x) => x.id === bay.id)!
  b.cells[0].text = 'A47'
  const top = t.rows[0].id, bottom = t.rows[1].id
  expect(rowLetter(b, top)).toBe('A')
  expect(rowLetter(b, bottom)).toBe('B')
  if (!b.normals.length) return
  setNormals(b, top, 1, t.rows[0].strip.channelCount, 'full')
  setNormals(b, top, 5, 5, 'half')
  expect(rowMode(b, top)).toBe('full')
  expect(rowMode(b, bottom)).toBe('full')
  b.rowTabs = { on: true, letters: { [String(top)]: 'S' } }
  b.arrows = { [String(top)]: 'down', [String(bottom)]: 'up' }
  const svg = layoutLabels([b], defaultPrintOptions()).map(pageToSVG).join('')
  expect(svg).toContain('>S<')
  // Stacked: the arrow and the word are separate lines under the letter.
  expect(svg).toContain('>▼<')
  expect(svg).toContain('>▲<')
  expect(svg).toContain('>NORMAL<')
  expect(svg.includes('▼ NORMAL')).toBe(false)
  expect(svg).toContain('>A47<')
  // only the odd half-normalled channel still gets a symbol; full is said once at the end
  expect((svg.match(/>↓</g) ?? []).length).toBe(1)
  expect(svg.includes('>↕<')).toBe(false)
})

it('arrows sit on the jack side: under the text on top rows, above it on bottom rows', () => {
  const p = newProject()
  const t = BUILT_IN_PATCH_TEMPLATES.find((x) => x.rows.length >= 2)!
  const bay = addPatchBay(p, t, { x: 0, y: 0 })
  const b = p.patchBays.find((x) => x.id === bay.id)!
  const top = t.rows[0].id, bottom = t.rows[1].id
  for (const c of b.cells) if (c.channel === 1) c.text = c.row === top ? 'TOP1' : 'BOT1'
  b.arrows = { [String(top)]: 'down', [String(bottom)]: 'up' }
  const items = layoutLabels([b], defaultPrintOptions())[0].items.filter((i) => i.t === 'text') as { lines: string[]; r: { x: number; y: number } }[]
  const at = (s: string) => items.find((i) => i.lines.includes(s))!
  const near = (g: string, ref: { r: { x: number; y: number } }) => items.filter((i) => i.lines[0] === g).sort((a, c) => Math.hypot(a.r.x - ref.r.x, a.r.y - ref.r.y) - Math.hypot(c.r.x - ref.r.x, c.r.y - ref.r.y))[0]
  const tTop = at('TOP1'), tBot = at('BOT1')
  expect(near('▼', tTop).r.y).toBeGreaterThan(tTop.r.y)
  expect(near('▲', tBot).r.y).toBeLessThan(tBot.r.y)
})

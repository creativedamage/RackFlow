import { expect, it } from 'vitest'
import { CAP_PRESETS, layoutCaps, newCapSheet, newProject, pageToSVG, resizeCapGrid, STOCKS } from './index'

it('button cap sheets print at 1:1 and keep text when the grid changes', () => {
  const p = newProject()
  const s = newCapSheet(p, CAP_PRESETS[0])
  s.texts[0] = 'CAM 1'; s.texts[1] = 'MEDIA\nPLAY 1'
  resizeCapGrid(s, 30, 2)
  expect(s.texts.length).toBe(60)
  expect(s.texts[0]).toBe('CAM 1')
  const pages = layoutCaps([s], { stock: STOCKS[0], landscape: true, cutMarks: true, captions: true, outlines: true })
  expect(pages.length).toBeGreaterThan(0)
  const svg = pages.map(pageToSVG).join('')
  expect(svg).toContain('CAM 1')
  expect(svg).toContain('PLAY 1')
  // every cap outline is 13 mm wide
  const caps = pages.flatMap((pg) => pg.items).filter((i) => i.t === 'rect' && i.stroke === '#9a9a9a')
  expect(caps.length).toBe(60)
  expect(caps.every((c) => c.t === 'rect' && Math.abs(c.r.w - 13) < 1e-9)).toBe(true)
})

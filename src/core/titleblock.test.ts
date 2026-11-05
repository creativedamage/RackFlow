import { describe, expect, it } from 'vitest'
import { blankFreeTitleBlock, defaultTitleBlock, fieldsToItems, fillVariables, newProject, newSheet } from './index'

describe('title block builder', () => {
  it('fills {variables} from the project and sheet', () => {
    const p = newProject('Cool Church'); p.info.client = 'Cool Church Inc'
    const t = blankFreeTitleBlock()
    const s = fillVariables('{project} / {client} / {sheet} / {sheetOf} / {unknown}', p, { drawing: 'X', sheet: 'AV101', rev: 'A', date: 'today', page: 2, pages: 5 }, t)
    expect(s).toBe('Cool Church / Cool Church Inc / AV101 / 2 OF 5 / {unknown}')
  })
  it('prints a free-form block on the bottom, left or right', () => {
    for (const side of ['bottom', 'left', 'right'] as const) {
      const p = newProject('P'); p.titleBlock = blankFreeTitleBlock(side)
      const { svg, area } = newSheet(p, { sheet: 'ansiB', titleBlock: true, title: 'SIGNAL FLOW' }, 1, 2, 'AUDIO', 'AV101')
      const out = svg.toString()
      expect(out).toContain('AV101')
      if (side === 'left') expect(area.x).toBeGreaterThan(40)
      if (side === 'right') expect(area.x + area.w).toBeLessThan(431.8 - 40)
      if (side !== 'bottom') expect(out).toMatch(/rotate\((90|270)/)
    }
  })
  it('turns a box-and-row title block into editable items', () => {
    const items = fieldsToItems(defaultTitleBlock())
    expect(items.some((i) => i.kind === 'text' && i.text === '{project}')).toBe(true)
    expect(items.some((i) => i.kind === 'line')).toBe(true)
  })
})

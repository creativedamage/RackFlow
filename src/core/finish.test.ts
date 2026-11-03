import { describe, expect, it } from 'vitest'
import { addEquipment, FINISHES, finishOf, makePlateProduct, newProject, withLayout } from './index'
import { fabricationSheets } from './drawing/fabrication'
import type { PlateSpec, Project } from './model'

describe('panel finishes', () => {
  it('offers black powder-coat and black anodized', () => {
    expect(FINISHES.map((f) => f.label)).toEqual(expect.arrayContaining(['Black powder-coat', 'Black anodized']))
    expect(finishOf('blackAnodized').dark).toBe(true)
    expect(finishOf('white').dark).toBe(false)
  })

  it('calls out the finish and engraving fill for the fabricator', () => {
    const spec = withLayout({ kind: 'wallBox', style: '8" x 8"', inserts: [{ module: 'xlrF', count: 1, rear: 'idcPunchdown', pid: 'xlrF.1', label: 'MIC 1' }] } as PlateSpec)
    spec.layout!.finish = 'blackAnodized'
    const p: Project = newProject()
    addEquipment(p, makePlateProduct(spec, { model: 'Stage box' }), { x: 0, y: 0 })
    const svg = fabricationSheets(p).join('')
    expect(svg).toContain('BLACK ANODIZED ALUMINUM, TYPE II, MATTE')
    expect(svg).toContain('FILLED WHITE')
  })
})

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

describe('per-box fabrication notes', () => {
  it('starts automatic, then prints the box’s own notes and heading', async () => {
    const { fabricationNotes } = await import('./drawing/fabrication')
    const spec = withLayout({ kind: 'wallBox', style: '8" x 8"', inserts: [{ module: 'xlrF', count: 1, rear: 'idcPunchdown', pid: 'xlrF.1' }] } as PlateSpec)
    const p: Project = newProject()
    const e = addEquipment(p, makePlateProduct(spec, { model: 'Stage box' }), { x: 0, y: 0 })
    expect(fabricationNotes(p, e.id)[0]).toMatch(/^TAG: /)
    e.fabNotes = ['Mount 600 mm above finished floor', 'Supply with stainless hardware']
    e.fabNotesTitle = 'Install notes'
    const svg = fabricationSheets(p, { ...{ sheet: 'ansiB', titleBlock: true, title: 'X', units: 'in' }, only: [e.id] })[0]
    expect(svg).toContain('INSTALL NOTES')
    expect(svg).toContain('1. Mount 600 mm above finished floor')
    expect(svg).not.toContain('MARK EACH PANEL ON THE BACK')
  })
})

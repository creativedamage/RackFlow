import { describe, expect, it } from 'vitest'
import { addCluster, addEquipment, BUILT_IN_PRODUCTS, clusterMembership, clusterShownIn, defaultSchematic, deleteCluster, newProject, schematicSheets, zoneMode } from './index'

const setup = () => {
  const p = newProject('G')
  const prod = BUILT_IN_PRODUCTS.find((x) => x.ports.length > 2 && !x.plate)!
  const a = addEquipment(p, prod, { x: 0, y: 0 }), b = addEquipment(p, prod, { x: 400, y: 0 }), c = addEquipment(p, prod, { x: 1400, y: 0 })
  a.room = 'Studio A'; b.room = 'Studio A'; c.room = 'Booth'
  return { p, a, b, c }
}

describe('device groups (drawn boxes)', () => {
  it('devices inside a box are in its group; the smallest box wins', () => {
    const { p, a, b, c } = setup()
    const g = addCluster(p, { x: -50, y: -50, w: 800, h: 600 }, null, 'FOH Rack')
    const m = clusterMembership(p, p.equipment, { page: null, view: null }, new Set())
    expect(m.get(a.id)).toBe(g.id)
    expect(m.get(b.id)).toBe(g.id)
    expect(m.has(c.id)).toBe(false)
    const inner = addCluster(p, { x: 350, y: -40, w: 360, h: 500 }, null, 'Amp')
    expect(clusterMembership(p, p.equipment, { page: null, view: null }, new Set()).get(b.id)).toBe(inner.id)
    deleteCluster(p, inner.id); deleteCluster(p, g.id)
    expect(p.clusters).toBeUndefined()
  })

  it('a box belongs to the page or view it was drawn on', () => {
    const views = new Set(['v1'])
    const onPage = { id: 'x', name: 'x', scope: 'pg1', x: 0, y: 0, w: 10, h: 10 }
    expect(clusterShownIn(onPage, { page: 'pg1', view: null }, views)).toBe(true)
    expect(clusterShownIn(onPage, { page: null, view: null }, views)).toBe(true)
    expect(clusterShownIn(onPage, { page: 'pg2', view: null }, views)).toBe(false)
    expect(clusterShownIn(onPage, { page: null, view: 'v1' }, views)).toBe(false)
    const inView = { ...onPage, scope: 'v1' }
    expect(clusterShownIn(inView, { page: null, view: 'v1' }, views)).toBe(true)
    expect(clusterShownIn(inView, { page: null, view: null }, views)).toBe(false)
  })

  it('prints group boxes instead of rooms when groups are used, with a choice', () => {
    const { p } = setup()
    expect(zoneMode(p, defaultSchematic(p))).toBe('rooms')
    addCluster(p, { x: -50, y: -50, w: 800, h: 600 }, null, 'FOH Rack')
    expect(zoneMode(p, defaultSchematic(p))).toBe('groups')
    const groups = schematicSheets(p, defaultSchematic(p)).join('')
    expect(groups).toContain('FOH RACK')
    expect(groups).not.toContain('STUDIO A')
    const rooms = schematicSheets(p, { ...defaultSchematic(p), zones: 'rooms' }).join('')
    expect(rooms).toContain('STUDIO A')
    expect(rooms).not.toContain('FOH RACK')
    expect(schematicSheets(p, { ...defaultSchematic(p), zones: 'none' }).join('')).not.toContain('FOH RACK')
  })
})

import { describe, expect, it } from 'vitest'
import { addEquipment, BUILT_IN_PRODUCTS, clustersOf, defaultSchematic, deleteCluster, newCluster, newProject, schematicSheets, setCluster, zoneMode } from './index'

const setup = () => {
  const p = newProject('G')
  const prod = BUILT_IN_PRODUCTS.find((x) => x.ports.length > 2 && !x.plate)!
  const a = addEquipment(p, prod, { x: 0, y: 0 }), b = addEquipment(p, prod, { x: 400, y: 0 }), c = addEquipment(p, prod, { x: 900, y: 0 })
  a.room = 'Studio A'; b.room = 'Studio A'; c.room = 'Booth'
  return { p, a, b, c }
}

describe('device groups', () => {
  it('make, move between, and remove groups; empty groups go away', () => {
    const { p, a, b, c } = setup()
    const g = newCluster(p, [a.id, b.id], 'FOH Rack')
    expect(clustersOf(p).map((x) => x.name)).toEqual(['FOH Rack'])
    expect([a.cluster, b.cluster]).toEqual([g.id, g.id])
    const h = newCluster(p, [c.id])
    expect(h.name).toBe('Group 2')
    setCluster(p, [c.id], null)
    expect(clustersOf(p).map((x) => x.id)).toEqual([g.id])
    deleteCluster(p, g.id)
    expect(a.cluster).toBeUndefined()
    expect(p.clusters).toEqual([])
  })

  it('prints group boxes instead of rooms when groups are used, with a choice', () => {
    const { p, a, b } = setup()
    expect(zoneMode(p, defaultSchematic(p))).toBe('rooms')
    newCluster(p, [a.id, b.id], 'FOH Rack')
    expect(zoneMode(p, defaultSchematic(p))).toBe('groups')
    const groups = schematicSheets(p, defaultSchematic(p)).join('')
    expect(groups).toContain('FOH RACK')
    expect(groups).not.toContain('STUDIO A')
    const rooms = schematicSheets(p, { ...defaultSchematic(p), zones: 'rooms' }).join('')
    expect(rooms).toContain('STUDIO A')
    expect(rooms).not.toContain('FOH RACK')
    const none = schematicSheets(p, { ...defaultSchematic(p), zones: 'none' }).join('')
    expect(none).not.toContain('FOH RACK')
  })
})

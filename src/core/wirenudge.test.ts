import { describe, expect, it } from 'vitest'
import { nudgeWires, type Pt } from './wireroute'

const vert = (pts: Pt[]) => pts.slice(1).map((p, i) => [pts[i], p] as const).filter(([a, b]) => a.x === b.x && a.y !== b.y)

describe('nudgeWires', () => {
  it('pulls wires that share a vertical run onto separate tracks without crossings', () => {
    const paths = new Map<string, Pt[]>([
      ['a', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 120 }, { x: 300, y: 120 }]],
      ['b', [{ x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 160 }, { x: 300, y: 160 }]],
      ['c', [{ x: 0, y: 80 }, { x: 100, y: 80 }, { x: 100, y: 200 }, { x: 300, y: 200 }]],
    ])
    const out = nudgeWires(paths)
    const xs = ['a', 'b', 'c'].map((k) => vert(out.get(k)!)[0][0].x)
    expect(new Set(xs).size).toBe(3)
    // Lower start → further left, so the nested Zs don't cross.
    expect(xs[2]).toBeLessThan(xs[1]); expect(xs[1]).toBeLessThan(xs[0])
    // Ports never move.
    expect(out.get('a')![0]).toEqual({ x: 0, y: 0 }); expect(out.get('a')![3]).toEqual({ x: 300, y: 120 })
  })
  it('leaves wires alone when their runs do not overlap', () => {
    const paths = new Map<string, Pt[]>([
      ['a', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 300, y: 50 }]],
      ['b', [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 150 }, { x: 300, y: 150 }]],
    ])
    const out = nudgeWires(paths)
    expect(vert(out.get('a')!)[0][0].x).toBe(100); expect(vert(out.get('b')!)[0][0].x).toBe(100)
  })
  it('separates shared horizontal detours', () => {
    const u = (y0: number, y1: number, sx: number, tx: number): Pt[] => [{ x: sx, y: y0 }, { x: sx + 26, y: y0 }, { x: sx + 26, y: 500 }, { x: tx - 26, y: 500 }, { x: tx - 26, y: y1 }, { x: tx, y: y1 }]
    const out = nudgeWires(new Map([['a', u(0, 10, 0, 400)], ['b', u(20, 30, 50, 350)]]))
    expect(out.get('a')![2].y).not.toBe(out.get('b')![2].y)
  })
})

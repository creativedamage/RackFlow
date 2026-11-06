import { describe, expect, it } from 'vitest'
import { buildInventory, matchInventory, parseCSV, sheetCsvUrl, parseMoney, notCsvReason } from './inventory'
import { addEquipment, newProject, BUILT_IN_PRODUCTS } from './index'

describe('inventory sheet', () => {
  it('turns share links into CSV export links', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing#gid=42'))
      .toBe('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=csv&gid=42')
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml')).toContain('/pub?output=csv')
    expect(() => sheetCsvUrl('hello')).toThrow()
  })
  it('parses quoted CSV and money', () => {
    expect(parseCSV('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']])
    expect(parseMoney('$1,299.50')).toBe(1299.5)
    expect(parseMoney('n/a')).toBeNull()
    expect(notCsvReason('<!DOCTYPE html><html>accounts.google.com')).toMatch(/shared/)
  })
  it('finds the header under a title row and matches diagram gear', () => {
    const p = newProject()
    const prod = BUILT_IN_PRODUCTS.find((x) => x.manufacturer === 'Yamaha') ?? BUILT_IN_PRODUCTS[0]
    addEquipment(p, prod, { x: 0, y: 0 }); addEquipment(p, prod, { x: 0, y: 0 })
    const csv = `My Inventory,,,\nBrand,Model,Qty,Price\n${prod.manufacturer},${prod.model},5,"$1,000"\nShure,SM58,20,$99\n`
    const inv = buildInventory('x', csv)
    expect(inv.map.make).toBe(0); expect(inv.map.model).toBe(1); expect(inv.map.price).toBe(3)
    const r = matchInventory(p, inv)
    expect(r.lines[0]).toMatchObject({ qty: 2, match: 'exact', price: 1000, stock: 5 })
    expect(r.total).toBe(2000)
    expect(r.unused).toEqual([1])
  })
})

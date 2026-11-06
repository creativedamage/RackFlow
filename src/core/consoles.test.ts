import { expect, it } from 'vitest'
import { BUILT_IN_PRODUCTS, ProductLibrary } from './index'

it('finds Hedgehog and Vista consoles by name', () => {
  const lib = new ProductLibrary(BUILT_IN_PRODUCTS, [])
  for (const q of ['hedgehog', 'hedge hog', 'vista ex', 'chroma-q vista', 'flex hog', 'tour hog'])
    expect(lib.search({ text: q, category: null, domain: null }).length, q).toBeGreaterThan(0)
  const tour = lib.search({ text: 'tour hog', category: null, domain: null })[0]
  expect(tour.ports.some((p) => p.connector === 'din5')).toBe(true)
  expect(tour.ports.some((p) => p.signals.includes('ltc'))).toBe(true)
})

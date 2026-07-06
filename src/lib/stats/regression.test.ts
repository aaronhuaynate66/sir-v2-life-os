import { describe, it, expect } from 'vitest'
import { linreg, predict, median } from './regression'

describe('linreg (OLS)', () => {
  it('recta perfecta y = 2x + 1 → slope 2, intercept 1, r2 1', () => {
    const r = linreg([0, 1, 2, 3], [1, 3, 5, 7])!
    expect(r.slope).toBeCloseTo(2)
    expect(r.intercept).toBeCloseTo(1)
    expect(r.r2).toBeCloseTo(1)
    expect(predict(r, 4)).toBeCloseTo(9)
  })
  it('pendiente negativa (enfriándose)', () => {
    expect(linreg([0, 1, 2, 3], [10, 7, 5, 2])!.slope).toBeLessThan(0)
  })
  it('null con <2 puntos o xs constante', () => {
    expect(linreg([1], [1])).toBeNull()
    expect(linreg([2, 2, 2], [1, 2, 3])).toBeNull()
  })
})

describe('median', () => {
  it('impar y par', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})

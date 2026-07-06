import { describe, it, expect } from 'vitest'
import { detectChangePoint } from './changepoint'

describe('detectChangePoint', () => {
  it('detecta una caída clara', () => {
    const cp = detectChangePoint([10, 9, 11, 10, 2, 1, 2, 1])!
    expect(cp).not.toBeNull()
    expect(cp.index).toBe(4)
    expect(cp.delta).toBeLessThan(0)
    expect(cp.beforeAvg).toBeGreaterThan(cp.afterAvg)
  })

  it('detecta una subida clara', () => {
    const cp = detectChangePoint([1, 2, 1, 2, 9, 10, 11, 9])!
    expect(cp.delta).toBeGreaterThan(0)
  })

  it('serie plana o ruido leve → null', () => {
    expect(detectChangePoint([5, 5, 5, 5, 5, 5])).toBeNull()
    expect(detectChangePoint([5, 6, 4, 5, 6, 4])).toBeNull()
  })

  it('serie corta → null', () => {
    expect(detectChangePoint([1, 9])).toBeNull()
  })
})

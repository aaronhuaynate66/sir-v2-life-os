import { describe, it, expect } from 'vitest'
import { estimateCostUSD } from './usage'

describe('estimateCostUSD', () => {
  it('sonnet por defecto', () => {
    expect(estimateCostUSD('claude-sonnet-4-5', 1_000_000, 0)).toBeCloseTo(3, 5)
    expect(estimateCostUSD('claude-sonnet-4-5', 0, 1_000_000)).toBeCloseTo(15, 5)
  })
  it('haiku más barato', () => {
    expect(estimateCostUSD('claude-haiku-4-5', 1_000_000, 0)).toBeCloseTo(0.8, 5)
  })
  it('modelo desconocido → sonnet', () => {
    expect(estimateCostUSD('mistery', 1_000_000, 0)).toBeCloseTo(3, 5)
  })
})

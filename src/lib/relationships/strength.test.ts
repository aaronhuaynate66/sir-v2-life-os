import { describe, it, expect } from 'vitest'
import { relationStrength } from './strength'

describe('relationStrength', () => {
  it('bucketea por umbrales', () => {
    expect(relationStrength(10)).toBe('alta')
    expect(relationStrength(7)).toBe('alta')
    expect(relationStrength(6)).toBe('media')
    expect(relationStrength(4)).toBe('media')
    expect(relationStrength(3)).toBe('baja')
    expect(relationStrength(1)).toBe('baja')
  })
  it('robusto ante no-finitos', () => {
    expect(relationStrength(NaN)).toBe('baja')
    expect(relationStrength(undefined as unknown as number)).toBe('baja')
  })
})

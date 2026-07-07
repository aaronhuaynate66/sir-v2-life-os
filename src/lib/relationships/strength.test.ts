import { describe, it, expect } from 'vitest'
import { relationStrength } from './strength'

describe('relationStrength (por capa de Dunbar)', () => {
  it('íntimo y cercano → fuerte', () => {
    expect(relationStrength('inner_circle')).toBe('alta')
    expect(relationStrength('close')).toBe('alta')
  })
  it('red → media', () => {
    expect(relationStrength('network')).toBe('media')
  })
  it('periférico → débil', () => {
    expect(relationStrength('peripheral')).toBe('baja')
  })
})

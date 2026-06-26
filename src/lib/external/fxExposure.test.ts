import { describe, it, expect } from 'vitest'
import { computeFxSignal, penImpact } from './fxExposure'
describe('computeFxSignal', () => {
  it('sin baseline → none', () => { expect(computeFxSignal(3.8, null).direction).toBe('none') })
  it('subió', () => { const s = computeFxSignal(3.84, 3.76); expect(s.direction).toBe('up'); expect(s.deltaPct).toBeCloseTo(2.13, 1) })
  it('bajó', () => { expect(computeFxSignal(3.70, 3.76).direction).toBe('down') })
  it('estable (<0.5%)', () => { expect(computeFxSignal(3.77, 3.76).direction).toBe('flat') })
})
describe('penImpact', () => {
  it('US$2000 con dólar de 3.76→3.84 ≈ +160 PEN', () => { expect(penImpact(2000, 3.84, 3.76)).toBeCloseTo(160, 0) })
})

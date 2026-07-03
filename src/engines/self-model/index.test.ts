// SIR V2 — Tests del modelo del self dinámico (A7).

import { describe, it, expect } from 'vitest'
import { deriveDynamicSelf, type SelfSignal } from './index'

const sig = (label: string, direction: SelfSignal['direction'], goodWhenRising = true): SelfSignal => ({ label, direction, goodWhenRising })

describe('deriveDynamicSelf', () => {
  it('mayoría mejorando → momentum rising', () => {
    const s = deriveDynamicSelf([sig('Energía', 'rising'), sig('Ánimo', 'rising'), sig('Sueño', 'flat')])
    expect(s.momentum).toBe('rising')
    expect(s.improving).toEqual(['Energía', 'Ánimo'])
    expect(s.summary).toContain('en subida')
  })

  it('FC en reposo subiendo cuenta como empeora (goodWhenRising=false)', () => {
    const s = deriveDynamicSelf([sig('FC reposo', 'rising', false)])
    expect(s.worsening).toEqual(['FC reposo'])
    expect(s.momentum).toBe('declining')
  })

  it('la tendencia de paz (A6) suma un voto', () => {
    const balanced = [sig('Energía', 'rising'), sig('Sueño', 'falling')] // net 0
    expect(deriveDynamicSelf(balanced, 'improving').momentum).toBe('rising')
    expect(deriveDynamicSelf(balanced, 'declining').momentum).toBe('declining')
    expect(deriveDynamicSelf(balanced, 'stable').momentum).toBe('stable')
  })

  it('sin señales ni paz → insufficient', () => {
    const s = deriveDynamicSelf([])
    expect(s.momentum).toBe('insufficient')
    expect(s.summary).toContain('suficiente')
  })

  it('flat no cuenta ni para un lado ni para el otro', () => {
    const s = deriveDynamicSelf([sig('Ánimo', 'flat'), sig('Energía', 'flat')])
    expect(s.improving).toEqual([])
    expect(s.worsening).toEqual([])
    expect(s.momentum).toBe('stable')
  })
})

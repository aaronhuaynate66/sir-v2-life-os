// SIR V2 — Tests del próximo paso mínimo + tamaño por energía (12·M2 + M3).

import { describe, it, expect } from 'vitest'
import { sizeNextStep } from './nextStep'

describe('sizeNextStep', () => {
  it('paso chico con energía ok → hacelo tal cual', () => {
    const r = sizeNextStep({ title: 'Enviar el mail', effort: 'S', todayEnergy: 8 })
    expect(r.downsized).toBe(false)
    expect(r.suggestion).toMatch(/abarcable|tachalo/i)
  })

  it('paso L con energía ok → partirlo en un bloque de arranque', () => {
    const r = sizeNextStep({ title: 'Escribir la propuesta', effort: 'L', todayEnergy: 8 })
    expect(r.downsized).toBe(true)
    expect(r.reason).toBe('big_effort')
    expect(r.suggestion).toMatch(/10-15 min|partilo/i)
  })

  it('energía baja + esfuerzo M/L → versión mínima, cuidar el ritmo', () => {
    const r = sizeNextStep({ title: 'Entrenar', effort: 'M', todayEnergy: 3 })
    expect(r.downsized).toBe(true)
    expect(r.reason).toBe('low_energy')
    expect(r.suggestion).toMatch(/energía está baja|10 min|ritmo/i)
  })

  it('NUNCA propone el L con energía baja (lo achica)', () => {
    const r = sizeNextStep({ title: 'Maratón de estudio', effort: 'L', todayEnergy: 2 })
    expect(r.reason).toBe('low_energy')
  })

  it('sin energía del día → no la usa (solo dimensiona por esfuerzo)', () => {
    const r = sizeNextStep({ title: 'Tarea', effort: 'S', todayEnergy: null })
    expect(r.downsized).toBe(false)
  })
})

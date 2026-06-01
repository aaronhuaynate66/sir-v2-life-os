import { describe, it, expect } from 'vitest'
import { assessRecovery, type RecoveryInput } from './index'

const HEALTHY: RecoveryInput = {
  weeklyTier: 'A',
  avgSleepHours: 7.5,
  avgStress: 3,
  avgEnergy: 8,
  nonEssentialShare: 15,
}

describe('assessRecovery', () => {
  it('semana sana → inactivo, sin triggers', () => {
    const r = assessRecovery(HEALTHY)
    expect(r.active).toBe(false)
    expect(r.severity).toBe('none')
    expect(r.triggers).toEqual([])
    expect(r.priorities).toEqual([])
  })

  it('un solo trigger (mal sueño) → soft', () => {
    const r = assessRecovery({ ...HEALTHY, avgSleepHours: 5.2 })
    expect(r.severity).toBe('soft')
    expect(r.active).toBe(true)
    expect(r.triggers).toEqual(['bad_sleep'])
    expect(r.priorities[0]).toContain('Dormí')
    expect(r.priorities[r.priorities.length - 1]).toContain('Un paso')
  })

  it('dos triggers → soft', () => {
    const r = assessRecovery({ ...HEALTHY, avgSleepHours: 5, avgStress: 8 })
    expect(r.triggers.sort()).toEqual(['bad_sleep', 'high_stress'])
    expect(r.severity).toBe('soft')
  })

  it('tres triggers → hard', () => {
    const r = assessRecovery({ ...HEALTHY, avgSleepHours: 5, avgStress: 8, avgEnergy: 2 })
    expect(r.triggers).toHaveLength(3)
    expect(r.severity).toBe('hard')
  })

  it('weekly tier D fuerza hard aunque sea el único trigger', () => {
    const r = assessRecovery({ ...HEALTHY, weeklyTier: 'D' })
    expect(r.triggers).toEqual(['weak_week'])
    expect(r.severity).toBe('hard')
    expect(r.active).toBe(true)
  })

  it('gasto impulsivo dispara con >40%', () => {
    expect(assessRecovery({ ...HEALTHY, nonEssentialShare: 45 }).triggers).toContain('impulsive_spend')
    expect(assessRecovery({ ...HEALTHY, nonEssentialShare: 40 }).triggers).not.toContain('impulsive_spend')
  })

  it('null = sin datos → no dispara ese trigger', () => {
    const r = assessRecovery({
      weeklyTier: 'A',
      avgSleepHours: null,
      avgStress: null,
      avgEnergy: null,
      nonEssentialShare: null,
    })
    expect(r.active).toBe(false)
    expect(r.triggers).toEqual([])
  })

  it('umbrales límite: estrés exactamente 7 dispara, energía exactamente 3 dispara', () => {
    expect(assessRecovery({ ...HEALTHY, avgStress: 7 }).triggers).toContain('high_stress')
    expect(assessRecovery({ ...HEALTHY, avgEnergy: 3 }).triggers).toContain('low_energy')
    // sueño: 6 NO dispara (umbral es < 6)
    expect(assessRecovery({ ...HEALTHY, avgSleepHours: 6 }).triggers).not.toContain('bad_sleep')
  })

  it('prioridades en orden canónico (sueño antes que energía antes que estrés)', () => {
    const r = assessRecovery({ ...HEALTHY, avgSleepHours: 5, avgStress: 9, avgEnergy: 2 })
    expect(r.priorities[0]).toContain('Dormí')
    expect(r.priorities[1]).toContain('Movimiento')
    expect(r.priorities[2]).toContain('UNA sola cosa')
  })
})

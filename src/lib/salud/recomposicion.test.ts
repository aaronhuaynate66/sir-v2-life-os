import { describe, it, expect } from 'vitest'
import { computeRecomp, explainRecomp, recompBriefLine, REALISTIC_MUSCLE_GAIN_PER_MONTH } from './recomposicion'

// El caso real de Aaron al 25-jul-2026 (báscula) contra su categoría 80+.
const AARON = { weightKg: 81.4, bodyFatPercent: 25.2, leanMassKg: 60.9, bmrKcal: 1739 }
const MUNDIAL = { minWeightKg: 81, targetFatPercent: 20, weeksAvailable: 15 }

describe('computeRecomp — el caso de Aaron', () => {
  const plan = computeRecomp(AARON, MUNDIAL)

  it('separa magro y grasa', () => {
    expect(plan.leanKg).toBe(60.9)
    expect(plan.fatKg).toBeCloseTo(20.5, 0)
  })

  it('el piso de grasa a 81 kg es ~24.8%: por debajo NO se puede sin músculo', () => {
    expect(plan.floorFatPercentAtMinWeight).toBeCloseTo(24.8, 0)
    // Y hoy está en 25.2% → prácticamente en ese piso.
    expect(plan.floorFatPercentAtMinWeight).toBeLessThan(AARON.bodyFatPercent)
  })

  it('llegar a 20% sin bajar de 81 kg exige ganar músculo', () => {
    expect(plan.leanNeededKg).toBeCloseTo(64.8, 0)
    expect(plan.muscleGapKg).toBeCloseTo(3.9, 0)
  })

  it('en 15 semanas ese ritmo NO es realista y lo dice', () => {
    expect(plan.neededMusclePerMonth).toBeGreaterThan(REALISTIC_MUSCLE_GAIN_PER_MONTH)
    expect(plan.feasible).toBe(false)
  })

  it('solo perder grasa lo dejaría BAJO su categoría', () => {
    expect(plan.weightIfOnlyFatLoss).toBeCloseTo(76.1, 0)
    expect(plan.weightIfOnlyFatLoss).toBeLessThan(MUNDIAL.minWeightKg)
  })

  it('proteína sobre masa magra y mantenimiento sobre TMB', () => {
    expect(plan.proteinGramsPerDay).toBe(122)
    expect(plan.maintenanceKcal).toBe(Math.round(1739 * 1.7))
  })
})

describe('computeRecomp — otros escenarios', () => {
  it('si ya tiene el magro suficiente, no pide ganar nada', () => {
    const plan = computeRecomp({ weightKg: 82, bodyFatPercent: 18, leanMassKg: 67.2 }, MUNDIAL)
    expect(plan.muscleGapKg).toBe(0)
  })

  it('con plazo largo el mismo objetivo sí es alcanzable', () => {
    const plan = computeRecomp(AARON, { ...MUNDIAL, weeksAvailable: 52 })
    expect(plan.neededMusclePerMonth).toBeLessThanOrEqual(REALISTIC_MUSCLE_GAIN_PER_MONTH)
    expect(plan.feasible).toBe(true)
  })

  it('deriva la masa magra si la báscula no la da', () => {
    const plan = computeRecomp({ weightKg: 81.4, bodyFatPercent: 25.2 }, MUNDIAL)
    expect(plan.leanKg).toBeCloseTo(60.9, 0)
  })

  it('sin TMB no inventa calorías', () => {
    const plan = computeRecomp({ weightKg: 81.4, bodyFatPercent: 25.2 }, MUNDIAL)
    expect(plan.maintenanceKcal).toBeNull()
  })
})

describe('explainRecomp', () => {
  const plan = computeRecomp(AARON, MUNDIAL)
  const lines = explainRecomp(plan, MUNDIAL, AARON.bodyFatPercent)

  it('dice el piso aritmético con todas las letras', () => {
    expect(lines.join(' ')).toContain('no puede bajar de 24.8%')
    expect(lines.join(' ')).toContain('aritmética, no disciplina')
  })

  it('advierte que solo perder grasa lo saca de categoría', () => {
    expect(lines.join(' ')).toMatch(/76\.1 kg/)
  })

  it('cuando no es realista, lo dice en vez de prometer', () => {
    expect(lines.join(' ')).toContain('No llegas')
  })

  it('da proteína y calorías concretas', () => {
    expect(lines.join(' ')).toContain('122 g de proteína')
    expect(lines.join(' ')).toContain('2956 kcal')
  })
})

describe('recompBriefLine', () => {
  it('en una línea: cuánto músculo falta y cuánta proteína', () => {
    const line = recompBriefLine(computeRecomp(AARON, MUNDIAL), MUNDIAL)
    expect(line).toContain('GANAR 3.9 kg de músculo')
    expect(line).toContain('122 g de proteína')
    expect(line).toContain('más de lo realista')
  })

  it('si no falta músculo, solo recuerda sostener', () => {
    const line = recompBriefLine(computeRecomp({ weightKg: 82, bodyFatPercent: 18, leanMassKg: 67.2 }, MUNDIAL), MUNDIAL)
    expect(line).toContain('Sostén el peso')
  })
})

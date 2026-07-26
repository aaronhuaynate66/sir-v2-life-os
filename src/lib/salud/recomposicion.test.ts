import { describe, it, expect } from 'vitest'
import {
  computeRecomp, explainRecomp, recompBriefLine, REALISTIC_MUSCLE_GAIN_PER_MONTH,
  partitionChange, explainComposition, type CompositionPoint,
} from './recomposicion'

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

describe('partitionChange — ¿grasa o músculo?', () => {
  const NOW = new Date('2026-07-25T12:00:00Z')
  const p = (day: string, weightKg: number, bodyFatPercent: number): CompositionPoint => ({ day, weightKg, bodyFatPercent })

  it('el caso REAL de Aaron: baja 0.8 kg y casi la mitad es magro', () => {
    // Primeras y últimas lecturas reales del período (18-may → 25-jul).
    const c = partitionChange([p('2026-05-18', 82.2, 25.5), p('2026-07-25', 81.4, 25.2)], 90, NOW)!
    expect(c.deltaWeightKg).toBeCloseTo(-0.8, 1)
    expect(c.deltaLeanKg).toBeLessThan(0)
    expect(c.verdict).toBe('perdiendo_musculo')
    expect(c.fatShare).toBeLessThan(0.7) // buena parte NO fue grasa
  })

  it('recomposición de libro: mismo peso, menos grasa, más músculo', () => {
    const c = partitionChange([p('2026-06-01', 81, 26), p('2026-07-25', 81, 23)], 90, NOW)!
    expect(c.verdict).toBe('recomponiendo')
    expect(c.deltaLeanKg).toBeGreaterThan(0)
    expect(c.deltaFatKg).toBeLessThan(0)
  })

  it('subir peso ganando magro no es lo mismo que engordar', () => {
    expect(partitionChange([p('2026-06-01', 80, 25), p('2026-07-25', 82, 24)], 90, NOW)!.verdict).toBe('recomponiendo')
    // Sube 2.5 kg con el magro clavado en 60.8 → todo fue grasa.
    expect(partitionChange([p('2026-06-01', 80, 24), p('2026-07-25', 82.5, 26.3)], 90, NOW)!.verdict).toBe('ganando_grasa')
  })

  it('perder magro manda sobre todo lo demás, aunque además engorde', () => {
    // Sube peso, sube grasa Y baja el magro: lo grave es lo último.
    const c = partitionChange([p('2026-06-01', 80, 24), p('2026-07-25', 82.5, 27)], 90, NOW)!
    expect(c.deltaFatKg).toBeGreaterThan(0)
    expect(c.deltaLeanKg).toBeLessThan(0)
    expect(c.verdict).toBe('perdiendo_musculo')
  })

  it('no confunde el ruido de la bioimpedancia con una señal', () => {
    expect(partitionChange([p('2026-07-01', 81.4, 25.2), p('2026-07-25', 81.5, 25.1)], 90, NOW)!.verdict).toBe('estable')
  })

  it('respeta la ventana y necesita dos lecturas', () => {
    expect(partitionChange([p('2024-01-01', 90, 30), p('2024-02-01', 85, 25)], 60, NOW)).toBeNull()
    expect(partitionChange([p('2026-07-25', 81.4, 25.2)], 90, NOW)).toBeNull()
  })
})

describe('explainComposition', () => {
  const NOW = new Date('2026-07-25T12:00:00Z')
  const p = (day: string, w: number, f: number): CompositionPoint => ({ day, weightKg: w, bodyFatPercent: f })

  it('cuando pierde músculo lo dice y da la salida', () => {
    const line = explainComposition(partitionChange([p('2026-05-18', 82.2, 25.5), p('2026-07-25', 81.4, 25.2)], 90, NOW))!
    expect(line).toContain('Estás perdiendo músculo')
    expect(line).toContain('proteína')
    expect(line).toContain('fuerza pesada')
  })

  it('cuando recompone, lo reconoce', () => {
    const line = explainComposition(partitionChange([p('2026-06-01', 81, 26), p('2026-07-25', 81, 23)], 90, NOW))!
    expect(line).toContain('recomponiendo')
  })

  it('si no se movió nada, no dice nada', () => {
    expect(explainComposition(partitionChange([p('2026-07-01', 81.4, 25.2), p('2026-07-25', 81.5, 25.1)], 90, NOW))).toBeNull()
    expect(explainComposition(null)).toBeNull()
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

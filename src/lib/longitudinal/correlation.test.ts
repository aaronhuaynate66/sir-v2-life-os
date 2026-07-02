// SIR V2 — Tests de la correlación longitudinal (Fase 3c).
//
// Determinístico: cada log trae su loggedAt explícito. La fase lunar se
// computa del instante UTC (loggedAt con Z) y la del ciclo de la fecha
// date-only vs cycleStartDate → ambos TZ-independientes.
//
// Cubrimos: agregación de promedios por fase, delta notable, umbrales de
// muestras, y los casos borde pedidos (data vacía, fase sin registros,
// logs previos al inicio del ciclo, cycleStartDate ausente).

import { describe, it, expect } from 'vitest'

import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { cyclePhase } from '@/lib/ciclo/phase'
import { moonPhaseId } from '@/lib/lunar/phase'
import { correlateByLunarPhase, correlateByCyclePhase, correlateByExplicitCyclePhase } from './correlation'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'

let seq = 0
function log(kind: PersonLogKind, value: number, loggedAt: string): PersonLog {
  seq += 1
  return {
    id: `log_${seq}`,
    userId: 'u1',
    personId: 'p1',
    kind,
    value,
    note: null,
    loggedAt,
    createdAt: loggedAt,
  }
}

/** Helper: una fecha cuyo ciclo (start 2026-01-01, len 28) cae en `phase`. */
function dateInCyclePhase(
  phase: 'menstrual' | 'follicular' | 'ovulation' | 'luteal',
): string {
  // start 2026-01-01: menstrual d1-5, folicular d6-12, ovu d13-15, lútea d16-28.
  const dayOffsetByPhase = { menstrual: 1, follicular: 8, ovulation: 13, luteal: 20 }
  const offset = dayOffsetByPhase[phase] - 1
  const d = new Date(Date.UTC(2026, 0, 1 + offset, 12, 0, 0))
  const iso = d.toISOString()
  // sanity: confirmamos que cae donde decimos.
  const cp = cyclePhase('2026-01-01', 28, new Date(iso.slice(0, 10) + 'T00:00:00'))
  if (!cp || cp.phase !== phase) {
    throw new Error(`fixture mal: ${iso} cayó en ${cp?.phase}, esperaba ${phase}`)
  }
  return iso
}

describe('correlateByLunarPhase — casos vacíos', () => {
  it('sin logs → []', () => {
    expect(correlateByLunarPhase([])).toEqual([])
  })

  it('logs por debajo del mínimo total → el kind se omite', () => {
    const logs = [log('mood', 4, '2026-05-01T12:00:00Z'), log('mood', 5, '2026-05-02T12:00:00Z')]
    // minTotalSamples default 3 → 2 logs no alcanzan.
    expect(correlateByLunarPhase(logs)).toEqual([])
  })
})

describe('correlateByLunarPhase — agregación', () => {
  it('promedia por fase lunar y reporta count', () => {
    // 3 logs de mood en una misma fecha (misma fase lunar).
    const day = '2026-05-10T12:00:00Z'
    const phase = moonPhaseId(new Date(day))
    const logs = [log('mood', 2, day), log('mood', 4, day), log('mood', 3, day)]
    const result = correlateByLunarPhase(logs, { minSamplesPerBucket: 2 })
    expect(result).toHaveLength(1)
    const mood = result[0]
    expect(mood.kind).toBe('mood')
    expect(mood.totalSamples).toBe(3)
    const bucket = mood.buckets.find((b) => b.phaseId === phase)!
    expect(bucket.count).toBe(3)
    expect(bucket.average).toBe(3) // (2+4+3)/3 = 3
    // Las otras fases quedan vacías (honestas).
    expect(mood.buckets.filter((b) => b.average == null).length).toBe(7)
  })

  it('bucket con menos del mínimo de muestras → average null pero cuenta', () => {
    // dos fechas en fases lunares distintas, una con 1 sola muestra.
    const a = '2026-05-10T12:00:00Z'
    const b = '2026-05-18T12:00:00Z'
    expect(moonPhaseId(new Date(a))).not.toBe(moonPhaseId(new Date(b)))
    const logs = [log('energy', 5, a), log('energy', 3, a), log('energy', 1, b)]
    const [energy] = correlateByLunarPhase(logs, { minSamplesPerBucket: 2 })
    const bucketB = energy.buckets.find((x) => x.phaseId === moonPhaseId(new Date(b)))!
    expect(bucketB.count).toBe(1)
    expect(bucketB.average).toBeNull()
    // delta requiere >=2 buckets con datos; sólo uno los tiene → null.
    expect(energy.delta).toBeNull()
  })

  it('delta notable = fase con mayor promedio vs menor', () => {
    const a = '2026-05-10T12:00:00Z' // fase A
    const b = '2026-05-18T12:00:00Z' // fase B
    const logs = [
      log('mood', 5, a), log('mood', 5, a), // A: avg 5
      log('mood', 2, b), log('mood', 2, b), // B: avg 2
    ]
    const [mood] = correlateByLunarPhase(logs, { minSamplesPerBucket: 2 })
    expect(mood.delta).not.toBeNull()
    expect(mood.delta!.high.average).toBe(5)
    expect(mood.delta!.low.average).toBe(2)
    expect(mood.delta!.diff).toBe(3)
  })

  it('valores no positivos o NaN se ignoran', () => {
    const day = '2026-05-10T12:00:00Z'
    const logs = [
      log('mood', 4, day), log('mood', 4, day), log('mood', 4, day),
      log('mood', 0, day), log('mood', Number.NaN, day),
    ]
    const [mood] = correlateByLunarPhase(logs)
    expect(mood.totalSamples).toBe(3)
  })
})

describe('correlateByCyclePhase', () => {
  it('cycleStartDate ausente → [] (no clasifica)', () => {
    const logs = [log('mood', 4, '2026-05-01T12:00:00Z')]
    expect(correlateByCyclePhase(logs, null, 28)).toEqual([])
    expect(correlateByCyclePhase(logs, undefined, 28)).toEqual([])
  })

  it('promedia por fase del ciclo', () => {
    const logs = [
      log('mood', 5, dateInCyclePhase('follicular')),
      log('mood', 5, dateInCyclePhase('follicular')),
      log('mood', 2, dateInCyclePhase('luteal')),
      log('mood', 2, dateInCyclePhase('luteal')),
    ]
    const [mood] = correlateByCyclePhase(logs, '2026-01-01', 28, { minSamplesPerBucket: 2 })
    const fol = mood.buckets.find((b) => b.phaseId === 'follicular')!
    const lut = mood.buckets.find((b) => b.phaseId === 'luteal')!
    expect(fol.average).toBe(5)
    expect(lut.average).toBe(2)
    // delta "ánimo folicular vs lútea".
    expect(mood.delta!.high.phaseId).toBe('follicular')
    expect(mood.delta!.low.phaseId).toBe('luteal')
    expect(mood.delta!.diff).toBe(3)
  })

  it('fase lútea SIN registros → bucket presente, vacío, average null', () => {
    const logs = [
      log('mood', 4, dateInCyclePhase('follicular')),
      log('mood', 4, dateInCyclePhase('follicular')),
      log('mood', 3, dateInCyclePhase('menstrual')),
    ]
    const [mood] = correlateByCyclePhase(logs, '2026-01-01', 28, { minSamplesPerBucket: 1 })
    const lut = mood.buckets.find((b) => b.phaseId === 'luteal')!
    expect(lut.count).toBe(0)
    expect(lut.average).toBeNull()
    // siempre están las 4 fases en el orden canónico.
    expect(mood.buckets.map((b) => b.phaseId)).toEqual([
      'menstrual', 'follicular', 'ovulation', 'luteal',
    ])
  })

  it('logs anteriores al inicio del ciclo se descartan', () => {
    const logs = [
      log('mood', 5, '2025-12-20T12:00:00Z'), // antes del start → descartado
      log('mood', 5, '2025-12-21T12:00:00Z'), // antes del start → descartado
      log('mood', 3, dateInCyclePhase('menstrual')),
      log('mood', 3, dateInCyclePhase('menstrual')),
    ]
    const result = correlateByCyclePhase(logs, '2026-01-01', 28, {
      minSamplesPerBucket: 1,
      minTotalSamples: 2,
    })
    // Sólo los 2 logs válidos cuentan; menstrual avg 3.
    expect(result[0].totalSamples).toBe(2)
    const men = result[0].buckets.find((b) => b.phaseId === 'menstrual')!
    expect(men.average).toBe(3)
  })

  it('todos los promedios iguales → delta null (sin patrón inventado)', () => {
    const logs = [
      log('energy', 3, dateInCyclePhase('follicular')),
      log('energy', 3, dateInCyclePhase('follicular')),
      log('energy', 3, dateInCyclePhase('luteal')),
      log('energy', 3, dateInCyclePhase('luteal')),
    ]
    const [energy] = correlateByCyclePhase(logs, '2026-01-01', 28, { minSamplesPerBucket: 2 })
    expect(energy.delta).toBeNull()
  })
})

describe('correlateByExplicitCyclePhase', () => {
  function cycleEntry(date: string, phase: PersonCycleEntry['phase']): PersonCycleEntry {
    return {
      id: `c_${date}`, personId: 'p1', date, phase,
      confidence: 'medium', source: 'aaron', note: null,
      createdAt: `${date}T00:00:00Z`,
    }
  }

  it('sin cycles → []', () => {
    const logs = [log('mood', 4, '2026-06-29T12:00:00Z')]
    expect(correlateByExplicitCyclePhase(logs, [])).toEqual([])
  })

  it('agrupa cada log por la fase EXPLÍCITA del día', () => {
    const cycles = [
      cycleEntry('2026-06-27', 'bleeding'),
      cycleEntry('2026-06-28', 'bleeding'),
      cycleEntry('2026-06-29', 'bleeding'),
      cycleEntry('2026-07-10', 'mid_cycle'),
      cycleEntry('2026-07-11', 'mid_cycle'),
    ]
    const logs = [
      log('interaction', 2, '2026-06-27T20:00:00-05:00'),
      log('interaction', 3, '2026-06-28T20:00:00-05:00'),
      log('interaction', 2, '2026-06-29T20:00:00-05:00'),
      log('interaction', 5, '2026-07-10T20:00:00-05:00'),
      log('interaction', 5, '2026-07-11T20:00:00-05:00'),
    ]
    const [interaction] = correlateByExplicitCyclePhase(logs, cycles, {
      kinds: ['interaction'], minSamplesPerBucket: 2, minTotalSamples: 3,
    })
    expect(interaction).toBeDefined()
    expect(interaction.totalSamples).toBe(5)
    const bleeding = interaction.buckets.find((b) => b.phaseId === 'bleeding')!
    const mid = interaction.buckets.find((b) => b.phaseId === 'mid_cycle')!
    expect(bleeding.count).toBe(3)
    expect(bleeding.average).toBeCloseTo(2.3, 1)
    expect(mid.count).toBe(2)
    expect(mid.average).toBe(5)
    expect(interaction.delta).not.toBeNull()
    expect(interaction.delta!.high.phaseId).toBe('mid_cycle')
    expect(interaction.delta!.low.phaseId).toBe('bleeding')
  })

  it('logs en días SIN entry se descartan', () => {
    const cycles = [cycleEntry('2026-06-29', 'bleeding')]
    const logs = [
      log('mood', 4, '2026-06-29T12:00:00Z'),
      log('mood', 5, '2026-06-01T12:00:00Z'),
    ]
    const [mood] = correlateByExplicitCyclePhase(logs, cycles, { minSamplesPerBucket: 1, minTotalSamples: 1 })
    expect(mood?.totalSamples).toBe(1)
  })
})

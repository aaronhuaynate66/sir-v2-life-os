// SIR V2 — Tests del mapeo PURO de captura de báscula a HealthMetric[].
//
// Este mapeo es lo que materializa el peso (y la composición corporal) en
// health_metrics. Si rompe, el chart de tendencia de /yo deja de recibir
// puntos. Cubrimos: mapeo correcto (type+unit), orden (peso primero),
// campo ausente, valor no finito, vacío, nota por confianza, y la
// resolución de la fecha con sus casos borde.

import { describe, it, expect } from 'vitest'

import { buildScaleHealthMetrics, resolveScaleMeasuredAt } from './map'
import type { ScaleMetric } from './types'

const CTX = {
  captureId: 'cap_1748600000000',
  sourceImagePath: 'user-123/cap_1748600000000.webp',
  measuredAt: '2026-05-22T08:22:00.000Z',
} as const

describe('buildScaleHealthMetrics — mapeo', () => {
  it('mapea cada métrica a su HealthMetricType + unit canónica', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: {
        weight_kg: 81.85,
        bmi: 26.7,
        body_fat_percent: 23.4,
        muscle_mass_kg: 59.2,
        visceral_fat_level: 9,
        metabolic_rate_kcal: 1680,
        water_percent: 54.1,
        bone_mass_kg: 3.1,
        protein_percent: 17.2,
      },
    })

    const byType = Object.fromEntries(out.map((m) => [m.type, m]))
    expect(byType.weight).toMatchObject({ value: 81.85, unit: 'kg' })
    expect(byType.bmi).toMatchObject({ value: 26.7, unit: '' })
    expect(byType.body_fat_percent).toMatchObject({ value: 23.4, unit: '%' })
    expect(byType.muscle_mass_kg).toMatchObject({ value: 59.2, unit: 'kg' })
    expect(byType.visceral_fat_level).toMatchObject({ value: 9, unit: 'nivel' })
    expect(byType.metabolic_rate_kcal).toMatchObject({ value: 1680, unit: 'kcal' })
    expect(byType.water_percent).toMatchObject({ value: 54.1, unit: '%' })
    expect(byType.bone_mass_kg).toMatchObject({ value: 3.1, unit: 'kg' })
    expect(byType.protein_percent).toMatchObject({ value: 17.2, unit: '%' })
  })

  it('el peso queda PRIMERO (orden canónico) para el chart de tendencia', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { bmi: 26.7, weight_kg: 81.85, body_fat_percent: 23.4 },
    })
    expect(out[0].type).toBe('weight')
  })

  it('cada fila comparte captureId/sourceImagePath/timestamp y captureType=scale', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { weight_kg: 81.85, bmi: 26.7 },
    })
    for (const m of out) {
      expect(m.captureId).toBe(CTX.captureId)
      expect(m.sourceImagePath).toBe(CTX.sourceImagePath)
      expect(m.timestamp).toBe(CTX.measuredAt)
      expect(m.captureType).toBe('scale')
    }
  })

  it('genera ids estables y únicos por captura+métrica', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { weight_kg: 81.85, bmi: 26.7 },
    })
    const ids = out.map((m) => m.id)
    expect(ids).toContain('cap_1748600000000__weight_kg')
    expect(ids).toContain('cap_1748600000000__bmi')
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildScaleHealthMetrics — casos borde', () => {
  it('omite métricas ausentes (campo no presente)', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { weight_kg: 81.85 },
    })
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('weight')
  })

  it('omite valores no finitos (NaN, Infinity) y no-number', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: {
        weight_kg: 81.85,
        bmi: NaN,
        body_fat_percent: Infinity,
        // valor inválido inyectado por un caller laxo
        muscle_mass_kg: undefined as unknown as number,
      } as Partial<Record<ScaleMetric, number>>,
    })
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('weight')
  })

  it('devuelve [] cuando no hay métricas válidas', () => {
    expect(buildScaleHealthMetrics({ ...CTX, finalMetrics: {} })).toEqual([])
    expect(
      buildScaleHealthMetrics({
        ...CTX,
        finalMetrics: { weight_kg: NaN } as Partial<Record<ScaleMetric, number>>,
      }),
    ).toEqual([])
  })

  it('acepta 0 como valor válido (total perdido, no detectado ≠ cero)', () => {
    const out = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { visceral_fat_level: 0 },
    })
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(0)
  })

  it('nota incluye la confianza cuando se provee, default si no', () => {
    const withConf = buildScaleHealthMetrics({
      ...CTX,
      finalMetrics: { weight_kg: 81.85 },
      confidence: 'high',
    })
    expect(withConf[0].note).toBe('Captura báscula (conf. high)')

    const noConf = buildScaleHealthMetrics({ ...CTX, finalMetrics: { weight_kg: 81.85 } })
    expect(noConf[0].note).toBe('Captura báscula')
  })
})

describe('resolveScaleMeasuredAt — fecha', () => {
  const FALLBACK = new Date('2026-05-31T17:00:00.000Z')

  it('normaliza un ISO válido del screenshot', () => {
    expect(resolveScaleMeasuredAt('2026-05-22T08:22:00-05:00', FALLBACK)).toBe(
      '2026-05-22T13:22:00.000Z',
    )
  })

  it('acepta fecha sin hora (medianoche con offset)', () => {
    expect(resolveScaleMeasuredAt('2026-05-18T00:00:00-05:00', FALLBACK)).toBe(
      '2026-05-18T05:00:00.000Z',
    )
  })

  it('cae al fallback cuando measured_at es null', () => {
    expect(resolveScaleMeasuredAt(null, FALLBACK)).toBe(FALLBACK.toISOString())
  })

  it('cae al fallback con string vacío o fecha inválida', () => {
    expect(resolveScaleMeasuredAt('', FALLBACK)).toBe(FALLBACK.toISOString())
    expect(resolveScaleMeasuredAt('no-es-fecha', FALLBACK)).toBe(FALLBACK.toISOString())
    expect(resolveScaleMeasuredAt(undefined, FALLBACK)).toBe(FALLBACK.toISOString())
  })
})

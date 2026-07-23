import { describe, expect, it } from 'vitest'

import { computeMissingHealthData, SLEEP_TYPE, type Reading } from './missingData'

/** Helper: arma lecturas de un día para varios tipos. */
function day(d: string, types: string[]): Reading[] {
  return types.map((type) => ({ type, day: d }))
}

describe('computeMissingHealthData', () => {
  it('sin data → nada', () => {
    const r = computeMissingHealthData([], '2026-07-23')
    expect(r).toEqual({ referenceDay: null, missing: [], habitual: [] })
  })

  it('caso real jul 21-23: báscula y sueño al día, FC/VFC del día faltó en la última subida', () => {
    const scale = ['weight', 'bmi', 'body_fat_percent', 'skeletal_muscle_mass_kg', 'water_percent', 'bone_mass_kg', 'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal']
    const sleepMetrics = [SLEEP_TYPE, 'sleeping_heart_rate', 'hrv_avg', 'blood_oxygen', 'respiratory_rate']
    const dailyRange = ['heart_rate_min', 'heart_rate_max', 'hrv_min', 'hrv_max']
    const readings: Reading[] = [
      ...day('2026-07-21', dailyRange),
      ...day('2026-07-22', [...scale, ...sleepMetrics, ...dailyRange]),
      ...day('2026-07-23', [...scale, ...sleepMetrics]), // sin rango FC/VFC este día
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.referenceDay).toBe('2026-07-23')
    // los 3 bundles son habituales (clave presente ≥2 de 3 días)
    expect(r.habitual.sort()).toEqual(['bascula', 'fc_vfc_dia', 'sueno'])
    // solo faltó FC/VFC del día en la última subida
    expect(r.missing.map((m) => m.key)).toEqual(['fc_vfc_dia'])
    expect(r.missing[0].label).toBe('FC y VFC del día')
    expect(r.missing[0].lastSeen).toBe('2026-07-22')
  })

  it('si faltó el peso en la última subida, marca la báscula', () => {
    const scale = ['weight', 'bmi', 'body_fat_percent']
    const readings: Reading[] = [
      ...day('2026-07-21', scale),
      ...day('2026-07-22', scale),
      ...day('2026-07-23', [SLEEP_TYPE]), // hoy solo durmió, no se pesó
      ...day('2026-07-22', [SLEEP_TYPE]),
      ...day('2026-07-21', [SLEEP_TYPE]),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.missing.map((m) => m.key)).toContain('bascula')
    expect(r.missing.find((m) => m.key === 'bascula')?.lastSeen).toBe('2026-07-22')
  })

  it('al día → sin faltantes', () => {
    const all = ['weight', SLEEP_TYPE, 'heart_rate_min']
    const readings: Reading[] = [
      ...day('2026-07-21', all),
      ...day('2026-07-22', all),
      ...day('2026-07-23', all),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    expect(r.missing).toEqual([])
  })

  it('un tipo esporádico (1 día) NO es habitual → no molesta', () => {
    const readings: Reading[] = [
      ...day('2026-07-21', ['weight']),
      ...day('2026-07-22', ['weight']),
      ...day('2026-07-23', ['weight']),
      ...day('2026-07-22', ['vo2_max']), // solo una vez → no habitual
    ]
    const r = computeMissingHealthData(readings, '2026-07-23')
    // vo2_max no está en ningún bundle igual, pero validamos que no rompe nada
    expect(r.missing).toEqual([])
  })

  it('ignora lecturas fuera de la ventana', () => {
    const readings: Reading[] = [
      ...day('2026-06-01', ['weight', 'weight']),
      ...day('2026-07-23', ['weight']),
    ]
    const r = computeMissingHealthData(readings, '2026-07-23', 14)
    // solo jul-23 en ventana → 1 día de data, weight presente en referenceDay
    expect(r.referenceDay).toBe('2026-07-23')
    expect(r.missing).toEqual([])
  })
})

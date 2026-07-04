// SIR V2 — Tests del cruce "el día después" (SF·F3).

import { describe, it, expect } from 'vitest'
import { analyzeSleepAftermath } from './aftermath'
import type { SleepRecord, SelfMetric, HealthMetric } from '@/types'

// Noche buena (reparador) vs mala (fragmentado) — construidas para dar veredicto claro.
function goodNight(date: string): SleepRecord {
  return { id: `g${date}`, date, bedtime: '23:00', wakeTime: '07:00', duration: 7.5, quality: 8, score: 88, awakenings: 0, deepMin: 110, lightMin: 220, remMin: 110 }
}
function poorNight(date: string): SleepRecord {
  return { id: `p${date}`, date, bedtime: '23:00', wakeTime: '08:00', duration: 7, quality: 4, score: 45, awakenings: 6, deepMin: 20, lightMin: 380, remMin: 30 }
}
function stress(day: string, value: number): SelfMetric {
  return { id: `s${day}${value}`, category: 'stress', value, timestamp: `${day}T15:00:00.000Z` }
}
function hr(day: string, value: number): HealthMetric {
  return { id: `h${day}${value}`, type: 'heart_rate', value, unit: 'bpm', timestamp: `${day}T13:00:00.000Z` }
}

describe('analyzeSleepAftermath', () => {
  it('detecta que el estrés del día siguiente sube tras noches malas', () => {
    // 3 buenas (noches día D) → día D+1 con estrés bajo; 3 malas → D+1 estrés alto.
    const sleep = [
      goodNight('2026-06-01'), goodNight('2026-06-03'), goodNight('2026-06-05'),
      poorNight('2026-06-10'), poorNight('2026-06-12'), poorNight('2026-06-14'),
    ]
    const metrics = [
      stress('2026-06-02', 3), stress('2026-06-04', 3), stress('2026-06-06', 3),
      stress('2026-06-11', 8), stress('2026-06-13', 8), stress('2026-06-15', 8),
    ]
    const r = analyzeSleepAftermath(sleep, metrics, [])
    expect(r.sufficient).toBe(true)
    const f = r.findings.find((x) => x.metric === 'stress')
    expect(f).toBeDefined()
    expect(f!.goodAvg).toBe(3)
    expect(f!.poorAvg).toBe(8)
    expect(f!.worseAfterPoor).toBe(true)
    expect(f!.goodNights).toBe(3)
    expect(f!.poorNights).toBe(3)
  })

  it('cruza FC de reposo (heart_rate) del día siguiente', () => {
    const sleep = [
      goodNight('2026-06-01'), goodNight('2026-06-03'), goodNight('2026-06-05'),
      poorNight('2026-06-10'), poorNight('2026-06-12'), poorNight('2026-06-14'),
    ]
    const hrs = [
      hr('2026-06-02', 58), hr('2026-06-04', 60), hr('2026-06-06', 59),
      hr('2026-06-11', 68), hr('2026-06-13', 70), hr('2026-06-15', 69),
    ]
    const r = analyzeSleepAftermath(sleep, [], hrs)
    const f = r.findings.find((x) => x.metric === 'resting_hr')
    expect(f).toBeDefined()
    expect(f!.worseAfterPoor).toBe(true) // FC más alta tras mala noche = peor
    expect(f!.message).toContain('lpm')
  })

  it('no afirma con menos de 3 noches por lado (honesto)', () => {
    const sleep = [goodNight('2026-06-01'), poorNight('2026-06-10'), poorNight('2026-06-12')]
    const metrics = [stress('2026-06-02', 3), stress('2026-06-11', 8), stress('2026-06-13', 8)]
    const r = analyzeSleepAftermath(sleep, metrics, [])
    expect(r.sufficient).toBe(false)
    expect(r.findings).toHaveLength(0)
  })

  it('ignora noches "aceptables" (veredicto ambiguo)', () => {
    // Noche sin señal rica → sin_datos → no clasifica.
    const plain: SleepRecord = { id: 'x', date: '2026-06-01', bedtime: '00:00', wakeTime: '00:00', duration: 7, quality: 7 }
    const r = analyzeSleepAftermath([plain], [stress('2026-06-02', 5)], [])
    expect(r.nightsClassified).toBe(0)
    expect(r.sufficient).toBe(false)
  })

  it('respeta la zona horaria de Lima al asignar el día siguiente', () => {
    // El estrés a las 22:00 Lima del 02 se guarda como 03T03:00Z. Con slice(0,10)
    // caería en el día 03 (mal); limaDayKey lo corrige al día 02, que es el
    // "día después" de la noche buena del 01. Así ese valor cuenta como esperado.
    const sleep = [
      goodNight('2026-06-01'), goodNight('2026-06-03'), goodNight('2026-06-05'),
      poorNight('2026-06-10'), poorNight('2026-06-12'), poorNight('2026-06-14'),
    ]
    const metrics = [
      { id: 'stz', category: 'stress' as const, value: 3, timestamp: '2026-06-03T03:00:00.000Z' }, // = día 02 Lima
      stress('2026-06-04', 3), stress('2026-06-06', 3),
      stress('2026-06-11', 8), stress('2026-06-13', 8), stress('2026-06-15', 8),
    ]
    const r = analyzeSleepAftermath(sleep, metrics, [])
    const f = r.findings.find((x) => x.metric === 'stress')
    // Los 3 valores buenos (incluido el TZ-shifteado) caen en días-después de noche buena.
    expect(f?.goodNights).toBe(3)
    expect(f?.goodAvg).toBe(3)
  })
})

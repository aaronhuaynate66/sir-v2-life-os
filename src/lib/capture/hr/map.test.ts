// SIR V2 — Tests del mapeo PURO de captura de panel de FC a HealthMetric[].
//
// Este mapeo materializa la FC en health_metrics: la fila de reposo (type
// 'heart_rate') es la VERDAD que leen los consumidores; min/max van a tipos
// dedicados (rango diario), nunca como reposo. Cubrimos: dedupe por día (ids),
// fila de reposo primero, rango separado, promedio opcional, reorden de
// min/max invertidos, alertas en la nota, omisión de nulls, timestamp
// determinístico, y resolución de día con casos borde.

import { describe, it, expect } from 'vitest'

import {
  buildHeartRateHealthMetrics,
  resolveHrDay,
  hrDedupeBaseId,
  hrMetricId,
  hrTimestampForDay,
  buildRestingNote,
} from './map'
import type { HeartRateCaptureFinal } from './types'

const BASE: HeartRateCaptureFinal = {
  day: '2026-06-05',
  restingBpm: 45,
  minBpm: 44,
  maxBpm: 138,
  avgBpm: 72,
  highAlerts: null,
  lowAlerts: null,
  confidence: 'high',
}

describe('hrDedupeBaseId / hrMetricId', () => {
  it('forma la clave de dedupe por día', () => {
    expect(hrDedupeBaseId('2026-06-05')).toBe('shot:hr:2026-06-05')
  })
  it('compone el id de cada fila con el tipo', () => {
    expect(hrMetricId('2026-06-05', 'heart_rate')).toBe('shot:hr:2026-06-05:heart_rate')
    expect(hrMetricId('2026-06-05', 'heart_rate_min')).toBe('shot:hr:2026-06-05:heart_rate_min')
  })
})

describe('hrTimestampForDay', () => {
  it('es mediodía UTC del día (determinístico)', () => {
    expect(hrTimestampForDay('2026-06-05')).toBe('2026-06-05T12:00:00.000Z')
  })
})

describe('buildHeartRateHealthMetrics', () => {
  it('crea una fila por dato presente, reposo PRIMERO', () => {
    const rows = buildHeartRateHealthMetrics(BASE)
    expect(rows.map((r) => r.type)).toEqual([
      'heart_rate',
      'heart_rate_min',
      'heart_rate_max',
      'heart_rate_avg',
    ])
  })

  it('la fila de reposo lleva el valor de reposo y el tipo verdad', () => {
    const rows = buildHeartRateHealthMetrics(BASE)
    const rest = rows.find((r) => r.type === 'heart_rate')
    expect(rest?.value).toBe(45)
    expect(rest?.unit).toBe('lpm')
    expect(rest?.id).toBe('shot:hr:2026-06-05:heart_rate')
  })

  it('mapea el rango a min/max dedicados (no a reposo)', () => {
    const rows = buildHeartRateHealthMetrics(BASE)
    expect(rows.find((r) => r.type === 'heart_rate_min')?.value).toBe(44)
    expect(rows.find((r) => r.type === 'heart_rate_max')?.value).toBe(138)
  })

  it('todas las filas comparten el timestamp determinístico del día', () => {
    const rows = buildHeartRateHealthMetrics(BASE)
    for (const r of rows) expect(r.timestamp).toBe('2026-06-05T12:00:00.000Z')
  })

  it('omite los datos nulos (sólo reposo)', () => {
    const rows = buildHeartRateHealthMetrics({
      ...BASE,
      minBpm: null,
      maxBpm: null,
      avgBpm: null,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('heart_rate')
  })

  it('reordena min/max si vienen invertidos', () => {
    const rows = buildHeartRateHealthMetrics({ ...BASE, minBpm: 138, maxBpm: 44 })
    expect(rows.find((r) => r.type === 'heart_rate_min')?.value).toBe(44)
    expect(rows.find((r) => r.type === 'heart_rate_max')?.value).toBe(138)
  })

  it('guarda el conteo de alertas en la nota de reposo', () => {
    const rows = buildHeartRateHealthMetrics({ ...BASE, highAlerts: 2, lowAlerts: 1 })
    const rest = rows.find((r) => r.type === 'heart_rate')
    expect(rest?.note).toContain('2 alerta(s) FC alta')
    expect(rest?.note).toContain('1 alerta(s) FC baja')
  })

  it('sin reposo pero con rango: no hay fila heart_rate', () => {
    const rows = buildHeartRateHealthMetrics({ ...BASE, restingBpm: null })
    expect(rows.find((r) => r.type === 'heart_rate')).toBeUndefined()
    expect(rows.find((r) => r.type === 'heart_rate_min')?.value).toBe(44)
  })
})

describe('buildRestingNote', () => {
  it('omite alertas ausentes o en cero', () => {
    const note = buildRestingNote('medium', 0, null)
    expect(note).toContain('conf. medium')
    expect(note).toContain('En reposo')
    expect(note).not.toContain('alerta')
  })
})

describe('resolveHrDay', () => {
  it('usa la fecha extraída válida', () => {
    expect(resolveHrDay('2026-06-05', '2026-01-01')).toBe('2026-06-05')
  })

  it('recorta el prefijo de fecha de un timestamp', () => {
    expect(resolveHrDay('2026-06-05T07:42:00-05:00', '2026-01-01')).toBe('2026-06-05')
  })

  it('cae al fallback con fecha nula o inválida', () => {
    expect(resolveHrDay(null, '2026-01-01')).toBe('2026-01-01')
    expect(resolveHrDay('2026-02-30', '2026-01-01')).toBe('2026-01-01') // round-trip inválido
  })
})


describe('buildHeartRateHealthMetrics — alertas de FC elevada', () => {
  it('persiste una fila heart_rate_high_alerts cuando hay alertas > 0', () => {
    const rows = buildHeartRateHealthMetrics({ ...BASE, highAlerts: 2 })
    const alert = rows.find((r) => r.type === 'heart_rate_high_alerts')
    expect(alert).toBeDefined()
    expect(alert?.value).toBe(2)
    expect(alert?.unit).toBe('alertas')
    expect(alert?.id).toBe('shot:hr:2026-06-05:heart_rate_high_alerts')
  })
  it('NO crea fila de alertas si es 0 o null', () => {
    expect(buildHeartRateHealthMetrics({ ...BASE, highAlerts: 0 }).some((r) => r.type === 'heart_rate_high_alerts')).toBe(false)
    expect(buildHeartRateHealthMetrics({ ...BASE, highAlerts: null }).some((r) => r.type === 'heart_rate_high_alerts')).toBe(false)
  })
})

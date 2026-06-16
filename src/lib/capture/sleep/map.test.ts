// SIR V2 — Tests del mapeo PURO de captura de panel de sueño a SleepRecord.
//
// Este mapeo materializa el sueño en sleep_records, que alimenta /yo (Sueño
// prom., Calidad sueño, Deuda sueño), el chart de horas y el motor biológico.
// Cubrimos: dedupe por día (id), conversión min→horas, score 0-100 → calidad
// 1-10, fallback de calidad por duración, fases en la nota, resolución de día
// con casos borde, y clamps.

import { describe, it, expect } from 'vitest'

import {
  buildSleepRecordFromPanel,
  resolveSleepDay,
  sleepDedupeId,
  buildSleepNotes,
} from './map'
import type { SleepCaptureFinal, SleepStageMinutes } from './types'

const STAGES: SleepStageMinutes = {
  deep_minutes: 81,
  light_minutes: 246,
  rem_minutes: 28,
  awake_minutes: 6,
}

const BASE: SleepCaptureFinal = {
  day: '2026-06-05',
  totalMinutes: 355, // 5h 55min
  bedtime: '01:29',
  wakeTime: '07:42',
  stages: STAGES,
  score: 75,
  awakenings: null,
  respiratoryRate: null,
  spo2Avg: null,
  napMinutes: null,
  confidence: 'high',
}

describe('sleepDedupeId', () => {
  it('forma la clave de dedupe por día', () => {
    expect(sleepDedupeId('2026-06-05')).toBe('shot:sleep:2026-06-05')
  })
})

describe('buildSleepRecordFromPanel', () => {
  it('usa el día como id (dedupe) y como fecha', () => {
    const r = buildSleepRecordFromPanel(BASE)
    expect(r.id).toBe('shot:sleep:2026-06-05')
    expect(r.date).toBe('2026-06-05')
  })

  it('convierte minutos a horas decimales (355 → 5.92h)', () => {
    const r = buildSleepRecordFromPanel(BASE)
    expect(r.duration).toBe(5.92)
  })

  it('convierte score 0-100 a calidad 1-10 (75 → 8)', () => {
    const r = buildSleepRecordFromPanel(BASE)
    // qualityFromScore: round(75/10) = 8
    expect(r.quality).toBe(8)
  })

  it('si no hay score, deriva calidad de la duración', () => {
    const r = buildSleepRecordFromPanel({ ...BASE, score: null })
    // duration 5.92h → qualityFromDuration → 6 (>=5.5)
    expect(r.quality).toBe(6)
  })

  it('conserva bedtime/wakeTime y cae a 00:00 si faltan', () => {
    expect(buildSleepRecordFromPanel(BASE).bedtime).toBe('01:29')
    const noTimes = buildSleepRecordFromPanel({ ...BASE, bedtime: null, wakeTime: null })
    expect(noTimes.bedtime).toBe('00:00')
    expect(noTimes.wakeTime).toBe('00:00')
  })

  it('guarda las fases + score en la nota', () => {
    const r = buildSleepRecordFromPanel(BASE)
    expect(r.notes).toContain('score 75/100')
    expect(r.notes).toContain('Profundo 1h21m')
    expect(r.notes).toContain('Liviano 4h6m')
    expect(r.notes).toContain('REM 28m')
    expect(r.notes).toContain('Vigilia 6m')
  })

  it('clampa duraciones absurdas a 0-24h', () => {
    const tooLong = buildSleepRecordFromPanel({ ...BASE, totalMinutes: 6000 })
    expect(tooLong.duration).toBe(24)
    const zero = buildSleepRecordFromPanel({ ...BASE, totalMinutes: 0 })
    expect(zero.duration).toBe(0)
  })
})

describe('buildSleepNotes', () => {
  it('omite fases ausentes (null) y el score cuando falta', () => {
    const note = buildSleepNotes(
      { deep_minutes: 90, light_minutes: null, rem_minutes: null, awake_minutes: null },
      null,
      'medium',
    )
    expect(note).toContain('conf. medium')
    expect(note).toContain('Profundo 1h30m')
    expect(note).not.toContain('score')
    expect(note).not.toContain('Liviano')
  })
})

describe('resolveSleepDay', () => {
  it('usa la fecha extraída válida', () => {
    expect(resolveSleepDay('2026-06-05', '2026-01-01')).toBe('2026-06-05')
  })

  it('recorta el prefijo de fecha de un timestamp', () => {
    expect(resolveSleepDay('2026-06-05T07:42:00-05:00', '2026-01-01')).toBe('2026-06-05')
  })

  it('cae al fallback con fecha nula o inválida', () => {
    expect(resolveSleepDay(null, '2026-01-01')).toBe('2026-01-01')
    expect(resolveSleepDay('2026-02-30', '2026-01-01')).toBe('2026-01-01') // round-trip inválido
  })
})

import { buildSleepHealthMetrics } from './map'

describe('sueño: extras (despertares, siesta, resp, SpO2)', () => {
  const base = {
    day: '2026-06-16', totalMinutes: 480, bedtime: null, wakeTime: null,
    stages: { deep_minutes: null, light_minutes: null, rem_minutes: 82, awake_minutes: null },
    score: 81, awakenings: 1, respiratoryRate: 15, spo2Avg: 98, napMinutes: 56, confidence: 'medium' as const,
  }
  it('buildSleepHealthMetrics: SpO2→blood_oxygen + resp→respiratory_rate, dedupe por día', () => {
    const rows = buildSleepHealthMetrics(base)
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]))
    expect(byType.blood_oxygen.value).toBe(98)
    expect(byType.blood_oxygen.unit).toBe('%')
    expect(byType.respiratory_rate.value).toBe(15)
    expect(byType.blood_oxygen.id).toBe('shot:sleep:2026-06-16:blood_oxygen')
  })
  it('no crea métricas si faltan los datos', () => {
    expect(buildSleepHealthMetrics({ ...base, spo2Avg: null, respiratoryRate: null })).toHaveLength(0)
  })
  it('buildSleepNotes incluye despertares y siesta', () => {
    const n = buildSleepNotes(base.stages, base.score, 'medium', { awakenings: 1, napMinutes: 56, respiratoryRate: 15, spo2Avg: 98 })
    expect(n).toContain('Despertares 1')
    expect(n).toContain('Siesta')
    expect(n).toContain('SpO₂ 98%')
  })
})

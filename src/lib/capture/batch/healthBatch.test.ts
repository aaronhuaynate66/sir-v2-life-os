import { describe, it, expect } from 'vitest'
import { sleepFinalFromExtracted, hrFinalFromExtracted } from './healthBatch'

describe('sleepFinalFromExtracted', () => {
  it('usa total_minutes del panel y copia campos', () => {
    const f = sleepFinalFromExtracted(
      { date: '2026-04-05', total_minutes: 372, bedtime: '23:30', wake_time: '06:42', stages: { deep_minutes: 60, light_minutes: 200, rem_minutes: 112, awake_minutes: 10 }, score: 80, confidence: 'high' },
      '2026-06-08',
    )
    expect(f.totalMinutes).toBe(372)
    expect(f.score).toBe(80)
    expect(f.bedtime).toBe('23:30')
    expect(f.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('cae a la suma de fases (deep+light+rem) si falta total_minutes', () => {
    const f = sleepFinalFromExtracted(
      { date: null, total_minutes: null, bedtime: null, wake_time: null, stages: { deep_minutes: 60, light_minutes: 200, rem_minutes: 100, awake_minutes: 10 }, score: null, confidence: 'medium' },
      '2026-06-08',
    )
    expect(f.totalMinutes).toBe(360)
    expect(f.day).toBe('2026-06-08')
  })
})

describe('hrFinalFromExtracted', () => {
  it('copia los valores de FC y resuelve el día', () => {
    const f = hrFinalFromExtracted(
      { date: '2026-05-01', resting_bpm: 47, min_bpm: 44, max_bpm: 138, avg_bpm: 62, high_alerts: 1, low_alerts: 0, confidence: 'high' },
      '2026-06-08',
    )
    expect(f.restingBpm).toBe(47)
    expect(f.maxBpm).toBe(138)
    expect(f.avgBpm).toBe(62)
    expect(f.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

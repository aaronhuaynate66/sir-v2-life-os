import { describe, it, expect } from 'vitest'
import { buildHrvHealthMetrics, hrvMetricId, resolveHrvDay } from './map'

describe('buildHrvHealthMetrics', () => {
  it('arma min/max/avg en ms con ids estables', () => {
    const rows = buildHrvHealthMetrics({ day: '2026-06-13', restingMs: null, minMs: 21, maxMs: 134, avgMs: 60, confidence: 'high' })
    expect(rows.map((r) => r.type).sort()).toEqual(['hrv_avg', 'hrv_max', 'hrv_min'])
    expect(rows.every((r) => r.unit === 'ms')).toBe(true)
    expect(rows.find((r) => r.type === 'hrv_avg')!.value).toBe(60)
    expect(rows.find((r) => r.type === 'hrv_min')!.id).toBe(hrvMetricId('2026-06-13', 'hrv_min'))
  })
  it('usa resting si no hay avg', () => {
    const rows = buildHrvHealthMetrics({ day: '2026-06-13', restingMs: 48, minMs: null, maxMs: null, avgMs: null, confidence: 'medium' })
    expect(rows.find((r) => r.type === 'hrv_avg')!.value).toBe(48)
  })
  it('reordena min/max invertidos', () => {
    const rows = buildHrvHealthMetrics({ day: '2026-06-13', restingMs: null, minMs: 134, maxMs: 21, avgMs: null, confidence: 'low' })
    expect(rows.find((r) => r.type === 'hrv_min')!.value).toBe(21)
    expect(rows.find((r) => r.type === 'hrv_max')!.value).toBe(134)
  })
  it('cae al fallback si no hay fecha', () => {
    expect(resolveHrvDay(null, '2026-06-14')).toBe('2026-06-14')
  })
})

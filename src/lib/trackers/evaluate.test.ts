// SIR V2 — Tests de evaluación de trackers (condición, tendencia, vejez).

import { describe, it, expect } from 'vitest'
import type { Tracker, TrackerPoint } from '@/types'
import {
  evaluateCondition,
  isStale,
  trackerStatus,
  computeTrend,
  conditionLabel,
  daysUntil,
} from './evaluate'

const NOW = new Date(2026, 5, 3) // 2026-06-03 local

function tracker(partial: Partial<Tracker>): Tracker {
  return {
    id: 't1',
    label: 'Precio vuelo',
    unit: 'PEN',
    conditionKind: 'lte',
    conditionValue: 4500,
    createdAt: '2026-06-03T00:00:00.000Z',
    ...partial,
  }
}

function point(date: string, value: number): TrackerPoint {
  return { id: `p_${date}`, trackerId: 't1', value, date, source: 'manual_text', createdAt: `${date}T00:00:00.000Z` }
}

describe('daysUntil', () => {
  it('fecha futura → positivo', () => {
    expect(daysUntil('2026-06-13', NOW)).toBe(10)
  })
  it('fecha pasada → negativo', () => {
    expect(daysUntil('2026-05-29', NOW)).toBe(-5)
  })
  it('sin fecha → null', () => {
    expect(daysUntil(undefined, NOW)).toBeNull()
  })
})

describe('evaluateCondition lte/gte', () => {
  it('lte: cumple cuando valor ≤ umbral', () => {
    expect(evaluateCondition(tracker({ currentValue: 4499 }), NOW).met).toBe(true)
    expect(evaluateCondition(tracker({ currentValue: 4500 }), NOW).met).toBe(true)
    expect(evaluateCondition(tracker({ currentValue: 4501 }), NOW).met).toBe(false)
  })
  it('gte: cumple cuando valor ≥ umbral', () => {
    const t = tracker({ conditionKind: 'gte', conditionValue: 10000, currentValue: 12000 })
    expect(evaluateCondition(t, NOW).met).toBe(true)
    expect(evaluateCondition({ ...t, currentValue: 9999 }, NOW).met).toBe(false)
  })
  it('sin valor → no cumple', () => {
    expect(evaluateCondition(tracker({ currentValue: undefined }), NOW).met).toBe(false)
  })
})

describe('evaluateCondition days_until_lt', () => {
  const base = tracker({ conditionKind: 'days_until_lt', conditionValue: 30, conditionDate: '2026-06-20', unit: 'días' })
  it('cumple cuando faltan menos de N días', () => {
    const r = evaluateCondition(base, NOW) // faltan 17 días < 30
    expect(r.daysUntil).toBe(17)
    expect(r.met).toBe(true)
  })
  it('no cumple si faltan más de N días', () => {
    const r = evaluateCondition({ ...base, conditionDate: '2026-08-20' }, NOW)
    expect(r.met).toBe(false)
  })
  it('sin fecha objetivo → no cumple', () => {
    expect(evaluateCondition({ ...base, conditionDate: undefined }, NOW).met).toBe(false)
  })
})

describe('isStale', () => {
  it('vieja si la última lectura supera la cadencia', () => {
    const t = tracker({ currentValue: 5000, currentValueDate: '2026-05-20', cadenceDays: 7 })
    expect(isStale(t, NOW)).toBe(true) // 14 días > 7
  })
  it('fresca si está dentro de la cadencia', () => {
    const t = tracker({ currentValue: 5000, currentValueDate: '2026-06-01', cadenceDays: 7 })
    expect(isStale(t, NOW)).toBe(false) // 2 días ≤ 7
  })
  it('sin cadencia nunca es vieja', () => {
    const t = tracker({ currentValue: 5000, currentValueDate: '2020-01-01' })
    expect(isStale(t, NOW)).toBe(false)
  })
  it('days_until_lt nunca es vieja', () => {
    const t = tracker({ conditionKind: 'days_until_lt', conditionValue: 30, conditionDate: '2026-12-01', cadenceDays: 1 })
    expect(isStale(t, NOW)).toBe(false)
  })
})

describe('trackerStatus', () => {
  it('met gana sobre stale', () => {
    const t = tracker({ currentValue: 4000, currentValueDate: '2026-01-01', cadenceDays: 3 })
    expect(trackerStatus(t, NOW)).toBe('met')
  })
  it('stale cuando no cumple y está vieja', () => {
    const t = tracker({ currentValue: 5000, currentValueDate: '2026-01-01', cadenceDays: 3 })
    expect(trackerStatus(t, NOW)).toBe('stale')
  })
  it('tracking cuando hay datos y no cumple', () => {
    const t = tracker({ currentValue: 5000, currentValueDate: '2026-06-02' })
    expect(trackerStatus(t, NOW)).toBe('tracking')
  })
  it('no_data sin valor', () => {
    expect(trackerStatus(tracker({ currentValue: undefined }), NOW)).toBe('no_data')
  })
})

describe('computeTrend', () => {
  it('baja → favorable para lte', () => {
    const pts = [point('2026-06-01', 5566), point('2026-06-03', 5075)]
    const r = computeTrend(pts, 'lte')
    expect(r.direction).toBe('down')
    expect(r.delta).toBe(5075 - 5566)
    expect(r.favorable).toBe(true)
  })
  it('sube → desfavorable para lte', () => {
    const pts = [point('2026-06-01', 5000), point('2026-06-03', 5200)]
    const r = computeTrend(pts, 'lte')
    expect(r.direction).toBe('up')
    expect(r.favorable).toBe(false)
  })
  it('sube → favorable para gte', () => {
    const pts = [point('2026-06-01', 5000), point('2026-06-03', 5200)]
    expect(computeTrend(pts, 'gte').favorable).toBe(true)
  })
  it('un solo punto → sin tendencia', () => {
    expect(computeTrend([point('2026-06-03', 5000)], 'lte').direction).toBeNull()
  })
})

describe('conditionLabel', () => {
  it('lte', () => {
    expect(conditionLabel(tracker({ conditionValue: 4500 }))).toBe('≤ 4500 PEN')
  })
  it('gte', () => {
    expect(conditionLabel(tracker({ conditionKind: 'gte', conditionValue: 10000, unit: 'USD' }))).toBe('≥ 10000 USD')
  })
  it('days_until_lt con fecha', () => {
    const t = tracker({ conditionKind: 'days_until_lt', conditionValue: 30, conditionDate: '2026-07-15', unit: 'días' })
    expect(conditionLabel(t)).toBe('< 30 días para 2026-07-15')
  })
})

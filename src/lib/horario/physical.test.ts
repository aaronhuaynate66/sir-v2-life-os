// SIR V2 — Tests del estado físico de /horario (Día).
//
// buildPhysicalState toma el ÚLTIMO valor de cada señal biológica. Sin `now`:
// "último" se resuelve por timestamp/fecha (comparación lexicográfica ISO).

import { describe, it, expect } from 'vitest'

import type { HealthMetric, SelfMetric, SleepRecord } from '@/types'
import { buildPhysicalState } from './physical'

function health(over: Partial<HealthMetric>): HealthMetric {
  return {
    id: over.id ?? 'h1',
    type: over.type ?? 'weight',
    value: over.value ?? 0,
    unit: over.unit ?? '',
    note: over.note,
    timestamp: over.timestamp ?? '2026-06-01T08:00:00Z',
    ...over,
  }
}

function sleep(over: Partial<SleepRecord>): SleepRecord {
  return {
    id: over.id ?? 's1',
    date: over.date ?? '2026-06-01',
    bedtime: over.bedtime ?? '23:00',
    wakeTime: over.wakeTime ?? '07:00',
    duration: over.duration ?? 8,
    quality: over.quality ?? 7,
    ...over,
  }
}

function selfMetric(over: Partial<SelfMetric>): SelfMetric {
  return {
    id: over.id ?? 'm1',
    category: over.category ?? 'energy',
    value: over.value ?? 5,
    timestamp: over.timestamp ?? '2026-06-01T08:00:00Z',
    ...over,
  }
}

describe('buildPhysicalState', () => {
  it('sin data → empty', () => {
    const state = buildPhysicalState({})
    expect(state.empty).toBe(true)
    expect(state.weightKg).toBeUndefined()
  })

  it('toma el último peso por timestamp', () => {
    const state = buildPhysicalState({
      healthMetrics: [
        health({ id: 'a', type: 'weight', value: 80, timestamp: '2026-05-01T08:00:00Z' }),
        health({ id: 'b', type: 'weight', value: 78, timestamp: '2026-06-01T08:00:00Z' }),
      ],
    })
    expect(state.empty).toBe(false)
    expect(state.weightKg).toBe(78)
    expect(state.weightAt).toBe('2026-06-01T08:00:00Z')
  })

  it('toma la última FC (heart_rate), ignora otros tipos', () => {
    const state = buildPhysicalState({
      healthMetrics: [
        health({ id: 'a', type: 'heart_rate', value: 62, timestamp: '2026-06-01T08:00:00Z' }),
        health({ id: 'b', type: 'steps', value: 9000, timestamp: '2026-06-02T08:00:00Z' }),
      ],
    })
    expect(state.heartRate).toBe(62)
    expect(state.heartRateAt).toBe('2026-06-01T08:00:00Z')
  })

  it('toma el último sueño por fecha', () => {
    const state = buildPhysicalState({
      sleepRecords: [
        sleep({ id: 'a', date: '2026-05-30', duration: 6, quality: 5 }),
        sleep({ id: 'b', date: '2026-06-01', duration: 7.5, quality: 8 }),
      ],
    })
    expect(state.sleepHours).toBe(7.5)
    expect(state.sleepQuality).toBe(8)
    expect(state.sleepDate).toBe('2026-06-01')
  })

  it('toma la última energía (category=energy), ignora otras categorías', () => {
    const state = buildPhysicalState({
      selfMetrics: [
        selfMetric({ id: 'a', category: 'energy', value: 6, timestamp: '2026-06-01T08:00:00Z' }),
        selfMetric({ id: 'b', category: 'stress', value: 9, timestamp: '2026-06-02T08:00:00Z' }),
        selfMetric({ id: 'c', category: 'energy', value: 8, timestamp: '2026-06-02T20:00:00Z' }),
      ],
    })
    expect(state.energy).toBe(8)
  })

  it('combina señales parciales (solo sueño) → no empty', () => {
    const state = buildPhysicalState({ sleepRecords: [sleep({ duration: 8 })] })
    expect(state.empty).toBe(false)
    expect(state.sleepHours).toBe(8)
    expect(state.weightKg).toBeUndefined()
  })
})

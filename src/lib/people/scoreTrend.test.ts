import { describe, it, expect } from 'vitest'
import { computeScoreTrend, DEFAULT_STABLE_THRESHOLD } from './scoreTrend'

describe('computeScoreTrend', () => {
  it('sin snapshots → insufficient_data', () => {
    const t = computeScoreTrend([])
    expect(t.direction).toBe('insufficient_data')
    expect(t.delta).toBeNull()
    expect(t.current).toBeNull()
  })

  it('un solo snapshot → insufficient_data pero expone current', () => {
    const t = computeScoreTrend([{ dateBucket: '2026-06-01', global: 60 }])
    expect(t.direction).toBe('insufficient_data')
    expect(t.current).toBe(60)
    expect(t.baseline).toBeNull()
    expect(t.comparedDays).toBeNull()
  })

  it('subida > umbral → improving (delta y días correctos)', () => {
    const t = computeScoreTrend([
      { dateBucket: '2026-06-01', global: 50 },
      { dateBucket: '2026-06-08', global: 62 },
    ])
    expect(t.direction).toBe('improving')
    expect(t.delta).toBe(12)
    expect(t.current).toBe(62)
    expect(t.baseline).toBe(50)
    expect(t.comparedDays).toBe(7)
  })

  it('bajada > umbral → declining', () => {
    const t = computeScoreTrend([
      { dateBucket: '2026-06-01', global: 70 },
      { dateBucket: '2026-06-05', global: 60 },
    ])
    expect(t.direction).toBe('declining')
    expect(t.delta).toBe(-10)
  })

  it('cambio dentro del umbral → stable', () => {
    const t = computeScoreTrend([
      { dateBucket: '2026-06-01', global: 60 },
      { dateBucket: '2026-06-05', global: 62 },
    ])
    expect(t.direction).toBe('stable')
    expect(t.delta).toBe(2)
  })

  it('respeta umbral personalizado', () => {
    const t = computeScoreTrend(
      [{ dateBucket: '2026-06-01', global: 60 }, { dateBucket: '2026-06-05', global: 62 }],
      1,
    )
    expect(t.direction).toBe('improving') // 2 > 1
  })

  it('ordena entradas desordenadas (baseline = más antiguo)', () => {
    const t = computeScoreTrend([
      { dateBucket: '2026-06-08', global: 62 },
      { dateBucket: '2026-06-01', global: 50 },
      { dateBucket: '2026-06-04', global: 55 },
    ])
    expect(t.baseline).toBe(50)
    expect(t.current).toBe(62)
    expect(t.comparedDays).toBe(7)
  })

  it('descarta entradas inválidas', () => {
    const t = computeScoreTrend([
      { dateBucket: '2026-06-01', global: 50 },
      { dateBucket: 'bad', global: NaN } as never,
      { dateBucket: '2026-06-08', global: 62 },
    ])
    expect(t.direction).toBe('improving')
    expect(t.delta).toBe(12)
  })

  it('umbral por defecto es 3', () => {
    expect(DEFAULT_STABLE_THRESHOLD).toBe(3)
  })
})

import { describe, it, expect } from 'vitest'
import { analyzeSleep } from './sleepModel'
import type { SleepRecord } from '@/types'

const NOW = Date.parse('2026-07-06T12:00:00Z')
const DAY = 86_400_000

function isoDaysAgo(d: number): string {
  return new Date(NOW - d * DAY).toISOString().slice(0, 10)
}

function rec(daysAgo: number, over: Partial<SleepRecord> = {}): SleepRecord {
  return {
    id: `s-${daysAgo}`, date: isoDaysAgo(daysAgo), bedtime: '00:00', wakeTime: '07:00',
    duration: 7, quality: 7, score: 70, ...over,
  }
}

describe('analyzeSleep (C1 idiográfico)', () => {
  it('insuficiente con menos de 7 noches', () => {
    const r = analyzeSleep([rec(1), rec(2), rec(3)], NOW)
    expect(r.baseline).toBeNull()
    expect(r.insufficient.some((s) => s.includes('baseline'))).toBe(true)
  })

  it('baseline = mediana personal (no norma poblacional)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => rec(i + 1, { score: 60 + i, duration: 6 + i * 0.1 }))
    const r = analyzeSleep(rows, NOW)
    expect(r.baseline).not.toBeNull()
    expect(r.baseline!.score).toBeGreaterThanOrEqual(60)
    expect(r.baseline!.score).toBeLessThanOrEqual(70)
  })

  it('detecta tendencia de mejora', () => {
    // score sube ~2/día → claramente mejora
    const rows = Array.from({ length: 14 }, (_, i) => rec(14 - i, { score: 40 + i * 3 }))
    const r = analyzeSleep(rows, NOW)
    expect(r.trend).not.toBeNull()
    expect(r.trend!.direction).toBe('mejora')
    expect(r.trend!.slopePerWeek).toBeGreaterThan(0)
  })

  it('ritmo semanal requiere ≥14 noches', () => {
    const rows = Array.from({ length: 8 }, (_, i) => rec(i + 1))
    const r = analyzeSleep(rows, NOW)
    expect(r.weekly).toBeNull()
    expect(r.insufficient.some((s) => s.includes('semanal'))).toBe(true)
  })

  it('arquitectura marca profundo/REM bajos', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      rec(i + 1, { deepMin: 20, lightMin: 300, remMin: 20 }), // deep ~6%, rem ~6% → bajos
    )
    const r = analyzeSleep(rows, NOW)
    expect(r.architecture).not.toBeNull()
    expect(r.architecture!.deepPct).toBeLessThan(13)
    expect(r.architecture!.note).toContain('profundo')
  })

  it('deuda de sueño: negativa si dormís menos que tu baseline', () => {
    // baseline ~7h; últimas noches 5h → deuda negativa
    const older = Array.from({ length: 7 }, (_, i) => rec(i + 8, { duration: 7 }))
    const recent = Array.from({ length: 5 }, (_, i) => rec(i + 1, { duration: 5 }))
    const r = analyzeSleep([...older, ...recent], NOW)
    expect(r.debt).not.toBeNull()
    expect(r.debt!.hoursVsBaseline).toBeLessThan(0)
  })

  it('proyecta la próxima noche con banda', () => {
    const rows = Array.from({ length: 20 }, (_, i) => rec(20 - i, { score: 65 + (i % 3) }))
    const r = analyzeSleep(rows, NOW)
    expect(r.projection).not.toBeNull()
    expect(r.projection!.nextScore).toBeGreaterThanOrEqual(0)
    expect(r.projection!.nextScore).toBeLessThanOrEqual(100)
    expect(r.projection!.band[0]).toBeLessThanOrEqual(r.projection!.band[1])
  })

  it('1 registro por fecha (dedupe)', () => {
    const rows = [rec(1, { score: 50 }), rec(1, { score: 90 }), ...Array.from({ length: 8 }, (_, i) => rec(i + 2))]
    const r = analyzeSleep(rows, NOW)
    expect(r.n).toBe(9) // no 10: la fecha duplicada cuenta una vez
  })
})

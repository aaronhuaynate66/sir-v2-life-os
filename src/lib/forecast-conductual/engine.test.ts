// SIR V2 — Tests del motor de forecast conductual.
//
// Dataset sintético con período CONOCIDO (28d): picos conductuales cada 28 días.
// El ensamble debe recuperar ~28 y proyectar el próximo pico a futuro.

import { describe, it, expect } from 'vitest'
import { runForecast } from './engine'
import type { DailySignal } from './types'

const DAY = 86_400_000
function dayIso(startIso: string, i: number): string {
  const d = new Date(Date.parse(`${startIso}T00:00:00Z`) + i * DAY)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function sig(date: string, peak: boolean): DailySignal {
  const v = peak ? 0.85 : 0.04
  return { date, messageCount: peak ? 20 : 6, avgLen: 40, somatic: peak ? 0.8 : 0.03, friction: peak ? 0.9 : 0.05, withdrawal: peak ? 0.6 : 0.05, sensitivity: peak ? 0.7 : 0.05, actions: 0.1, composite: v, affection: 0, positivityRatio: 1 }
}

/** 90 días desde start, picos en 0,28,56,84. */
function synthetic(startIso: string, period = 28, span = 90): DailySignal[] {
  const out: DailySignal[] = []
  for (let i = 0; i < span; i++) out.push(sig(dayIso(startIso, i), i % period === 0))
  return out
}

describe('runForecast — recupera el período de un patrón claro', () => {
  const signals = synthetic('2026-01-01', 28, 90)
  const now = new Date('2026-04-05T12:00:00Z') // ~día 94, después del último pico (84)
  const f = runForecast({ signals, now })!

  it('devuelve un forecast con período ~28 y ventana a futuro', () => {
    expect(f).not.toBeNull()
    expect(f.periodDays).toBeGreaterThanOrEqual(26)
    expect(f.periodDays).toBeLessThanOrEqual(30)
    expect(f.centerDate).not.toBeNull()
    // el centro cae después de "hoy" (proyección a futuro)
    expect(Date.parse(f.centerDate! + 'T00:00:00Z')).toBeGreaterThan(now.getTime() - DAY)
  })
  it('modo exploratorio sin anclas + interpretación honesta', () => {
    expect(f.mode).toBe('exploratory')
    expect(f.interpretation).toMatch(/candidata|exploratoria|no es período confirmado/i)
  })
  it('la ventana principal es de 5 días (±2)', () => {
    const s = Date.parse(f.mainWindow!.start + 'T00:00:00Z')
    const e = Date.parse(f.mainWindow!.end + 'T00:00:00Z')
    expect(Math.round((e - s) / DAY)).toBe(4)
  })
  it('usualPattern muestra fricción elevada en los picos', () => {
    expect(f.usualPattern.friction).toBeGreaterThan(0)
  })
  it('confianza no-mínima con 3+ ciclos de patrón limpio', () => {
    expect(f.confidence.score).toBeGreaterThan(0.4)
  })
})

describe('runForecast — con anclas confirmadas pasa a calibrado', () => {
  it('mode calibrado cuando hay period_start', () => {
    const signals = synthetic('2026-01-01', 28, 90)
    const f = runForecast({ signals, anchors: [{ date: '2026-01-01', type: 'period_start' }, { date: '2026-01-29', type: 'period_start' }], now: new Date('2026-04-05T12:00:00Z') })!
    expect(f.mode).toBe('calibrated')
    expect(f.dominantModels).toContain('bayes')
  })
})

describe('runForecast — bordes', () => {
  it('serie muy corta → null', () => {
    expect(runForecast({ signals: [sig('2026-01-01', true), sig('2026-01-02', false)] })).toBeNull()
  })
  it('serie plana (sin picos) → baja confianza', () => {
    const flat: DailySignal[] = []
    for (let i = 0; i < 60; i++) flat.push(sig(dayIso('2026-01-01', i), false))
    const f = runForecast({ signals: flat, now: new Date('2026-03-15T12:00:00Z') })!
    expect(f.confidence.score).toBeLessThan(0.45)
  })
})

// SIR V2 — Tests del Timing Engine (recomendación + ventana circadiana).
//
// LIVE (useRichContext). evaluateTiming apila condiciones (las posteriores
// pisan timing/confidence); getCurrentTimingWindow mapea por hora (inyectable)
// con override de estado suboptimo. Puro y determinista (hour como parámetro).

import { describe, it, expect } from 'vitest'

import type { BiologicalState } from '../biological'
import { evaluateTiming, getCurrentTimingWindow } from './index'

function bio(o: Partial<BiologicalState> = {}): BiologicalState {
  return {
    energyLevel: 6,
    stressLevel: 5,
    sleepDebt: 0,
    lastSleepQuality: 7,
    lastSleepDuration: 7,
    recoveryScore: 6,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...o,
  }
}

describe('evaluateTiming', () => {
  it('condiciones óptimas (energía≥7, estrés≤5, peace≥6) → "now" alta confianza', () => {
    const r = evaluateTiming('lanzar', bio({ energyLevel: 8, stressLevel: 3 }), 8)
    expect(r.timing).toBe('now')
    expect(r.confidence).toBe(0.85)
    expect(r.action).toBe('lanzar')
  })

  it('energía baja → posterga a "this_week"', () => {
    const r = evaluateTiming('x', bio({ energyLevel: 3, stressLevel: 5 }), 7)
    expect(r.timing).toBe('this_week')
    expect(r.confidence).toBe(0.6)
  })

  it('peace score bajo (<4) → "when_ready" con alta confianza', () => {
    const r = evaluateTiming('x', bio({ energyLevel: 5, stressLevel: 5 }), 2)
    expect(r.timing).toBe('when_ready')
    expect(r.confidence).toBe(0.85)
  })

  it('condiciones estables → razón por defecto', () => {
    const r = evaluateTiming('x', bio({ energyLevel: 6, stressLevel: 5 }), 5)
    expect(r.reason).toBe('Condiciones estables')
  })
})

describe('getCurrentTimingWindow', () => {
  it('estado suboptimo (energía<4 o estrés>8) → "avoid" sin importar la hora', () => {
    expect(getCurrentTimingWindow(bio({ energyLevel: 3 }), 8).type).toBe('avoid')
    expect(getCurrentTimingWindow(bio({ stressLevel: 9 }), 8).type).toBe('avoid')
  })

  it('mañana (6-10) con buen estado → "peak"', () => {
    expect(getCurrentTimingWindow(bio(), 8).type).toBe('peak')
  })

  it('valle circadiano (14-16) → "avoid"', () => {
    expect(getCurrentTimingWindow(bio(), 15).type).toBe('avoid')
  })

  it('tarde (17-20) → "good"; resto → "neutral"', () => {
    expect(getCurrentTimingWindow(bio(), 18).type).toBe('good')
    expect(getCurrentTimingWindow(bio(), 12).type).toBe('neutral')
    expect(getCurrentTimingWindow(bio(), 23).type).toBe('neutral')
  })
})

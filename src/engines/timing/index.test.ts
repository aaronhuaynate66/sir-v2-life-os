// SIR V2 — Tests del Timing Engine (ventana circadiana).
//
// LIVE (useRichContext / panel). getCurrentTimingWindow mapea por hora
// (inyectable) con override de estado suboptimo. Puro y determinista.

import { describe, it, expect } from 'vitest'

import type { BiologicalState } from '../biological'
import { getCurrentTimingWindow } from './index'

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

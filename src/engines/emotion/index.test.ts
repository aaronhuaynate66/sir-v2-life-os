// SIR V2 — Tests de ventana de tolerancia + estrategia (13·M1 + M2) + aislamiento (M5).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { assessEmotionWindow, type Sample } from './index'

const NOW = Date.parse('2026-07-01T12:00:00Z')
function series(vals: number[], startDaysAgo: number, stepDays = 1): Sample[] {
  return vals.map((value, i) => ({ value, at: new Date(NOW - (startDaysAgo - i * stepDays) * 86_400_000).toISOString() }))
}

describe('assessEmotionWindow — M1 detección de ventana', () => {
  it('sin baseline suficiente → insufficient', () => {
    const r = assessEmotionWindow({ stress: series([5, 6], 2) }, NOW)
    expect(r.state).toBe('insufficient')
    expect(r.guidance).toBeNull()
  })

  it('estrés alto reciente vs baseline + sueño bajo → narrow', () => {
    const stressBaseline = series([3, 3, 4, 3, 4, 3], 30, 4) // baseline calmo
    const stressRecent = series([8, 8], 2) // pico reciente
    const sleep = [...series([7.5, 7, 7.5], 30, 5), ...series([4.5, 5], 2)] // sueño reciente bajo
    const r = assessEmotionWindow({ stress: [...stressBaseline, ...stressRecent], sleepHours: sleep }, NOW)
    expect(r.stressElevated).toBe(true)
    expect(r.sleepLow).toBe(true)
    expect(r.state).toBe('narrow')
  })

  it('HRV en caída vs baseline personal cuenta como señal', () => {
    const stressBaseline = series([3, 3, 4, 3, 4, 3], 30, 4)
    const stressRecent = series([8, 8], 2)
    const hrv = [...series([60, 62, 58, 61, 59, 60], 30, 4), ...series([48, 47], 2)] // HRV cae ~20%
    const r = assessEmotionWindow({ stress: [...stressBaseline, ...stressRecent], hrv }, NOW)
    expect(r.hrvDown).toBe(true)
    expect(r.state).toBe('narrow')
  })

  it('todo calmo → open, sin guía', () => {
    const stress = [...series([3, 4, 3, 4, 3, 4], 30, 4), ...series([3, 4], 2)]
    const r = assessEmotionWindow({ stress }, NOW)
    expect(r.state).toBe('open')
    expect(r.guidance).toBeNull()
  })
})

describe('assessEmotionWindow — M2 estrategia (Gross)', () => {
  it('narrow → modulación de respuesta (bajar activación, no reevaluar)', () => {
    const stress = [...series([3, 3, 4, 3, 4, 3], 30, 4), ...series([9, 9], 2)]
    const sleep = [...series([7, 7, 7], 30, 5), ...series([4, 4], 2)]
    const r = assessEmotionWindow({ stress, sleepHours: sleep }, NOW)
    expect(r.strategy).toBe('response_modulation')
    expect(r.guidance).toMatch(/bajá el arousal|respiración|no es momento de razonar/i)
  })

  it('watch (tensionado pero dentro) → reevaluación cognitiva', () => {
    // estrés elevado pero SIN sueño bajo ni HRV → watch, no narrow
    const stress = [...series([4, 4, 5, 4, 4, 4], 30, 4), ...series([8, 8], 2)]
    const r = assessEmotionWindow({ stress }, NOW)
    expect(r.state).toBe('watch')
    expect(r.strategy).toBe('reappraisal')
    expect(r.guidance).toMatch(/reencuadre|otra lectura/i)
  })
})

describe('13·M5 — aislamiento clínico (frontera de datos)', () => {
  it('el motor de emoción NO referencia self_diagnosis', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/self_diagnosis/i)
    expect(src).not.toMatch(/SelfDiagnosis/)
    expect(src).not.toMatch(/\bdiagnosis\b/i)
  })
})

import { describe, it, expect } from 'vitest'
import { sanitizeSleepPanelExtracted } from './validate'
import type { SleepPanelExtracted } from './types'

const base = (over: Partial<SleepPanelExtracted>): SleepPanelExtracted => ({
  date: '2026-06-22', total_minutes: null, bedtime: null, wake_time: null,
  stages: { deep_minutes: null, light_minutes: null, rem_minutes: null, awake_minutes: null },
  score: null, awakenings: null, respiratory_rate: null, spo2_avg: null, nap_minutes: null,
  confidence: 'medium', raw_observations: undefined, ...over,
})

describe('piso de confianza del sueño', () => {
  it('panel Huawei detalle (sin duración/horarios) con ≥3 métricas → high', () => {
    const out = sanitizeSleepPanelExtracted(base({ awakenings: 0, respiratory_rate: 15, spo2_avg: 98, confidence: 'medium' }))
    expect(out.confidence).toBe('high')
  })
  it('pocas métricas → se queda en medium', () => {
    const out = sanitizeSleepPanelExtracted(base({ spo2_avg: 98, confidence: 'medium' }))
    expect(out.confidence).toBe('medium')
  })
  it('nunca sube una lectura low (imagen borrosa)', () => {
    const out = sanitizeSleepPanelExtracted(base({ awakenings: 0, respiratory_rate: 15, spo2_avg: 98, confidence: 'low' }))
    expect(out.confidence).toBe('low')
  })
})

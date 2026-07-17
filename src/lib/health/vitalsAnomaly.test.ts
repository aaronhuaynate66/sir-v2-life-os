import { describe, it, expect } from 'vitest'
import { vitalsAnomaly, DEFAULT_RANGES } from './vitalsAnomaly'

describe('vitalsAnomaly — carga fisiológica multi-señal', () => {
  it('null sin datos', () => {
    expect(vitalsAnomaly([])).toBeNull()
    expect(vitalsAnomaly([{ date: '2026-07-15' }])).toBeNull()
  })

  it('null con UNA sola señal desviada (es ruido)', () => {
    // Solo FC en reposo elevada; el resto en rango.
    expect(vitalsAnomaly([{ date: '2026-07-10', hrvAvg: 60, sleepingHr: 58, respRate: 15, highHrAlerts: 0 }])).toBeNull()
  })

  it('15-jul real (enfermo): 4 señales → alert', () => {
    const a = vitalsAnomaly([{ date: '2026-07-15', hrvAvg: 18, sleepingHr: 88, respRate: 20, highHrAlerts: 19 }])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('alert')
    expect(a!.signals.length).toBe(4)
    expect(a!.text).toMatch(/descanso|hidrataci/i)
  })

  it('14-jul (2 señales): FC sueño alta + muchas alertas → watch', () => {
    const a = vitalsAnomaly([{ date: '2026-07-14', hrvAvg: 54, sleepingHr: 58, respRate: 16, highHrAlerts: 12 }])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('watch')
    expect(a!.signals.length).toBe(2)
  })

  it('día sano → null', () => {
    expect(vitalsAnomaly([{ date: '2026-07-16', hrvAvg: 70, sleepingHr: 50, respRate: 15, highHrAlerts: 0 }])).toBeNull()
  })

  it('toma el día más reciente con datos (ignora huecos posteriores)', () => {
    const a = vitalsAnomaly([
      { date: '2026-07-15', hrvAvg: 18, sleepingHr: 88, respRate: 20, highHrAlerts: 19 },
      { date: '2026-07-16' }, // sin datos → se ignora, gana el 15
    ])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('alert')
  })

  it('umbral VFC: 54 no dispara (borde), 53 sí cuenta como baja', () => {
    // 54 = mínimo, no es < min → no adversa; sola no alcanza igual
    expect(vitalsAnomaly([{ date: 'x', hrvAvg: 54, sleepingHr: 50, respRate: 15, highHrAlerts: 0 }])).toBeNull()
    // 53 (VFC baja) + FC alta = 2 señales → watch
    const a = vitalsAnomaly([{ date: 'x', hrvAvg: 53, sleepingHr: 60, respRate: 15, highHrAlerts: 0 }])
    expect(a!.signals).toContain('VFC baja')
  })

  it('respeta rangos custom', () => {
    const ranges = { ...DEFAULT_RANGES, respRateMax: 25 }
    // con respRateMax=25, resp 20 ya no es adversa → solo 1 señal (FC) → null
    expect(vitalsAnomaly([{ date: 'x', hrvAvg: 60, sleepingHr: 58, respRate: 20, highHrAlerts: 0 }], ranges)).toBeNull()
  })
})

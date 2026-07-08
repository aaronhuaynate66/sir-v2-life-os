// SIR V2 — Tests del cruce de horizontes (real ↔ conductual).

import { describe, it, expect } from 'vitest'
import { crossHorizons } from './horizonCross'

describe('crossHorizons', () => {
  it('null si falta el horizonte real (sin próximo período)', () => {
    expect(crossHorizons({ behaviorCenter: '2026-07-20', nextPeriodIso: null })).toBeNull()
  })

  it('null si falta el horizonte conductual (sin ventana ni centro)', () => {
    expect(crossHorizons({ nextPeriodIso: '2026-07-25' })).toBeNull()
  })

  it('el patrón conductual que precede al período (SPM) SOLAPA — antes marcaba diferencia', () => {
    // Período el 25; el patrón conductual pica del 20 al 23 (SPM típico).
    // El cruce viejo (centro 21 vs período 25) daba diff ~4d = "difieren".
    const r = crossHorizons({
      behaviorStart: '2026-07-20',
      behaviorEnd: '2026-07-23',
      behaviorCenter: '2026-07-21',
      nextPeriodIso: '2026-07-25',
    })
    expect(r).not.toBeNull()
    expect(r!.overlap).toBe(true)
    expect(r!.gapDays).toBe(0)
    expect(r!.pmsFrom).toBe('2026-07-20') // 25 - 5
    expect(r!.pmsTo).toBe('2026-07-26') // 25 + 1
  })

  it('ventanas lejanas → sin solape, gap en días', () => {
    const r = crossHorizons({
      behaviorStart: '2026-07-01',
      behaviorEnd: '2026-07-04',
      nextPeriodIso: '2026-07-25', // SPM: 20-26
    })
    expect(r!.overlap).toBe(false)
    expect(r!.gapDays).toBe(16) // del 04 al 20
  })

  it('deriva la ventana conductual del centro si no hay start/end (± halfWidth)', () => {
    const r = crossHorizons({ behaviorCenter: '2026-07-22', nextPeriodIso: '2026-07-25' })
    expect(r!.behaviorFrom).toBe('2026-07-20') // 22 - 2
    expect(r!.behaviorTo).toBe('2026-07-24') // 22 + 2
    expect(r!.overlap).toBe(true)
  })

  it('respeta pmsLeadDays configurable', () => {
    const r = crossHorizons({ behaviorCenter: '2026-07-18', nextPeriodIso: '2026-07-25', pmsLeadDays: 8 })
    expect(r!.pmsFrom).toBe('2026-07-17') // 25 - 8
    expect(r!.overlap).toBe(true) // 16-20 solapa 17-26
  })

  it('normaliza ventana invertida (start > end)', () => {
    const r = crossHorizons({ behaviorStart: '2026-07-23', behaviorEnd: '2026-07-20', nextPeriodIso: '2026-07-25' })
    expect(r!.behaviorFrom).toBe('2026-07-20')
    expect(r!.behaviorTo).toBe('2026-07-23')
  })
})

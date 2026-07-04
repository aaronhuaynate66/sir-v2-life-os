// SIR V2 — Tests de la regularidad del ciclo (17·M4).

import { describe, it, expect } from 'vitest'
import { computeCycleRegularity, periodStarts } from './regularity'

function bleeding(date: string) { return { date, phase: 'bleeding' } }

describe('periodStarts', () => {
  it('agrupa días de sangrado consecutivos en UN inicio por racha', () => {
    // Un período: 4 días seguidos → 1 inicio.
    const s = periodStarts([bleeding('2026-01-01'), bleeding('2026-01-02'), bleeding('2026-01-03'), bleeding('2026-01-04')])
    expect(s).toHaveLength(1)
  })
  it('separa períodos distintos por el gap', () => {
    const s = periodStarts([bleeding('2026-01-01'), bleeding('2026-01-02'), bleeding('2026-01-29'), bleeding('2026-01-30')])
    expect(s).toHaveLength(2)
  })
  it('ignora entradas que no son bleeding', () => {
    const s = periodStarts([bleeding('2026-01-01'), { date: '2026-01-14', phase: 'ovulation' }])
    expect(s).toHaveLength(1)
  })
})

describe('computeCycleRegularity', () => {
  it('menos de 2 ciclos → insufficient', () => {
    const r = computeCycleRegularity([bleeding('2026-01-01'), bleeding('2026-01-29')])
    expect(r.regularity).toBe('insufficient')
    expect(r.confidence).toBe('insufficient')
    expect(r.observedCycles).toBe(1)
  })

  it('ciclos parejos → regular, confianza alta, banda chica', () => {
    // Inicios cada 28 días exactos → stdev 0.
    const r = computeCycleRegularity([
      bleeding('2026-01-01'), bleeding('2026-01-29'), bleeding('2026-02-26'), bleeding('2026-03-26'),
    ])
    expect(r.regularity).toBe('regular')
    expect(r.confidence).toBe('high')
    expect(r.meanLengthDays).toBe(28)
    expect(r.bandDays).toBeLessThanOrEqual(2)
    expect(r.note).toMatch(/confiable/i)
  })

  it('ciclos muy dispares → irregular, confianza baja, banda amplia', () => {
    // Largos 21, 40, 24, 45 → stdev grande.
    const r = computeCycleRegularity([
      bleeding('2026-01-01'), bleeding('2026-01-22'), bleeding('2026-03-03'), bleeding('2026-03-27'), bleeding('2026-05-11'),
    ])
    expect(r.regularity).toBe('irregular')
    expect(r.confidence).toBe('low')
    expect(r.bandDays).toBeGreaterThan(5)
    expect(r.note).toMatch(/irregular|pinzas/i)
  })

  it('descarta gaps fuera de rango plausible (15-60)', () => {
    // Un gap enorme (>60) no cuenta como largo de ciclo.
    const r = computeCycleRegularity([
      bleeding('2026-01-01'), bleeding('2026-01-29'), bleeding('2026-06-01'),
    ])
    // Solo 1 largo válido (28) → insufficient.
    expect(r.observedCycles).toBe(1)
  })

  it('sin entradas → insufficient, sin romper', () => {
    const r = computeCycleRegularity([])
    expect(r.regularity).toBe('insufficient')
    expect(r.meanLengthDays).toBeNull()
  })
})

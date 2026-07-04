// SIR V2 — Tests de cronotipo + jet-lag social (11·M2 + 11·M4).

import { describe, it, expect } from 'vitest'
import { computeChronotype, computeSocialJetlag, type NightRow } from './chronotype'

// 2026-06-01 es lunes. Generamos noches consecutivas.
function nights(n: number, bedtime: string, duration: number, startISO = '2026-05-01'): NightRow[] {
  const start = Date.parse(`${startISO}T12:00:00Z`)
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    bedtime, duration,
  }))
}

describe('computeChronotype', () => {
  it('insufficient con menos de 14 noches', () => {
    const r = computeChronotype(nights(5, '23:00', 8))
    expect(r.sufficient).toBe(false)
    expect(r.position).toBeNull()
  })

  it('bedtime 23:00 + 8h → punto medio 03:00 → intermedio', () => {
    const r = computeChronotype(nights(20, '23:00', 8))
    expect(r.sufficient).toBe(true)
    expect(r.midSleepLabel).toBe('03:00')
    expect(r.position).toBe('intermedio')
  })

  it('dormir temprano → alondra; tarde → búho', () => {
    expect(computeChronotype(nights(20, '21:30', 8)).position).toBe('alondra') // mid 01:30
    expect(computeChronotype(nights(20, '02:00', 8)).position).toBe('búho') // mid 06:00
  })

  it('marca inestable si la varianza de horarios es enorme', () => {
    const mixed = [...nights(10, '21:00', 8), ...nights(10, '03:00', 8, '2026-05-20')]
    const r = computeChronotype(mixed)
    expect(r.unstable).toBe(true)
  })

  it('ignora noches sin horario real (00:00)', () => {
    const r = computeChronotype([...nights(14, '23:00', 8), ...nights(3, '00:00', 0, '2026-06-01')])
    expect(r.nights).toBe(14)
  })
})

describe('computeSocialJetlag', () => {
  it('insufficient sin contraste laboral/libre', () => {
    // Solo días de semana (2026-06-01 lunes … 5 días)
    const r = computeSocialJetlag(nights(5, '23:00', 8, '2026-06-01'))
    expect(r.sufficient).toBe(false)
  })

  it('detecta desfase >1h entre finde y semana', () => {
    // Semana (lun-vie): bed 23:00 → mid 03:00. Finde (sáb-dom): bed 02:00 → mid 06:00.
    const week = [
      ...nights(1, '23:00', 8, '2026-06-01'), ...nights(1, '23:00', 8, '2026-06-02'),
      ...nights(1, '23:00', 8, '2026-06-03'), ...nights(1, '23:00', 8, '2026-06-04'),
      ...nights(1, '23:00', 8, '2026-06-05'),
    ]
    const wknd = [...nights(1, '02:00', 8, '2026-06-06'), ...nights(1, '02:00', 8, '2026-06-07')]
    const r = computeSocialJetlag([...week, ...wknd])
    expect(r.sufficient).toBe(true)
    expect(r.offsetMinutes).toBe(180)
    expect(r.significant).toBe(true)
    expect(r.message).toMatch(/jet-lag social|bajón del lunes/i)
  })

  it('sin desfase relevante → no alarma', () => {
    const week = Array.from({ length: 5 }, (_, i) => nights(1, '23:00', 8, `2026-06-0${i + 1}`)).flat()
    const wknd = [...nights(1, '23:30', 8, '2026-06-06'), ...nights(1, '23:30', 8, '2026-06-07')]
    const r = computeSocialJetlag([...week, ...wknd])
    expect(r.significant).toBe(false)
  })
})

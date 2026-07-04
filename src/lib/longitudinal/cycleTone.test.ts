// SIR V2 — Tests del tono por fase del ciclo (17·M3).

import { describe, it, expect } from 'vitest'
import { groupLogToneByPhase, phaseOnDate } from './cycleTone'

// Ciclo de 28 días desde 2026-07-01: menstrual 1-5, folicular 6-12, ovu 13-15, lútea 16-28.
const START = '2026-07-01'

describe('phaseOnDate', () => {
  it('clasifica dentro del ciclo actual', () => {
    expect(phaseOnDate(START, 28, '2026-07-01')).toBe('menstrual') // día 1
    expect(phaseOnDate(START, 28, '2026-07-08')).toBe('follicular') // día 8
    expect(phaseOnDate(START, 28, '2026-07-14')).toBe('ovulation')  // día 14
    expect(phaseOnDate(START, 28, '2026-07-20')).toBe('luteal')     // día 20
  })
  it('proyecta hacia atrás (fecha anterior al inicio)', () => {
    // 2026-06-27 = 4 días antes del inicio → día 25 del ciclo previo → lútea.
    expect(phaseOnDate(START, 28, '2026-06-27')).toBe('luteal')
  })
  it('null si no parsea', () => {
    expect(phaseOnDate(START, 28, 'basura')).toBeNull()
  })
})

describe('groupLogToneByPhase', () => {
  it('promedia el tono por fase', () => {
    const logs = [
      { date: '2026-07-02', tone: 5 }, // menstrual
      { date: '2026-07-03', tone: 3 }, // menstrual
      { date: '2026-07-20', tone: 2 }, // lútea
      { date: '2026-07-21', tone: 2 }, // lútea
    ]
    const r = groupLogToneByPhase(logs, START, 28)
    const men = r.buckets.find((b) => b.phaseId === 'menstrual')!
    const lut = r.buckets.find((b) => b.phaseId === 'luteal')!
    expect(men.avgTone).toBe(4)
    expect(men.count).toBe(2)
    expect(lut.avgTone).toBe(2)
    expect(r.total).toBe(4)
  })

  it('marca la fase de tono más bajo (con muestra suficiente)', () => {
    const logs = [
      ...Array.from({ length: 3 }, () => ({ date: '2026-07-08', tone: 5 })), // folicular alto
      ...Array.from({ length: 3 }, () => ({ date: '2026-07-22', tone: 2 })), // lútea bajo
    ]
    const r = groupLogToneByPhase(logs, START, 28)
    expect(r.lowest?.phaseId).toBe('luteal')
  })

  it('no marca "lowest" sin muestra suficiente (n<3)', () => {
    const logs = [{ date: '2026-07-08', tone: 5 }, { date: '2026-07-22', tone: 2 }]
    expect(groupLogToneByPhase(logs, START, 28).lowest).toBeNull()
  })

  it('sin cycleStartDate → todo vacío', () => {
    const r = groupLogToneByPhase([{ date: '2026-07-08', tone: 3 }], null, 28)
    expect(r.total).toBe(0)
    expect(r.buckets.every((b) => b.avgTone === null)).toBe(true)
  })

  it('ignora tonos no numéricos', () => {
    const r = groupLogToneByPhase([{ date: '2026-07-08', tone: NaN }], START, 28)
    expect(r.total).toBe(0)
  })
})

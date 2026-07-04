// SIR V2 — Tests del back-fill de notas de sueño (SF·F1.5).

import { describe, it, expect } from 'vitest'
import { parseSleepNotes, enrichSleepRecord } from './parseNotes'
import { buildSleepNotes } from '@/lib/capture/sleep/map'
import type { SleepRecord } from '@/types'

describe('parseSleepNotes — round-trip con buildSleepNotes', () => {
  it('recupera exactamente lo que buildSleepNotes escribió', () => {
    const notes = buildSleepNotes(
      { deep_minutes: 81, light_minutes: 246, rem_minutes: 28, awake_minutes: 6 },
      75,
      'high',
      { awakenings: 3, napMinutes: 56, respiratoryRate: 15, spo2Avg: 98 },
    )
    const p = parseSleepNotes(notes)
    expect(p.score).toBe(75)
    expect(p.awakenings).toBe(3)
    expect(p.deepMin).toBe(81)
    expect(p.lightMin).toBe(246)
    expect(p.remMin).toBe(28)
    expect(p.awakeMin).toBe(6)
  })

  it('maneja fases en horas+minutos ("4h6m")', () => {
    const notes = buildSleepNotes(
      { deep_minutes: 90, light_minutes: 246, rem_minutes: 60, awake_minutes: null },
      null,
      'medium',
    )
    const p = parseSleepNotes(notes)
    expect(p.deepMin).toBe(90) // "1h30m"
    expect(p.lightMin).toBe(246) // "4h6m"
    expect(p.remMin).toBe(60) // "1h"
    expect(p.awakeMin).toBeUndefined()
    expect(p.score).toBeUndefined()
  })
})

describe('parseSleepNotes — notas de Apple y borde', () => {
  it('recupera el score de una nota de Apple Health', () => {
    expect(parseSleepNotes('Apple Health · score 92/100').score).toBe(92)
  })

  it('nota sin data rica → objeto vacío', () => {
    expect(parseSleepNotes('Apple Health')).toEqual({})
    expect(parseSleepNotes(null)).toEqual({})
    expect(parseSleepNotes(undefined)).toEqual({})
  })

  it('no confunde la Siesta con una fase', () => {
    const p = parseSleepNotes('Captura sueño (pantallazo, conf. high) · Siesta 45m')
    expect(p.deepMin).toBeUndefined()
    expect(p.lightMin).toBeUndefined()
  })
})

describe('enrichSleepRecord', () => {
  const base: SleepRecord = {
    id: 'x', date: '2026-06-05', bedtime: '01:29', wakeTime: '07:42',
    duration: 5.92, quality: 8,
    notes: 'Captura sueño (pantallazo, conf. high) · score 75/100 · Profundo 1h21m · Liviano 4h6m · REM 28m · Vigilia 6m · Despertares 3',
  }

  it('rellena los campos estructurados faltantes desde notes', () => {
    const e = enrichSleepRecord(base)
    expect(e.score).toBe(75)
    expect(e.awakenings).toBe(3)
    expect(e.deepMin).toBe(81)
    expect(e.remMin).toBe(28)
  })

  it('NO pisa un valor ya estructurado (no destructivo)', () => {
    const e = enrichSleepRecord({ ...base, score: 90 })
    expect(e.score).toBe(90) // el valor real gana sobre el parseado (75)
  })

  it('si ya está todo estructurado devuelve la MISMA referencia', () => {
    const full: SleepRecord = { ...base, score: 75, awakenings: 3, deepMin: 81, lightMin: 246, remMin: 28, awakeMin: 6 }
    expect(enrichSleepRecord(full)).toBe(full)
  })

  it('sin nada que rescatar devuelve la misma referencia', () => {
    const plain: SleepRecord = { id: 'y', date: '2026-06-01', bedtime: '23:00', wakeTime: '07:00', duration: 8, quality: 7, notes: 'Apple Health' }
    expect(enrichSleepRecord(plain)).toBe(plain)
  })
})

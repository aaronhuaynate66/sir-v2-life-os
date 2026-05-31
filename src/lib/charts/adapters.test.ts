// SIR V2 — Tests de los adapters de dominio → series (Feature 3).
//
// Verifican el mapeo + agregación específicos de cada fuente: balance
// acumulado financiero (con signo por tipo), métricas por categoría, sueño,
// y tono de interacción. Casos borde: vacío, multi-moneda (usa amountPEN),
// varias lecturas por día.

import { describe, it, expect } from 'vitest'

import type { FinancialMovement, SelfMetric, SleepRecord } from '@/types'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import {
  financeBalanceSeries,
  financeDailyNetSeries,
  selfMetricSeries,
  sleepDurationSeries,
  sleepQualitySeries,
  personLogToneSeries,
} from './adapters'

function mov(over: Partial<FinancialMovement>): FinancialMovement {
  return {
    id: over.id ?? 'm1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 100,
    currency: over.currency ?? 'PEN',
    exchangeRate: over.exchangeRate ?? 1,
    amountPEN: over.amountPEN ?? over.amount ?? 100,
    category: over.category ?? 'other',
    description: '',
    date: over.date ?? '2026-05-01',
    recurrent: false,
    tags: [],
    ...over,
  }
}

describe('financeBalanceSeries', () => {
  it('vacío → []', () => {
    expect(financeBalanceSeries([])).toEqual([])
  })

  it('acumula el neto con signo (income +, expense -) en orden cronológico', () => {
    const out = financeBalanceSeries([
      mov({ id: 'a', type: 'income', amountPEN: 1000, date: '2026-05-01' }),
      mov({ id: 'b', type: 'expense', amountPEN: 300, date: '2026-05-02' }),
      mov({ id: 'c', type: 'expense', amountPEN: 200, date: '2026-05-03' }),
    ])
    expect(out.map((p) => p.value)).toEqual([1000, 700, 500])
  })

  it('usa amountPEN (multi-moneda ya convertida) y suma intradía', () => {
    const out = financeBalanceSeries([
      mov({ id: 'a', type: 'income', amount: 100, currency: 'USD', exchangeRate: 3.7, amountPEN: 370, date: '2026-05-01' }),
      mov({ id: 'b', type: 'expense', amountPEN: 70, date: '2026-05-01' }),
    ])
    // un solo día: 370 - 70 = 300 acumulado.
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(300)
  })

  it('ordena aunque los movimientos lleguen desordenados', () => {
    const out = financeBalanceSeries([
      mov({ id: 'late', type: 'expense', amountPEN: 100, date: '2026-05-10' }),
      mov({ id: 'early', type: 'income', amountPEN: 500, date: '2026-05-01' }),
    ])
    expect(out[0].date).toBe('2026-05-01')
    expect(out[0].value).toBe(500)
    expect(out[1].value).toBe(400)
  })
})

describe('financeDailyNetSeries', () => {
  it('neto por día sin acumular', () => {
    const out = financeDailyNetSeries([
      mov({ id: 'a', type: 'income', amountPEN: 1000, date: '2026-05-01' }),
      mov({ id: 'b', type: 'expense', amountPEN: 300, date: '2026-05-02' }),
    ])
    const byDate = Object.fromEntries(out.map((p) => [p.date, p.value]))
    expect(byDate['2026-05-01']).toBe(1000)
    expect(byDate['2026-05-02']).toBe(-300)
  })
})

describe('selfMetricSeries', () => {
  const metric = (category: SelfMetric['category'], value: number, ts: string): SelfMetric => ({
    id: `${category}_${ts}`, category, value, timestamp: ts,
  })

  it('filtra por categoría y promedia por día', () => {
    const out = selfMetricSeries(
      [
        metric('energy', 4, '2026-05-01T08:00:00Z'),
        metric('energy', 6, '2026-05-01T18:00:00Z'),
        metric('stress', 9, '2026-05-01T12:00:00Z'), // otra categoría → ignorada
        metric('energy', 7, '2026-05-02T09:00:00Z'),
      ],
      'energy',
    )
    const byDate = Object.fromEntries(out.map((p) => [p.date, p.value]))
    expect(byDate['2026-05-01']).toBe(5)
    expect(byDate['2026-05-02']).toBe(7)
  })

  it('categoría sin lecturas → []', () => {
    expect(selfMetricSeries([metric('mood', 5, '2026-05-01')], 'energy')).toEqual([])
  })
})

describe('sleep series', () => {
  const rec = (over: Partial<SleepRecord>): SleepRecord => ({
    id: over.id ?? 's1',
    date: over.date ?? '2026-05-01',
    bedtime: '23:00',
    wakeTime: '07:00',
    duration: over.duration ?? 8,
    quality: over.quality ?? 7,
    ...over,
  })

  it('duración y calidad por noche', () => {
    const records = [rec({ date: '2026-05-01', duration: 7, quality: 6 }), rec({ date: '2026-05-02', duration: 8, quality: 8 })]
    expect(sleepDurationSeries(records).map((p) => p.value)).toEqual([7, 8])
    expect(sleepQualitySeries(records).map((p) => p.value)).toEqual([6, 8])
  })

  it('sin registros → []', () => {
    expect(sleepDurationSeries([])).toEqual([])
  })
})

describe('personLogToneSeries', () => {
  let seq = 0
  const plog = (kind: PersonLogKind, value: number, loggedAt: string): PersonLog => {
    seq += 1
    return { id: `l${seq}`, userId: 'u', personId: 'p', kind, value, note: null, loggedAt, createdAt: loggedAt }
  }

  it('default kind=interaction, promedia por día, ignora otros kinds', () => {
    const out = personLogToneSeries([
      plog('interaction', 4, '2026-05-01T10:00:00Z'),
      plog('interaction', 2, '2026-05-01T20:00:00Z'),
      plog('mood', 5, '2026-05-01T12:00:00Z'), // ignorado
      plog('interaction', 5, '2026-05-02T10:00:00Z'),
    ])
    const byDate = Object.fromEntries(out.map((p) => [p.date, p.value]))
    expect(byDate['2026-05-01']).toBe(3)
    expect(byDate['2026-05-02']).toBe(5)
  })

  it('puede pedir otro kind (ej. mood)', () => {
    const out = personLogToneSeries(
      [plog('mood', 4, '2026-05-01T10:00:00Z'), plog('interaction', 1, '2026-05-01T10:00:00Z')],
      'mood',
    )
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe(4)
  })

  it('descarta value 0 / no positivos', () => {
    const out = personLogToneSeries([
      plog('interaction', 0, '2026-05-01T10:00:00Z'),
      plog('interaction', 3, '2026-05-01T11:00:00Z'),
    ])
    expect(out[0].value).toBe(3)
  })
})

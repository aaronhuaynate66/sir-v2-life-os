// SIR V2 — Tests de helpers de la serie temporal (puro).

import { describe, it, expect } from 'vitest'
import type { TrackerPoint } from '@/types'
import {
  pointsForTracker,
  latestPoint,
  toSeries,
  deriveCurrentFromPoints,
  buildPoints,
} from './points'

function pt(id: string, trackerId: string, date: string, value: number, createdAt = `${date}T00:00:00.000Z`): TrackerPoint {
  return { id, trackerId, value, date, source: 'manual_screenshot', createdAt }
}

const POINTS: TrackerPoint[] = [
  pt('a', 't1', '2026-06-03', 5075),
  pt('b', 't1', '2026-05-28', 5566),
  pt('c', 't2', '2026-06-01', 99),
]

describe('pointsForTracker', () => {
  it('filtra por tracker y ordena por fecha asc', () => {
    const r = pointsForTracker(POINTS, 't1')
    expect(r.map((p) => p.id)).toEqual(['b', 'a'])
  })
})

describe('latestPoint', () => {
  it('devuelve el más reciente', () => {
    expect(latestPoint(POINTS, 't1')?.id).toBe('a')
  })
  it('null si no hay', () => {
    expect(latestPoint(POINTS, 'nope')).toBeNull()
  })
})

describe('toSeries', () => {
  it('mapea a {date,value} ordenado', () => {
    expect(toSeries(POINTS, 't1')).toEqual([
      { date: '2026-05-28', value: 5566 },
      { date: '2026-06-03', value: 5075 },
    ])
  })
})

describe('deriveCurrentFromPoints', () => {
  it('toma el último punto', () => {
    const patch = deriveCurrentFromPoints(POINTS, 't1', '2026-06-03T10:00:00.000Z')
    expect(patch.currentValue).toBe(5075)
    expect(patch.currentValueDate).toBe('2026-06-03')
    expect(patch.lastUpdated).toBe('2026-06-03T10:00:00.000Z')
  })
  it('sin puntos → patch vacío', () => {
    expect(deriveCurrentFromPoints(POINTS, 'nope', 'x')).toEqual({})
  })
})

describe('buildPoints', () => {
  it('dedup por fecha: la última lectura gana', () => {
    const r = buildPoints('t1', [
      { value: 5100, date: '2026-06-03' },
      { value: 5075, date: '2026-06-03' }, // misma fecha, gana esta
      { value: 5566, date: '2026-05-28' },
    ], 'batch')
    expect(r).toHaveLength(2)
    const jun3 = r.find((p) => p.date === '2026-06-03')
    expect(jun3?.value).toBe(5075)
    expect(jun3?.trackerId).toBe('t1')
  })
  it('descarta lecturas sin fecha o valor no finito', () => {
    const r = buildPoints('t1', [
      { value: Number.NaN, date: '2026-06-03' },
      { value: 100, date: '' },
      { value: 200, date: '2026-06-04' },
    ], 'batch')
    expect(r).toHaveLength(1)
    expect(r[0].value).toBe(200)
  })
  it('ids únicos dentro del batch', () => {
    const r = buildPoints('t1', [
      { value: 1, date: '2026-06-01' },
      { value: 2, date: '2026-06-02' },
    ], 'batch')
    expect(new Set(r.map((p) => p.id)).size).toBe(2)
  })
})

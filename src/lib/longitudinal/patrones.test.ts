import { describe, it, expect } from 'vitest'
import { groupMomentsByExplicitCycle, groupMomentsByLunar, topBucket } from './patrones'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'

function moment(occurredOn: string, title = 'evento'): RelationshipMoment {
  return {
    id: `m_${occurredOn}`, personId: 'p', title, detail: null,
    status: 'resuelto', occurredOn, followUpOn: null, resolution: null,
    createdAt: `${occurredOn}T00:00:00Z`, updatedAt: `${occurredOn}T00:00:00Z`,
  }
}

function cycleEntry(date: string, phase: PersonCycleEntry['phase']): PersonCycleEntry {
  return { id: `c_${date}`, personId: 'p', date, phase, confidence: 'medium', source: 'aaron', note: null, createdAt: `${date}T00:00:00Z` }
}

describe('groupMomentsByExplicitCycle', () => {
  it('sin moments o sin cycles → buckets con 0', () => {
    const r = groupMomentsByExplicitCycle([], [])
    expect(r.total).toBe(0)
    expect(r.buckets.every((b) => b.count === 0)).toBe(true)
  })

  it('agrupa moments por fase registrada', () => {
    const cycles = [
      cycleEntry('2026-06-27', 'bleeding'), cycleEntry('2026-06-28', 'bleeding'),
      cycleEntry('2026-07-10', 'mid_cycle'),
    ]
    const moments = [
      moment('2026-06-27', 'pelea'),
      moment('2026-06-28', 'pelea 2'),
      moment('2026-07-10', 'encuentro'),
      moment('2026-06-15', 'antiguo'), // sin cycle ese día → descartado
    ]
    const r = groupMomentsByExplicitCycle(moments, cycles)
    expect(r.total).toBe(3)
    const bleeding = r.buckets.find((b) => b.phaseId === 'bleeding')!
    expect(bleeding.count).toBe(2)
    expect(bleeding.fraction).toBeCloseTo(2 / 3, 2)
  })
})

describe('groupMomentsByLunar', () => {
  it('distribuye por fase lunar', () => {
    // La luna varía por fecha real — usamos 3 fechas distintas y verificamos total.
    const r = groupMomentsByLunar([
      moment('2026-01-01'), moment('2026-01-15'), moment('2026-02-01'),
    ])
    expect(r.total).toBe(3)
    // Al menos 1 bucket con count > 0.
    expect(r.buckets.some((b) => b.count > 0)).toBe(true)
  })
})

describe('topBucket', () => {
  it('null cuando total=0', () => {
    expect(topBucket({ buckets: [], total: 0 })).toBe(null)
  })

  it('devuelve bucket con mayor count', () => {
    const cycles = [cycleEntry('2026-06-27', 'bleeding'), cycleEntry('2026-06-28', 'bleeding'), cycleEntry('2026-07-10', 'mid_cycle')]
    const moments = [moment('2026-06-27'), moment('2026-06-28'), moment('2026-07-10')]
    const r = groupMomentsByExplicitCycle(moments, cycles)
    const top = topBucket(r)
    expect(top?.phaseId).toBe('bleeding')
    expect(top?.count).toBe(2)
  })
})

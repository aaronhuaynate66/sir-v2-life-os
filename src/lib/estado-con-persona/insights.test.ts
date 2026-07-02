import { describe, it, expect } from 'vitest'
import { buildEstadoInsights } from './insights'
import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { Memory } from '@/types'

const NOW = new Date('2026-07-02T20:00:00-05:00')

function log(value: number, iso: string): PersonLog {
  return { id: `l_${iso}`, userId: 'u', personId: 'p', kind: 'interaction', value, note: null, loggedAt: iso, createdAt: iso }
}

function moment(title: string, followUpOn: string | null, status: 'abierto' | 'resuelto' = 'abierto'): RelationshipMoment {
  return {
    id: `m_${title}`, personId: 'p', title, detail: null, status,
    occurredOn: '2026-06-01', followUpOn, resolution: null,
    createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  }
}

function cycleEntry(date: string, phase: PersonCycleEntry['phase']): PersonCycleEntry {
  return { id: `c_${date}`, personId: 'p', date, phase, confidence: 'medium', source: 'aaron', note: null, createdAt: `${date}T00:00:00Z` }
}

function mem(title: string, timestamp: string): Memory {
  return {
    id: `mem_${title}`, personId: 'p', title, content: '', type: 'other' as Memory['type'],
    timestamp, tags: [], emotionalContext: 'neutral', importance: 5,
  } as unknown as Memory
}

const NO_MOMENTS: RelationshipMoment[] = []
const NO_CYCLES: PersonCycleEntry[] = []
const NO_MEMORIES: Memory[] = []

describe('buildEstadoInsights', () => {
  it('sin ningún dato → sin_data', () => {
    const r = buildEstadoInsights({ personLogs: [], moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW })
    expect(r.overallLabel).toBe('sin_data')
    expect(r.lastInteractionAt).toBe(null)
    expect(r.daysSinceLast).toBe(null)
    expect(r.recentAvg).toBe(null)
  })

  it('última interacción calcula daysSinceLast', () => {
    const r = buildEstadoInsights({
      personLogs: [log(4, '2026-06-29T20:00:00-05:00')], moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW,
    })
    expect(r.lastInteractionValue).toBe(4)
    expect(r.daysSinceLast).toBeGreaterThanOrEqual(2)
    expect(r.daysSinceLast).toBeLessThanOrEqual(4)
  })

  it('promedios y delta con 6 logs', () => {
    // Recientes (últimos 3): 2, 3, 4 → 3.0
    // Anteriores (3 previos): 5, 5, 5 → 5.0
    // Delta: -2.0 (empeorando)
    const logs = [
      log(2, '2026-06-30T20:00:00-05:00'),
      log(3, '2026-06-28T20:00:00-05:00'),
      log(4, '2026-06-26T20:00:00-05:00'),
      log(5, '2026-06-20T20:00:00-05:00'),
      log(5, '2026-06-15T20:00:00-05:00'),
      log(5, '2026-06-10T20:00:00-05:00'),
    ]
    const r = buildEstadoInsights({ personLogs: logs, moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW })
    expect(r.recentAvg).toBe(3)
    expect(r.previousAvg).toBe(5)
    expect(r.toneDelta).toBe(-2)
  })

  it('label "en_tension" con overdue', () => {
    const r = buildEstadoInsights({
      personLogs: [log(4, '2026-07-01T20:00:00-05:00')],
      moments: [moment('Discusión pendiente', '2026-06-15')], // overdue
      personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW,
    })
    expect(r.overdueCount).toBe(1)
    expect(r.overallLabel).toBe('en_tension')
    expect(r.mostUrgent?.urgency).toBe('overdue')
  })

  it('label "en_tension" con tono muy bajo (≤2.3)', () => {
    const r = buildEstadoInsights({
      personLogs: [log(2, '2026-06-30T20:00:00-05:00'), log(2, '2026-06-28T20:00:00-05:00'), log(2, '2026-06-26T20:00:00-05:00')],
      moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW,
    })
    expect(r.overallLabel).toBe('en_tension')
  })

  it('label "distante" con >21 días sin contacto y sin moments', () => {
    const r = buildEstadoInsights({
      personLogs: [log(4, '2026-05-15T20:00:00-05:00')], // ~48 días atrás
      moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW,
    })
    expect(r.overallLabel).toBe('distante')
  })

  it('label "cerca" con tono alto y delta positivo', () => {
    // Recientes: 5, 5, 4 → 4.7
    // Anteriores: 3, 3, 3 → 3.0
    const logs = [
      log(5, '2026-07-01T20:00:00-05:00'),
      log(5, '2026-06-29T20:00:00-05:00'),
      log(4, '2026-06-27T20:00:00-05:00'),
      log(3, '2026-06-20T20:00:00-05:00'),
      log(3, '2026-06-15T20:00:00-05:00'),
      log(3, '2026-06-10T20:00:00-05:00'),
    ]
    const r = buildEstadoInsights({ personLogs: logs, moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW })
    expect(r.recentAvg).toBeGreaterThanOrEqual(4)
    expect(r.toneDelta).toBeGreaterThan(0)
    expect(r.overallLabel).toBe('cerca')
  })

  it('ciclo del día si hay entry', () => {
    const r = buildEstadoInsights({
      personLogs: [log(4, '2026-07-02T20:00:00-05:00')],
      moments: NO_MOMENTS,
      personCycles: [cycleEntry('2026-07-02', 'bleeding'), cycleEntry('2026-07-01', 'bleeding'), cycleEntry('2026-06-30', 'bleeding')],
      memories: NO_MEMORIES, now: NOW,
    })
    expect(r.todayCyclePhase).toBe('bleeding')
    expect(r.cycleDataAvailable).toBe(true)
  })

  it('memorias en ventana 60d', () => {
    const r = buildEstadoInsights({
      personLogs: [], moments: NO_MOMENTS, personCycles: NO_CYCLES,
      memories: [mem('Le gusta el helado', '2026-06-20T00:00:00Z'), mem('Vieja', '2025-01-01T00:00:00Z')],
      now: NOW,
    })
    expect(r.recentMemoryCount).toBe(1)
    expect(r.latestMemoryTitle).toBe('Le gusta el helado')
  })
})

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

  it('NO es "distante" si hubo contacto reciente en el sustrato (lastContactAt), aunque los person_logs estén viejos', () => {
    // Mismos logs viejos que el caso "distante" (~48d), pero habló hace 1 día por
    // chat → la recencia real manda. Arregla el bug de los 33 "distante" falsos.
    const r = buildEstadoInsights({
      personLogs: [log(4, '2026-05-15T20:00:00-05:00')],
      moments: NO_MOMENTS, personCycles: NO_CYCLES, memories: NO_MEMORIES, now: NOW,
      lastContactAt: '2026-07-01T10:00:00-05:00',
    })
    expect(r.overallLabel).not.toBe('distante')
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

describe('en_tension por CAÍDA, no solo por nivel bajo', () => {
  // Caso real medido el 31-jul-2026: Diana venía de 3.67 y cayó a 2.33 (toneDelta
  // -1.33). El umbral absoluto de 2.3 fallaba por 0.03 y el label quedaba 'estable'
  // el mismo día que Aaron preguntó por qué SIR no le avisaba nada.
  const log = (value: number, loggedAt: string) => ({
    id: `l-${loggedAt}-${value}`, userId: 'u1', personId: 'p1',
    kind: 'interaction' as const, value, note: null, loggedAt, createdAt: loggedAt,
  })
  const base = { moments: [], personCycles: [], memories: [], now: new Date('2026-07-31T20:00:00Z') }

  it('el caso de Diana: 3.67 → 2.33 ahora es en_tension (fallaba por 0.03)', () => {
    const out = buildEstadoInsights({
      ...base,
      personLogs: [
        log(3, '2026-07-31T16:30:00Z'), log(2, '2026-07-30T22:30:00Z'), log(2, '2026-07-29T12:45:00Z'),
        log(3, '2026-07-27T23:00:00Z'), log(4, '2026-07-07T01:13:00Z'), log(4, '2026-07-07T00:59:00Z'),
      ],
      lastContactAt: '2026-07-31T16:27:00Z',
    })
    expect(out.recentAvg).toBeCloseTo(2.3, 1)
    expect(out.toneDelta).toBeLessThanOrEqual(-1)
    expect(out.overallLabel).toBe('en_tension')
  })

  it('una relación excelente que baja un punto NO es tensión (5 → 4 sigue siendo buen tono)', () => {
    const out = buildEstadoInsights({
      ...base,
      personLogs: [
        log(4, '2026-07-31T10:00:00Z'), log(4, '2026-07-30T10:00:00Z'), log(4, '2026-07-29T10:00:00Z'),
        log(5, '2026-07-20T10:00:00Z'), log(5, '2026-07-19T10:00:00Z'), log(5, '2026-07-18T10:00:00Z'),
      ],
      lastContactAt: '2026-07-31T10:00:00Z',
    })
    expect(out.toneDelta).toBeLessThanOrEqual(-1)
    expect(out.overallLabel).not.toBe('en_tension')
  })
})

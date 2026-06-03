// SIR V2 — Tests de las señales de conversación con peso por recencia.

import { describe, it, expect } from 'vitest'

import {
  classifyRecency,
  recencyLabel,
  readConversationSignals,
  hasRichConversationData,
  RECENCY_THRESHOLDS,
} from './conversationSignals'

const NOW = new Date('2026-06-03T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('classifyRecency', () => {
  it('clasifica por umbrales', () => {
    expect(classifyRecency(daysAgo(1), NOW)).toBe('recent')
    expect(classifyRecency(daysAgo(RECENCY_THRESHOLDS.recent), NOW)).toBe('recent')
    expect(classifyRecency(daysAgo(RECENCY_THRESHOLDS.recent + 1), NOW)).toBe('months')
    expect(classifyRecency(daysAgo(RECENCY_THRESHOLDS.months + 1), NOW)).toBe('old')
    expect(classifyRecency(daysAgo(RECENCY_THRESHOLDS.old + 1), NOW)).toBe('stale')
  })

  it('un rol de hace años es stale (degradable)', () => {
    expect(classifyRecency('2021-03-01', NOW)).toBe('stale')
  })

  it('fecha futura (plan / cumpleaños próximo) → recent', () => {
    expect(classifyRecency(daysAgo(-10), NOW)).toBe('recent')
  })

  it('fecha date-only YYYY-MM-DD se parsea', () => {
    expect(classifyRecency('2026-06-01', NOW)).toBe('recent')
  })

  it('ISO inválido o ausente → null', () => {
    expect(classifyRecency(null, NOW)).toBeNull()
    expect(classifyRecency(undefined, NOW)).toBeNull()
    expect(classifyRecency('no-es-fecha', NOW)).toBeNull()
  })
})

describe('recencyLabel', () => {
  it('mapea cada cubeta a español', () => {
    expect(recencyLabel('recent')).toBe('reciente')
    expect(recencyLabel('stale')).toBe('antiguo')
  })
})

describe('readConversationSignals', () => {
  it('parte los bloques en recientes (cola) e históricos (cabeza)', () => {
    const data = {
      blockSummaries: ['b0 viejo', 'b1', 'b2', 'b3', 'b4', 'b5 nuevo'],
      dateRange: { first: '2023-01-01', last: daysAgo(3) },
      messageCount: 2023,
    }
    const s = readConversationSignals(data, daysAgo(3), NOW, 2)
    expect(s.recentBlocks).toEqual(['b4', 'b5 nuevo'])
    expect(s.historicalBlocks).toEqual(['b0 viejo', 'b1', 'b2', 'b3'])
    expect(s.overallRecency).toBe('recent')
    expect(s.messageCount).toBe(2023)
    expect(s.firstISO).toBe('2023-01-01')
  })

  it('pocos bloques → todos recientes, ninguno histórico', () => {
    const s = readConversationSignals({ blockSummaries: ['a', 'b'] }, daysAgo(1), NOW, 4)
    expect(s.recentBlocks).toEqual(['a', 'b'])
    expect(s.historicalBlocks).toEqual([])
  })

  it('resuelve la recencia de cada fecha extraída', () => {
    const data = {
      extractedDates: [
        { label: 'Reunión Boticas Jhodaal', dateISO: daysAgo(5), rawText: 'nos vemos', recurring: false },
        { label: 'Cuando fue delegada', dateISO: '2021-03-01', rawText: 'fui delegada', recurring: false },
        { label: 'sin fecha', dateISO: null, rawText: 'x', recurring: false },
      ],
    }
    const s = readConversationSignals(data, daysAgo(5), NOW)
    expect(s.dates[0].recency).toBe('recent')
    expect(s.dates[1].recency).toBe('stale')
    expect(s.dates[2].recency).toBeNull()
  })

  it('lee facts/events/topics/emoción defensivamente', () => {
    const s = readConversationSignals(
      {
        facts: ['trabaja en Boticas Jhodaal', '', 'le interesa una web'],
        events: ['planea cotizar'],
        topics: ['business', 'web'],
        emotionalStates: { user: 'focused', otherPerson: 'interested' },
      },
      daysAgo(2),
      NOW,
    )
    expect(s.facts).toEqual(['trabaja en Boticas Jhodaal', 'le interesa una web'])
    expect(s.events).toEqual(['planea cotizar'])
    expect(s.emotionalOther).toBe('interested')
  })

  it('lastISO cae a conversationDate y luego observedAt', () => {
    expect(readConversationSignals({ conversationDate: daysAgo(7) }, daysAgo(99), NOW).lastISO).toBe(daysAgo(7))
    expect(readConversationSignals({}, daysAgo(9), NOW).lastISO).toBe(daysAgo(9))
  })
})

describe('hasRichConversationData', () => {
  it('true si hay blockSummaries/facts/events/fechas', () => {
    expect(hasRichConversationData({ blockSummaries: ['a'] })).toBe(true)
    expect(hasRichConversationData({ facts: ['x'] })).toBe(true)
    expect(hasRichConversationData({ extractedDates: [{ label: 'y' }] })).toBe(true)
  })
  it('false si solo hay summary/topics', () => {
    expect(hasRichConversationData({ summary: 'hola', topics: ['a'] })).toBe(false)
    expect(hasRichConversationData({})).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'

import { initiationInsight, latencyInsight } from './insight'
import type { ConversationAnalytics } from './analyze'

function base(over: Partial<ConversationAnalytics> = {}): ConversationAnalytics {
  return {
    total: 997, byMe: 425, byThem: 572, firstAt: 0, lastAt: 0, spanDays: 8, lastContactDaysAgo: 1,
    volume: null, cadence: null, latency: { myMedianMinutes: 0, theirMedianMinutes: 0 },
    myShare: 0.43, myInitiationShare: 0.8, tone: null, topics: null, insufficient: [],
    ...over,
  }
}

describe('initiationInsight', () => {
  it('caso Diana: abrís vos pero se engancha (manda más + responde al toque)', () => {
    const s = initiationInsight(base(), 'Diana')
    expect(s).toBe('Abres tú 80% de las charlas, pero Diana se engancha: manda más (57%) y responde al toque.')
  })

  it('sin latencia rápida omite el "responde al toque"', () => {
    const s = initiationInsight(base({ latency: { myMedianMinutes: 3, theirMedianMinutes: 90 } }), 'Diana')
    expect(s).toBe('Abres tú 80% de las charlas, pero Diana se engancha: manda más (57%).')
  })

  it('la otra persona abre casi siempre', () => {
    const s = initiationInsight(base({ myInitiationShare: 0.2, myShare: 0.5 }), 'Fran')
    expect(s).toContain('Fran abre casi siempre (80% de las charlas)')
  })

  it('llevás vos los dos ejes (abrís y hablás más)', () => {
    const s = initiationInsight(base({ myInitiationShare: 0.8, myShare: 0.62 }), 'Ivis')
    expect(s).toBe('Llevas tú la conversación: abres 80% y mandas 62% de los mensajes.')
  })

  it('conversación pareja → sin insight (null)', () => {
    expect(initiationInsight(base({ myInitiationShare: 0.5, myShare: 0.5 }), 'Ana')).toBeNull()
  })

  it('pocos mensajes o sin datos → null', () => {
    expect(initiationInsight(base({ total: 4 }), 'Ana')).toBeNull()
    expect(initiationInsight(base({ myInitiationShare: null }), 'Ana')).toBeNull()
  })
})

describe('latencyInsight', () => {
  it('la otra persona responde mucho más rápido', () => {
    const s = latencyInsight(base({ latency: { myMedianMinutes: 120, theirMedianMinutes: 2 } }), 'Diana')
    expect(s).toBe('Diana responde mucho más rápido que tú (~2 min vs ~2 h).')
  })
  it('vos respondés mucho más rápido', () => {
    const s = latencyInsight(base({ latency: { myMedianMinutes: 3, theirMedianMinutes: 45 } }), 'Fran')
    expect(s).toBe('Respondes mucho más rápido que Fran (~3 min vs ~45 min).')
  })
  it('latencia 0 de un lado → "al toque"', () => {
    const s = latencyInsight(base({ latency: { myMedianMinutes: 45, theirMedianMinutes: 0 } }), 'Ana')
    expect(s).toBe('Ana responde mucho más rápido que tú (al toque vs ~45 min).')
  })
  it('ambos rápidos o parejo → null', () => {
    expect(latencyInsight(base({ latency: { myMedianMinutes: 2, theirMedianMinutes: 5 } }), 'Ana')).toBeNull()
    expect(latencyInsight(base({ latency: { myMedianMinutes: 40, theirMedianMinutes: 30 } }), 'Ana')).toBeNull()
  })
  it('sin datos de latencia → null', () => {
    expect(latencyInsight(base({ latency: null }), 'Ana')).toBeNull()
    expect(latencyInsight(base({ latency: { myMedianMinutes: null, theirMedianMinutes: 5 } }), 'Ana')).toBeNull()
  })
})

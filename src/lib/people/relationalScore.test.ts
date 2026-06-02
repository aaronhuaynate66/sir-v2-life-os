import { describe, it, expect } from 'vitest'

import { computeRelationalScore, healthBand } from './relationalScore'

const NOW = new Date('2026-06-01T12:00:00Z')

describe('computeRelationalScore', () => {
  it('persona recién creada (importance/trust default 5, sin chat) → fuerza 40, confianza 50', () => {
    const b = computeRelationalScore({ importanceScore: 5, trustLevel: 5, lastChatObservedAt: null }, NOW)
    expect(b.fuerza).toBe(40) // 50 - 10 (sin chat)
    expect(b.confianza).toBe(50)
    expect(b.reciprocidad).toBeNull()
    expect(b.global).toBe(45) // (40 + 50) / 2
    expect(b.daysSinceLastChat).toBeNull()
  })

  it('chat reciente (<14d) suma +10 a fuerza', () => {
    const b = computeRelationalScore(
      { importanceScore: 8, trustLevel: 7, lastChatObservedAt: '2026-05-29T12:00:00Z' },
      NOW,
    )
    expect(b.daysSinceLastChat).toBe(3)
    expect(b.fuerza).toBe(90) // 80 + 10
    expect(b.confianza).toBe(70)
    expect(b.global).toBe(80)
  })

  it('chat viejo (>60d) resta 10; clamp a [0,100]', () => {
    const b = computeRelationalScore(
      { importanceScore: 1, trustLevel: 1, lastChatObservedAt: '2026-01-01T12:00:00Z' },
      NOW,
    )
    expect(b.daysSinceLastChat).toBeGreaterThan(60)
    expect(b.fuerza).toBe(0) // 10 - 10
    expect(b.confianza).toBe(10)
  })

  it('chat 14-60d no ajusta fuerza', () => {
    const b = computeRelationalScore(
      { importanceScore: 5, trustLevel: 5, lastChatObservedAt: '2026-05-01T12:00:00Z' },
      NOW,
    )
    expect(b.daysSinceLastChat).toBe(31)
    expect(b.fuerza).toBe(50)
  })

  it('fecha de chat en el futuro se ignora (daysSinceLastChat null → -10)', () => {
    const b = computeRelationalScore(
      { importanceScore: 5, trustLevel: 5, lastChatObservedAt: '2026-12-01T12:00:00Z' },
      NOW,
    )
    expect(b.daysSinceLastChat).toBeNull()
    expect(b.fuerza).toBe(40)
  })

  it('valores fuera de rango se clampean a 1-10', () => {
    const b = computeRelationalScore({ importanceScore: 99, trustLevel: 0, lastChatObservedAt: null }, NOW)
    expect(b.fuerza).toBe(90) // 100 - 10
    expect(b.confianza).toBe(50) // 0 → cae a default 5 → 50
  })
})

describe('healthBand', () => {
  it('mapea score a banda semántica', () => {
    expect(healthBand(85).id).toBe('solid')
    expect(healthBand(70).id).toBe('solid')
    expect(healthBand(55).id).toBe('care')
    expect(healthBand(40).id).toBe('care')
    expect(healthBand(20).id).toBe('risk')
  })
})

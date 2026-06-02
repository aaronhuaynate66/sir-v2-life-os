import { describe, it, expect } from 'vitest'

import {
  computeRelationalScore,
  computeReciprocity,
  healthBand,
  QUALITY_DELTA,
  RECIPROCITY_BASELINE,
} from './relationalScore'

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

describe('computeReciprocity (GEMA C — delta por calidad portado de V1)', () => {
  it('sin interacciones → null (datos insuficientes, no inventa)', () => {
    expect(computeReciprocity([])).toBeNull()
  })

  it('una interacción cálida (4) sube reciprocidad por encima del baseline', () => {
    // baseline 50 + round(QUALITY_DELTA[4] * 0.6) = 50 + round(3*0.6=1.8)=50+2 = 52
    expect(computeReciprocity([4])).toBe(52)
  })

  it('una interacción plena (5) suma más: 50 + round(6*0.6=3.6)=50+4 = 54', () => {
    expect(computeReciprocity([5])).toBe(54)
  })

  it('una interacción rota (1) resta: 50 + round(-5*0.6=-3) = 47', () => {
    expect(computeReciprocity([1])).toBe(47)
  })

  it('neutral (3) no mueve la aguja', () => {
    expect(computeReciprocity([3, 3, 3])).toBe(RECIPROCITY_BASELINE)
  })

  it('acumula en orden cronológico (suma de deltas atenuados)', () => {
    // 50 → +4 (q5) =54 → +2 (q4)=56 → -3 (q1)=53
    expect(computeReciprocity([5, 4, 1])).toBe(53)
  })

  it('clampa a [0,100] paso a paso (no se va de rango)', () => {
    const muyMalas = Array(40).fill(1) // -3 cada una, satura en 0
    expect(computeReciprocity(muyMalas)).toBe(0)
    const muyBuenas = Array(40).fill(5) // +4 cada una, satura en 100
    expect(computeReciprocity(muyBuenas)).toBe(100)
  })

  it('el DELTA portado coincide con V1 exactamente', () => {
    expect(QUALITY_DELTA).toEqual({ 1: -5, 2: -2, 3: 0, 4: 3, 5: 6 })
  })
})

describe('computeRelationalScore con interactionQualities (Reciprocidad ya no es NULL)', () => {
  it('con interacciones, Reciprocidad sale número y entra al promedio global', () => {
    const b = computeRelationalScore(
      {
        importanceScore: 8, // fuerza 80 (sin chat → -10 = 70)
        trustLevel: 7, // confianza 70
        lastChatObservedAt: null,
        interactionQualities: [4, 5, 4], // 50+2=52 → +4=56 → +2=58
      },
      NOW,
    )
    expect(b.reciprocidad).toBe(58)
    // global = round((70 + 58 + 70) / 3) = round(66) = 66
    expect(b.global).toBe(66)
  })

  it('sin interactionQualities mantiene el comportamiento histórico (null)', () => {
    const b = computeRelationalScore({ importanceScore: 5, trustLevel: 5, lastChatObservedAt: null }, NOW)
    expect(b.reciprocidad).toBeNull()
    expect(b.global).toBe(45) // sólo fuerza+confianza, como antes
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

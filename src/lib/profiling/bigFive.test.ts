// SIR V2 — Tests del instrumento Big Five (19·M4 + M5).

import { describe, it, expect } from 'vitest'
import { scoreBigFive, summarizeBigFive, BIG_FIVE_ITEMS } from './bigFive'

function answerAll(v: number): Record<string, number> {
  return Object.fromEntries(BIG_FIVE_ITEMS.map((i) => [i.id, v]))
}

describe('scoreBigFive', () => {
  it('respuestas incompletas o fuera de rango → null', () => {
    expect(scoreBigFive({ e1: 3 })).toBeNull()
    expect(scoreBigFive({ ...answerAll(3), e1: 9 })).toBeNull()
  })

  it('todo 3 (neutral) → 50 en cada rasgo', () => {
    const s = scoreBigFive(answerAll(3))!
    expect(s.O).toBe(50); expect(s.C).toBe(50); expect(s.E).toBe(50); expect(s.A).toBe(50); expect(s.N).toBe(50)
  })

  it('maneja ítems invertidos: extraversión alta', () => {
    // e1 (reverso) 'soy reservado' = 1 (muy en desacuerdo → sociable);
    // e2 'soy sociable' = 5. Ambos apuntan a extraversión alta → 100.
    const s = scoreBigFive({ ...answerAll(3), e1: 1, e2: 5 })!
    expect(s.E).toBe(100)
  })

  it('extraversión baja con el patrón inverso', () => {
    const s = scoreBigFive({ ...answerAll(3), e1: 5, e2: 1 })!
    expect(s.E).toBe(0)
  })
})

describe('summarizeBigFive', () => {
  it('nombra los rasgos altos y bajos', () => {
    const txt = summarizeBigFive({ O: 80, C: 50, E: 30, A: 70, N: 20 })
    expect(txt).toMatch(/apertura alta/i)
    expect(txt).toMatch(/neuroticismo baja/i)
  })

  it('perfil equilibrado si todo cerca de 50', () => {
    expect(summarizeBigFive({ O: 50, C: 55, E: 45, A: 50, N: 50 })).toMatch(/equilibrado/i)
  })
})

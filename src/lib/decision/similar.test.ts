// SIR V2 — Tests de decisiones pasadas parecidas (14·M5).

import { describe, it, expect } from 'vitest'
import { findSimilarDecisions, type PastDecision } from './similar'

function d(p: Partial<PastDecision>): PastDecision {
  return { id: p.id ?? 'x', title: p.title ?? '', description: p.description ?? null, verdict: p.verdict ?? 'caution', topRisk: p.topRisk ?? null, outcome: p.outcome ?? null, createdAt: p.createdAt ?? '2026-03-01T00:00:00Z' }
}

describe('findSimilarDecisions', () => {
  it('encuentra una parecida por solapamiento de palabras', () => {
    const past = [
      d({ id: 'a', title: 'Aceptar el proyecto freelance de consultoría' }),
      d({ id: 'b', title: 'Comprar una bicicleta nueva' }),
    ]
    const r = findSimilarDecisions({ title: 'Tomar otro proyecto freelance de consultoría' }, past)
    expect(r[0].decision.id).toBe('a')
  })

  it('excluye la misma decisión (mismo título)', () => {
    const past = [d({ id: 'a', title: 'Mudarme con mi perro' })]
    const r = findSimilarDecisions({ title: '  Mudarme con mi perro  ' }, past)
    expect(r).toHaveLength(0)
  })

  it('el bonus por misma dimensión de riesgo sube el score', () => {
    const past = [
      d({ id: 'sinRiesgo', title: 'Invertir en cripto ahora', topRisk: null }),
      d({ id: 'mismoRiesgo', title: 'Invertir en cripto ahora', topRisk: 'Impacto financiero' }),
    ]
    const r = findSimilarDecisions({ title: 'Invertir en cripto de nuevo', topRisk: 'Impacto financiero' }, past)
    expect(r[0].decision.id).toBe('mismoRiesgo')
  })

  it('trae el resultado (outcome) si estaba capturado', () => {
    const past = [d({ id: 'a', title: 'Renunciar al trabajo estable', outcome: 'Me arrepentí los primeros meses', verdict: 'hold' })]
    const r = findSimilarDecisions({ title: 'Renunciar a mi puesto estable actual' }, past)
    expect(r[0].decision.outcome).toBe('Me arrepentí los primeros meses')
  })

  it('sin parecidas → vacío', () => {
    const past = [d({ id: 'a', title: 'Pintar la pared del living' })]
    expect(findSimilarDecisions({ title: 'Cambiar de proveedor de internet' }, past)).toHaveLength(0)
  })
})

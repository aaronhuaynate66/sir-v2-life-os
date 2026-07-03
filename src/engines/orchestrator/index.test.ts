// SIR V2 — Tests del orquestador cognitivo (A2).

import { describe, it, expect } from 'vitest'
import { runCognitivePipeline } from './index'
import type { PeaceScore, PeaceThreat } from '../peace'
import type { Recommendation } from '@/types'

const peace: PeaceScore = {
  total: 6.2, components: { biological: 6, financial: 6, goalProgress: 6, emotional: 6, relational: 6 },
  trend: 'improving', recoveryMode: false, lastUpdated: '',
}
function threat(source: string, severity: PeaceThreat['severity']): PeaceThreat {
  return { source, severity, description: `${source} en riesgo`, suggestedAction: `atender ${source}` }
}
function rec(type: Recommendation['type'], priority: Recommendation['priority'], id: string): Recommendation {
  return {
    id, title: id, description: '', type, priority, timing: 'now',
    relatedGoals: [], relatedPersons: [], expectedPeaceImpact: 1, confidence: 0.5,
    reasoning: '', createdAt: '', status: 'pending',
  }
}

describe('runCognitivePipeline', () => {
  it('compone paz + amenazas + recomendaciones en un foco unificado', () => {
    const a = runCognitivePipeline({ peace, threats: [threat('biological', 'high')], recommendations: [rec('connect', 'high', 'r1')] })
    expect(a.peace).toEqual({ total: 6.2, trend: 'improving', recoveryMode: false })
    expect(a.focus).toHaveLength(2)
    expect(a.headline).toContain('Salud') // la amenaza biológica (health) manda a igual severidad
  })

  it('severidad manda: un crítico relacional va antes que un high de salud', () => {
    const a = runCognitivePipeline({
      peace, threats: [threat('relational', 'critical'), threat('biological', 'high')], recommendations: [],
    })
    expect(a.focus[0].domainLabel).toBe('Relacional')
    expect(a.focus[1].domainLabel).toBe('Salud')
  })

  it('a IGUAL severidad, gana el dominio más alto (Salud > Relacional)', () => {
    const a = runCognitivePipeline({
      peace, threats: [threat('relational', 'high'), threat('biological', 'high')], recommendations: [],
    })
    expect(a.focus[0].domainLabel).toBe('Salud')
    expect(a.focus[1].domainLabel).toBe('Relacional')
  })

  it('mapea el type de la recomendación a su dominio', () => {
    const a = runCognitivePipeline({ peace, threats: [], recommendations: [rec('rest', 'high', 'descanso')] })
    expect(a.focus[0].domain).toBe('health')
  })

  it('sin amenazas ni recs → foco vacío y headline null', () => {
    const a = runCognitivePipeline({ peace, threats: [], recommendations: [] })
    expect(a.focus).toEqual([])
    expect(a.headline).toBeNull()
  })
})

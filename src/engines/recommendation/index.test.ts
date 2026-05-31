// SIR V2 — Tests del Recommendation Engine.
//
// LIVE (useRichContext). Genera y rankea las recomendaciones que el usuario
// ACCIONA. Ramas con regression silencioso caro: recoveryMode mete protocolo
// de recuperación Y suprime la rec de objetivo crítico; sueño <5h es critical
// vs <6h high; alerta relacional immediate; ranking por prioridad + desempate
// por impacto. IDs/timestamps usan Date.now() → no los asertamos.

import { describe, it, expect } from 'vitest'

import type { Recommendation } from '@/types'
import type { PeaceScore } from '../peace'
import type { BiologicalState } from '../biological'
import type { RelationshipAlert } from '../relationship'
import { generateRecommendations, rankRecommendations } from './index'

function peace(recoveryMode: boolean, total = recoveryMode ? 3 : 7): PeaceScore {
  return {
    total,
    components: { biological: 7, financial: 7, goalProgress: 7, emotional: 7, relational: 7 },
    trend: 'stable',
    recoveryMode,
    lastUpdated: '',
  }
}
function bioState(o: Partial<BiologicalState> = {}): BiologicalState {
  return {
    energyLevel: 7, stressLevel: 5, sleepDebt: 0, lastSleepQuality: 7,
    lastSleepDuration: 8, recoveryScore: 7, timestamp: '',
    ...o,
  }
}
const baseInput = () => ({
  peaceScore: peace(false),
  biologicalState: bioState(),
  activeGoals: [],
  activeSignals: [],
  relationshipAlerts: [] as RelationshipAlert[],
})

describe('generateRecommendations — ramas', () => {
  it('estado sano y sin gatillos → sin recomendaciones', () => {
    expect(generateRecommendations(baseInput())).toEqual([])
  })

  it('recoveryMode → incluye Protocolo de Recuperación (critical)', () => {
    const recs = generateRecommendations({ ...baseInput(), peaceScore: peace(true) })
    const rec = recs.find((r) => r.title === 'Protocolo de Recuperacion')
    expect(rec?.priority).toBe('critical')
  })

  it('sueño < 5h → rec de sueño "critical"; 5-6h → "high"; ≥6h → ninguna', () => {
    const crit = generateRecommendations({ ...baseInput(), biologicalState: bioState({ lastSleepDuration: 4 }) })
    expect(crit.find((r) => r.type === 'rest')?.priority).toBe('critical')
    const high = generateRecommendations({ ...baseInput(), biologicalState: bioState({ lastSleepDuration: 5.5 }) })
    expect(high.find((r) => r.type === 'rest')?.priority).toBe('high')
    const none = generateRecommendations({ ...baseInput(), biologicalState: bioState({ lastSleepDuration: 7 }) })
    expect(none.find((r) => r.type === 'rest')).toBeUndefined()
  })

  it('alerta relacional immediate → rec connect; sin immediate → ninguna', () => {
    const alert: RelationshipAlert = {
      personId: 'p1', personName: 'Ana', alertType: 'no_contact',
      message: 'm', urgency: 'immediate', suggestedAction: 'escribir',
    }
    const withAlert = generateRecommendations({ ...baseInput(), relationshipAlerts: [alert] })
    expect(withAlert.find((r) => r.type === 'connect')?.relatedPersons).toEqual(['p1'])
    const soon = generateRecommendations({ ...baseInput(), relationshipAlerts: [{ ...alert, urgency: 'soon' }] })
    expect(soon.find((r) => r.type === 'connect')).toBeUndefined()
  })

  it('objetivo crítico activo → rec de acción, PERO suprimida en recoveryMode', () => {
    const goal = { id: 'g1', priority: 'critical', status: 'active', title: 'X', nextAction: 'go', progress: 10 } as never
    const normal = generateRecommendations({ ...baseInput(), activeGoals: [goal] })
    expect(normal.find((r) => r.type === 'action')?.relatedGoals).toEqual(['g1'])
    // En recoveryMode la rec de objetivo NO se genera (recuperación > producción).
    const recovery = generateRecommendations({ ...baseInput(), peaceScore: peace(true), activeGoals: [goal] })
    expect(recovery.find((r) => r.type === 'action')).toBeUndefined()
  })

  it('timing del objetivo: energía>6 → "today", si no → "this_week"', () => {
    const goal = { id: 'g1', priority: 'critical', status: 'active', title: 'X', nextAction: 'go', progress: 10 } as never
    const hi = generateRecommendations({ ...baseInput(), biologicalState: bioState({ energyLevel: 8 }), activeGoals: [goal] })
    expect(hi.find((r) => r.type === 'action')?.timing).toBe('today')
    const lo = generateRecommendations({ ...baseInput(), biologicalState: bioState({ energyLevel: 4 }), activeGoals: [goal] })
    expect(lo.find((r) => r.type === 'action')?.timing).toBe('this_week')
  })
})

describe('rankRecommendations', () => {
  function rec(priority: Recommendation['priority'], expectedPeaceImpact: number, id: string): Recommendation {
    return {
      id, title: id, description: '', type: 'action', priority, timing: 'now',
      relatedGoals: [], relatedPersons: [], expectedPeaceImpact, confidence: 0.5,
      reasoning: '', createdAt: '', expiresAt: '', status: 'pending',
    }
  }

  it('ordena critical < high < medium < low', () => {
    const out = rankRecommendations([rec('low', 1, 'l'), rec('critical', 1, 'c'), rec('medium', 1, 'm')])
    expect(out.map((r) => r.id)).toEqual(['c', 'm', 'l'])
  })

  it('desempata por expectedPeaceImpact (mayor primero)', () => {
    const out = rankRecommendations([rec('high', 1, 'lo'), rec('high', 5, 'hi')])
    expect(out.map((r) => r.id)).toEqual(['hi', 'lo'])
  })

  it('NO muta el array de entrada', () => {
    const input = [rec('low', 1, 'l'), rec('critical', 1, 'c')]
    const snapshot = input.map((r) => r.id)
    rankRecommendations(input)
    expect(input.map((r) => r.id)).toEqual(snapshot)
  })
})

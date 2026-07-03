// SIR V2 — Tests del Multi-Persona Reasoner (selección de lentes + prompt).

import { describe, it, expect } from 'vitest'
import { selectPersonas, PERSONAS } from './personas'
import { buildReasonerPrompt } from './prompt'
import type { CognitiveAssessment } from '@/engines/orchestrator'

describe('selectPersonas', () => {
  it('siempre incluye la base (coach + estratega)', () => {
    const p = selectPersonas([])
    expect(p).toContain('coach')
    expect(p).toContain('strategist')
  })
  it('enciende lentes según el dominio del foco', () => {
    expect(selectPersonas(['relational'])).toEqual(expect.arrayContaining(['psychologist', 'anthropologist']))
    expect(selectPersonas(['health'])).toEqual(expect.arrayContaining(['human_biologist', 'performance_coach']))
    expect(selectPersonas(['finance'])).toEqual(expect.arrayContaining(['finance_master']))
  })
  it('dedup + cap a 5', () => {
    const p = selectPersonas(['relational', 'health', 'finance', 'optimization', 'personal'])
    expect(p.length).toBeLessThanOrEqual(5)
    expect(new Set(p).size).toBe(p.length)
  })
  it('respeta el orden de prioridad de los dominios', () => {
    // health primero → sus lentes entran antes que las de optimization
    const p = selectPersonas(['health', 'optimization'])
    expect(p.indexOf('human_biologist')).toBeLessThan(p.indexOf('systems_analyst') === -1 ? Infinity : p.indexOf('systems_analyst'))
  })
})

describe('buildReasonerPrompt', () => {
  const assessment: CognitiveAssessment = {
    peace: { total: 5.5, trend: 'declining', recoveryMode: false },
    focus: [
      { domain: 'health', domainLabel: 'Salud', kind: 'threat', title: 'Sueño bajo', detail: 'Dormiste 5h', severityRank: 1 },
      { domain: 'relational', domainLabel: 'Relacional', kind: 'recommendation', title: 'Atención: Diana', detail: 'Escribile', severityRank: 1 },
    ],
    headline: 'Salud: Sueño bajo',
  }
  it('incluye solo las lentes dadas, con su foco', () => {
    const { system } = buildReasonerPrompt(assessment, ['coach', 'human_biologist'])
    expect(system).toContain(PERSONAS.coach.label)
    expect(system).toContain(PERSONAS.human_biologist.lens)
    expect(system).not.toContain(PERSONAS.finance_master.label)
  })
  it('el user trae el foco + estado de paz', () => {
    const { user } = buildReasonerPrompt(assessment, ['coach'])
    expect(user).toContain('[Salud] Sueño bajo')
    expect(user).toContain('5.5/10')
    expect(user).toContain('declining')
  })
  it('maneja foco vacío sin romper', () => {
    const empty: CognitiveAssessment = { peace: { total: 8, trend: 'stable', recoveryMode: false }, focus: [], headline: null }
    const { user } = buildReasonerPrompt(empty, ['coach'])
    expect(user).toContain('sin focos activos')
  })
})

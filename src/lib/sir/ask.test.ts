import { describe, it, expect } from 'vitest'
import { buildAskContext, extractCandidateNames } from './ask'

describe('extractCandidateNames', () => {
  const known = ['Dayana Yrribarren Terrones', 'Francisco Pérez', 'Adrian Prochazca', 'Victor Rodriguez']
  it('matchea por primer nombre, insensible a tildes/mayúsculas', () => {
    expect(extractCandidateNames('¿qué pasó con dayana?', known)).toEqual(['Dayana Yrribarren Terrones'])
    expect(extractCandidateNames('cómo me acerco a FRANCISCO esta semana', known)).toEqual(['Francisco Pérez'])
  })
  it('no matchea si no se menciona a nadie conocido', () => {
    expect(extractCandidateNames('cómo va todo', known)).toEqual([])
  })
  it('matchea varios y acota', () => {
    const r = extractCandidateNames('victor y adrian', known)
    expect(r.sort()).toEqual(['Adrian Prochazca', 'Victor Rodriguez'])
  })
  it('evita falsos positivos por substring corto', () => {
    // "vic" no debería disparar Victor; pedimos palabra completa del primer nombre
    expect(extractCandidateNames('necesito una victoria', known)).toEqual([])
  })
})

describe('buildAskContext', () => {
  it('arma personas, memorias, objetivos y pregunta', () => {
    const ctx = buildAskContext({
      question: '¿cómo me acerco a Francisco?',
      todayISO: '2026-06-14',
      people: [{ name: 'Francisco', relationship: 'amigo', lastContact: '2026-05-01T00:00:00Z', scoreGlobal: 55, fuerza: 60, reciprocidad: null, confianza: 50, recentMemories: ['Hablaron del Mundial'], activeGoal: 'Mejorar mi relación con Francisco' }],
      memories: [{ content: 'Se ofreció a ayudarte', personName: 'Francisco', occurredAt: '2026-05-01' }],
      goals: [{ title: 'Mejorar mi relación con Francisco', nextAction: 'Invitarlo a entrenar' }],
    })
    expect(ctx).toContain('== PERSONAS ==')
    expect(ctx).toContain('Francisco')
    expect(ctx).toContain('global 55')
    expect(ctx).toContain('objetivo ligado: Mejorar mi relación con Francisco')
    expect(ctx).toContain('== OBJETIVOS ACTIVOS ==')
    expect(ctx).toContain('== PREGUNTA ==')
  })
  it('avisa cuando no hay data', () => {
    const ctx = buildAskContext({ question: 'x', todayISO: '2026-06-14', people: [], memories: [], goals: [] })
    expect(ctx).toContain('No se encontró data')
  })
})

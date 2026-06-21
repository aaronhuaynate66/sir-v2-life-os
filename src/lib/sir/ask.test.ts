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

import { isPerspectiveQuery, selectStrengthMemories } from './ask'

describe('isPerspectiveQuery', () => {
  it('detecta consultas de estado/ánimo', () => {
    expect(isPerspectiveQuery('me siento como un barco hundiéndose')).toBe(true)
    expect(isPerspectiveQuery('no doy más con todo')).toBe(true)
    expect(isPerspectiveQuery('dame perspectiva')).toBe(true)
  })
  it('no se activa en consultas normales', () => {
    expect(isPerspectiveQuery('¿cuándo cumple Francisco?')).toBe(false)
    expect(isPerspectiveQuery('¿cómo voy con Sienna?')).toBe(false)
  })
})

describe('selectStrengthMemories', () => {
  it('selecciona memorias con léxico de fuerza, más recientes primero', () => {
    const out = selectStrengthMemories([
      { content: 'Hoy llovió', occurredAt: '2026-06-18' },
      { content: 'Aaron: yo siempre puedo con todo, salí adelante antes', occurredAt: '2026-06-17' },
      { content: 'Gané la medalla, fui campeón', occurredAt: '2026-06-19' },
    ], 5)
    expect(out.length).toBe(2)
    expect(out[0]).toMatch(/campeón/i)   // 19 antes que 17
  })
  it('ignora memorias sin fuerza', () => {
    expect(selectStrengthMemories([{ content: 'compré pan', occurredAt: '2026-06-18' }])).toHaveLength(0)
  })
})

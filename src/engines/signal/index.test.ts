// SIR V2 — Tests del Signal Engine (ranking + contexto del /panel).
//
// LIVE (/panel, useRichContext). rankSignalsByPriority ordena por urgencia
// con desempate por fuerza, filtra resueltas y NO muta el input. Regression
// acá reordena/oculta señales en el dashboard silenciosamente.

import { describe, it, expect } from 'vitest'

import type { Signal } from '@/types'
import { rankSignalsByPriority, buildSignalContext, extractSignalMeaning } from './index'

function sig(o: Partial<Signal> & { id: string }): Signal {
  return {
    source: 'manual',
    type: 'pattern',
    content: '',
    strength: 5,
    urgency: 'monitor',
    relatedPersons: [],
    relatedGoals: [],
    actionRequired: false,
    detectedAt: '2026-01-01T00:00:00.000Z',
    resolved: false,
    ...o,
  } as Signal
}

describe('rankSignalsByPriority', () => {
  it('filtra las señales resueltas', () => {
    const out = rankSignalsByPriority([sig({ id: 'a', resolved: true }), sig({ id: 'b' })])
    expect(out.map((s) => s.id)).toEqual(['b'])
  })

  it('ordena por urgencia immediate < soon < monitor < archive', () => {
    const out = rankSignalsByPriority([
      sig({ id: 'monitor', urgency: 'monitor' }),
      sig({ id: 'immediate', urgency: 'immediate' }),
      sig({ id: 'archive', urgency: 'archive' }),
      sig({ id: 'soon', urgency: 'soon' }),
    ])
    expect(out.map((s) => s.id)).toEqual(['immediate', 'soon', 'monitor', 'archive'])
  })

  it('desempata por fuerza (mayor primero) dentro de la misma urgencia', () => {
    const out = rankSignalsByPriority([
      sig({ id: 'weak', urgency: 'soon', strength: 3 }),
      sig({ id: 'strong', urgency: 'soon', strength: 9 }),
    ])
    expect(out.map((s) => s.id)).toEqual(['strong', 'weak'])
  })

  it('NO muta el array de entrada (usa spread)', () => {
    const input = [sig({ id: 'a', urgency: 'monitor' }), sig({ id: 'b', urgency: 'immediate' })]
    const snapshot = input.map((s) => s.id)
    rankSignalsByPriority(input)
    expect(input.map((s) => s.id)).toEqual(snapshot)
  })
})

describe('buildSignalContext', () => {
  it('top = la de mayor prioridad; hasImmediateAlert refleja presencia de immediate', () => {
    const ctx = buildSignalContext([
      sig({ id: 'm', urgency: 'monitor' }),
      sig({ id: 'i', urgency: 'immediate' }),
    ])
    expect(ctx.topPrioritySignal?.id).toBe('i')
    expect(ctx.hasImmediateAlert).toBe(true)
    expect(ctx.activeSignals).toHaveLength(2)
  })

  it('sin señales immediate → hasImmediateAlert false; resueltas no cuentan', () => {
    const ctx = buildSignalContext([sig({ id: 'm', urgency: 'monitor' }), sig({ id: 'r', resolved: true })])
    expect(ctx.hasImmediateAlert).toBe(false)
    expect(ctx.activeSignals.map((s) => s.id)).toEqual(['m'])
  })
})

describe('extractSignalMeaning', () => {
  it('meaning explícito gana sobre el default del tipo', () => {
    expect(extractSignalMeaning(sig({ id: 'a', meaning: 'custom', type: 'warning' }))).toBe('custom')
  })
  it('sin meaning → texto por tipo', () => {
    expect(extractSignalMeaning(sig({ id: 'a', type: 'financial' }))).toBe('Movimiento financiero relevante')
  })
})

// SIR V2 — Tests del grounding context (contexto real para el plan IA).

import { describe, it, expect } from 'vitest'

import type { FinancialMovement, HealthMetric, SelfMetric, Signal } from '@/types'
import { buildGroundingContext, renderGroundingForPrompt } from './grounding'

const NOW = new Date(2026, 5, 15) // 15-jun-2026 local

function mov(over: Partial<FinancialMovement>): FinancialMovement {
  return {
    id: over.id ?? 'm1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 100,
    currency: 'PEN',
    exchangeRate: 1,
    amountPEN: over.amountPEN ?? over.amount ?? 100,
    category: over.category ?? 'other',
    intent: over.intent,
    description: over.description ?? '',
    date: over.date ?? '2026-06-10',
    recurrent: false,
    tags: [],
    ...over,
  }
}

function health(over: Partial<HealthMetric>): HealthMetric {
  return {
    id: over.id ?? 'h1',
    type: over.type ?? 'weight',
    value: over.value ?? 80,
    unit: over.unit ?? 'kg',
    timestamp: over.timestamp ?? '2026-06-01T00:00:00Z',
    ...over,
  }
}

function selfm(over: Partial<SelfMetric>): SelfMetric {
  return {
    id: over.id ?? 's1',
    category: over.category ?? 'energy',
    value: over.value ?? 5,
    timestamp: over.timestamp ?? '2026-06-01T00:00:00Z',
    ...over,
  }
}

function signal(over: Partial<Signal>): Signal {
  return {
    id: over.id ?? 'sig1',
    source: 'manual',
    type: 'warning',
    content: over.content ?? 'Señal',
    strength: 5,
    urgency: over.urgency ?? 'soon',
    relatedPersons: [],
    relatedGoals: [],
    actionRequired: true,
    resolved: over.resolved ?? false,
    detectedAt: '2026-06-01T00:00:00Z',
    ...over,
  }
}

describe('buildGroundingContext — vacío', () => {
  it('sin nada → empty true y todo undefined', () => {
    const ctx = buildGroundingContext({}, NOW)
    expect(ctx.empty).toBe(true)
    expect(ctx.finance).toBeUndefined()
    expect(renderGroundingForPrompt(ctx)).toBe('')
  })
})

describe('buildGroundingContext — finanzas (mes en curso)', () => {
  it('resume balance, tasa de ahorro y gasto por intención del mes', () => {
    const ctx = buildGroundingContext(
      {
        financialMovements: [
          mov({ id: 'i', type: 'income', amount: 3000, amountPEN: 3000, date: '2026-06-01' }),
          mov({ id: 'e1', type: 'expense', amount: 1000, amountPEN: 1000, intent: 'obligatorio', date: '2026-06-05' }),
          mov({ id: 'e2', type: 'expense', amount: 500, amountPEN: 500, intent: 'no_esencial', date: '2026-06-08' }),
          // mes anterior: no debe contar
          mov({ id: 'old', type: 'expense', amount: 9999, amountPEN: 9999, date: '2026-05-20' }),
        ],
      },
      NOW,
    )
    expect(ctx.finance).toBeDefined()
    expect(ctx.finance!.month).toBe('2026-06')
    expect(ctx.finance!.incomePEN).toBe(3000)
    expect(ctx.finance!.expensePEN).toBe(1500)
    expect(ctx.finance!.balancePEN).toBe(1500)
    expect(ctx.finance!.savingsRatePct).toBe(50)
    const obligatorio = ctx.finance!.byIntent.find((i) => i.intent === 'obligatorio')
    expect(obligatorio?.totalPEN).toBe(1000)
    expect(renderGroundingForPrompt(ctx)).toContain('balance S/1500/mes')
  })

  it('sin movimientos del mes → finance undefined', () => {
    const ctx = buildGroundingContext(
      { financialMovements: [mov({ date: '2026-05-01' })] },
      NOW,
    )
    expect(ctx.finance).toBeUndefined()
  })
})

describe('buildGroundingContext — cuerpo y bienestar', () => {
  it('toma el último peso por timestamp', () => {
    const ctx = buildGroundingContext(
      {
        healthMetrics: [
          health({ id: 'a', type: 'weight', value: 84, timestamp: '2026-05-01T00:00:00Z' }),
          health({ id: 'b', type: 'weight', value: 81, timestamp: '2026-06-10T00:00:00Z' }),
        ],
      },
      NOW,
    )
    expect(ctx.body!.weightKg).toBe(81)
    expect(renderGroundingForPrompt(ctx)).toContain('peso 81 kg')
  })

  it('toma la última medición por categoría de self-metrics', () => {
    const ctx = buildGroundingContext(
      {
        selfMetrics: [
          selfm({ id: 'e1', category: 'energy', value: 4, timestamp: '2026-06-01T00:00:00Z' }),
          selfm({ id: 'e2', category: 'energy', value: 7, timestamp: '2026-06-12T00:00:00Z' }),
          selfm({ id: 's1', category: 'stress', value: 8, timestamp: '2026-06-12T00:00:00Z' }),
        ],
      },
      NOW,
    )
    const energy = ctx.wellbeing!.metrics.find((m) => m.category === 'energy')
    expect(energy?.value).toBe(7)
    expect(renderGroundingForPrompt(ctx)).toContain('stress 8/10')
  })
})

describe('buildGroundingContext — señales y personas', () => {
  it('cuenta activas y ordena por urgencia', () => {
    const ctx = buildGroundingContext(
      {
        signals: [
          signal({ id: 'a', content: 'Monitor', urgency: 'monitor' }),
          signal({ id: 'b', content: 'Urgente', urgency: 'immediate' }),
          signal({ id: 'c', content: 'Resuelta', resolved: true }),
        ],
      },
      NOW,
    )
    expect(ctx.signals!.activeCount).toBe(2)
    expect(ctx.signals!.top[0].content).toBe('Urgente')
  })

  it('linkedPeople sólo si hay', () => {
    expect(buildGroundingContext({ linkedPeople: [] }, NOW).linkedPeople).toBeUndefined()
    const ctx = buildGroundingContext({ linkedPeople: ['Ana', 'Beto'] }, NOW)
    expect(ctx.linkedPeople).toEqual(['Ana', 'Beto'])
    expect(renderGroundingForPrompt(ctx)).toContain('Ana, Beto')
  })
})

// SIR V2 — Tests de memory/events (derivación evento → Memory).
//
// LIVE (vía el barrel del memory engine, 7 páginas). Estas factories derivan
// importance / emotionalCharge / decayRate / type con mapeos NO obvios cuyo
// regression silencioso desordenaría el peso de las memorias en queryMemories
// y buildMemoryContext. Ejemplos sutiles: sueño MALO → importancia MÁS alta,
// métricas en extremos → importancia 7, decayRate por urgencia/completitud.
// No aserto id/timestamps generados (crypto.randomUUID / Date.now).

import { describe, it, expect } from 'vitest'

import type { Person, Signal, SleepRecord, SelfMetric, FinancialMovement, Goal } from '@/types'
import {
  createPersonAddedMemory,
  createSignalAddedMemory,
  createSleepMemory,
  createSelfMetricMemory,
  createFinancialMovementMemory,
  createGoalProgressMemory,
} from './events'

const person = (o: Partial<Person> = {}): Person => ({
  id: 'p1', name: 'Ana', relationship: 'friend', category: 'close',
  importanceScore: 7, energyImpact: 'neutral', trustLevel: 5,
  contactFrequency: '', tags: [], notes: '', ...o,
} as Person)

const signal = (o: Partial<Signal> = {}): Signal => ({
  id: 's1', source: 'manual', type: 'warning', content: 'x', strength: 5,
  urgency: 'monitor', relatedPersons: [], relatedGoals: [], actionRequired: false,
  detectedAt: '2026-03-03T00:00:00.000Z', resolved: false, ...o,
} as Signal)

const sleep = (o: Partial<SleepRecord> = {}): SleepRecord => ({
  id: 'sl1', date: '2026-02-02', bedtime: '23:00', wakeTime: '07:00',
  duration: 8, quality: 7, notes: '', ...o,
} as SleepRecord)

const goal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1', title: 'X', description: '', category: 'personal', priority: 'medium',
  status: 'active', progress: 50, milestones: [], relatedGoals: [], relatedPersons: [],
  peaceImpact: 5, obstacles: [], nextAction: '', createdAt: '', updatedAt: '', ...o,
})

describe('createPersonAddedMemory', () => {
  it('emotionalCharge por energyImpact; importance = clamp(round(importanceScore))', () => {
    expect(createPersonAddedMemory(person({ energyImpact: 'energizing' })).emotionalCharge).toBe(7)
    expect(createPersonAddedMemory(person({ energyImpact: 'draining' })).emotionalCharge).toBe(3)
    expect(createPersonAddedMemory(person({ energyImpact: 'neutral' })).emotionalCharge).toBe(5)
    expect(createPersonAddedMemory(person({ importanceScore: 99 })).importance).toBe(10) // clamp
    expect(createPersonAddedMemory(person()).type).toBe('relational')
  })
})

describe('createSignalAddedMemory', () => {
  it('importance por urgencia y decayRate más lento si immediate', () => {
    expect(createSignalAddedMemory(signal({ urgency: 'immediate' })).importance).toBe(9)
    expect(createSignalAddedMemory(signal({ urgency: 'soon' })).importance).toBe(7)
    expect(createSignalAddedMemory(signal({ urgency: 'monitor' })).importance).toBe(5)
    expect(createSignalAddedMemory(signal({ urgency: 'archive' })).importance).toBe(3)
    expect(createSignalAddedMemory(signal({ urgency: 'immediate' })).decayRate).toBe(0.02)
    expect(createSignalAddedMemory(signal({ urgency: 'monitor' })).decayRate).toBe(0.1)
  })
  it('usa detectedAt como timestamp y emotionalCharge ≤ 10', () => {
    const m = createSignalAddedMemory(signal({ detectedAt: '2026-03-03T00:00:00.000Z' }))
    expect(m.timestamp).toBe('2026-03-03T00:00:00.000Z')
    expect(m.emotionalCharge).toBeLessThanOrEqual(10)
  })
})

describe('createSleepMemory', () => {
  it('importancia INVERTIDA: sueño malo (<5) es MÁS importante de recordar', () => {
    expect(createSleepMemory(sleep({ quality: 9 })).importance).toBe(6)
    expect(createSleepMemory(sleep({ quality: 6 })).importance).toBe(4)
    expect(createSleepMemory(sleep({ quality: 3 })).importance).toBe(7) // malo → 7
  })
  it('emotionalCharge por tiers de calidad', () => {
    expect(createSleepMemory(sleep({ quality: 8 })).emotionalCharge).toBe(6)
    expect(createSleepMemory(sleep({ quality: 5 })).emotionalCharge).toBe(4)
    expect(createSleepMemory(sleep({ quality: 2 })).emotionalCharge).toBe(2)
  })
})

describe('createSelfMetricMemory', () => {
  const metric = (o: Partial<SelfMetric> = {}): SelfMetric => ({
    id: 'm1', category: 'mood', value: 5, timestamp: '2026-01-01T00:00:00.000Z', ...o,
  })
  it('valores EXTREMOS (≤3 o ≥9) son más importantes', () => {
    expect(createSelfMetricMemory(metric({ value: 2 })).importance).toBe(7)
    expect(createSelfMetricMemory(metric({ value: 10 })).importance).toBe(7)
    expect(createSelfMetricMemory(metric({ value: 5 })).importance).toBe(4) // medio
  })
})

describe('createFinancialMovementMemory', () => {
  const mv = (o: Partial<FinancialMovement> = {}): FinancialMovement => ({
    id: 'f1', type: 'expense', amount: 100, currency: 'PEN', exchangeRate: 1, amountPEN: 100,
    category: 'other', description: 'd', date: '2026-04-04', recurrent: false, tags: [], ...o,
  })
  it('importance por tipo (investment/debt 8, income 7, expense 5)', () => {
    expect(createFinancialMovementMemory(mv({ type: 'investment' })).importance).toBe(8)
    expect(createFinancialMovementMemory(mv({ type: 'debt' })).importance).toBe(8)
    expect(createFinancialMovementMemory(mv({ type: 'income' })).importance).toBe(7)
    expect(createFinancialMovementMemory(mv({ type: 'expense' })).importance).toBe(5)
    expect(createFinancialMovementMemory(mv({ type: 'transfer' })).importance).toBe(4)
  })
  it('emotionalCharge: income/investment positivo, debt bajo', () => {
    expect(createFinancialMovementMemory(mv({ type: 'income' })).emotionalCharge).toBe(7)
    expect(createFinancialMovementMemory(mv({ type: 'debt' })).emotionalCharge).toBe(3)
  })
})

describe('createGoalProgressMemory', () => {
  it('completado (≥100) → emotionalCharge 9, decayRate lento, título de completado', () => {
    const m = createGoalProgressMemory(goal({ title: 'Correr 10k' }), 80, 100)
    expect(m.emotionalCharge).toBe(9)
    expect(m.decayRate).toBe(0.02)
    expect(m.title).toContain('completado')
  })
  it('emotionalCharge por delta de progreso; importance por prioridad', () => {
    expect(createGoalProgressMemory(goal(), 50, 65).emotionalCharge).toBe(7) // delta +15 (≥10)
    expect(createGoalProgressMemory(goal(), 50, 55).emotionalCharge).toBe(5) // delta +5 (≥0)
    expect(createGoalProgressMemory(goal(), 50, 40).emotionalCharge).toBe(3) // delta negativo
    expect(createGoalProgressMemory(goal({ priority: 'critical' }), 0, 10).importance).toBe(9)
    expect(createGoalProgressMemory(goal({ priority: 'low' }), 0, 10).importance).toBe(3)
  })
})

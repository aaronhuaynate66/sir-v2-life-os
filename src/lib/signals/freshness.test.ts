import { describe, it, expect } from 'vitest'
import { pickTopSignal, STALE_SIGNAL_DAYS } from './freshness'

const NOW = Date.parse('2026-07-19T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

describe('pickTopSignal', () => {
  it('descarta una señal no-crítica rancia (el bug de la FC del 1-jun)', () => {
    const r = pickTopSignal([
      { content: 'FC en reposo elevada', urgency: 'soon', createdAt: daysAgo(49) },
    ], NOW)
    expect(r).toBeNull()
  })

  it('conserva una señal no-crítica reciente', () => {
    const r = pickTopSignal([
      { content: 'reunión pendiente', urgency: 'medium', createdAt: daysAgo(3) },
    ], NOW)
    expect(r).toBe('reunión pendiente')
  })

  it('una señal crítica persiste aunque sea vieja', () => {
    const r = pickTopSignal([
      { content: 'tema legal grave', urgency: 'critical', createdAt: daysAgo(60) },
    ], NOW)
    expect(r).toBe('tema legal grave')
  })

  it('elige la de mayor urgencia entre las frescas', () => {
    const r = pickTopSignal([
      { content: 'baja', urgency: 'low', createdAt: daysAgo(1) },
      { content: 'alta', urgency: 'high', createdAt: daysAgo(1) },
    ], NOW)
    expect(r).toBe('alta')
  })

  it('ignora la vieja no-crítica y toma la fresca aunque sea menos urgente', () => {
    const r = pickTopSignal([
      { content: 'vieja urgente', urgency: 'high', createdAt: daysAgo(40) },
      { content: 'fresca media', urgency: 'medium', createdAt: daysAgo(2) },
    ], NOW)
    expect(r).toBe('fresca media')
  })

  it('sin createdAt → se conserva (no podemos juzgar antigüedad)', () => {
    expect(pickTopSignal([{ content: 'x', urgency: 'low' }], NOW)).toBe('x')
  })

  it('lista vacía → null', () => {
    expect(pickTopSignal([], NOW)).toBeNull()
  })

  it('el umbral por defecto es 21 días', () => {
    expect(STALE_SIGNAL_DAYS).toBe(21)
    expect(pickTopSignal([{ content: 'x', urgency: 'low', createdAt: daysAgo(20) }], NOW)).toBe('x')
    expect(pickTopSignal([{ content: 'x', urgency: 'low', createdAt: daysAgo(22) }], NOW)).toBeNull()
  })
})

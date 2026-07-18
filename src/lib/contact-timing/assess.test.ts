import { describe, it, expect } from 'vitest'
import { assessContactTiming, isSignalActive, timingPushLine } from './assess'
import type { ContactSignal } from './types'

const NOW = Date.parse('2026-07-18T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

function sig(over: Partial<ContactSignal> = {}): ContactSignal {
  return {
    id: over.id ?? 'a', personId: 'p', kind: over.kind ?? 'traveling',
    detail: over.detail ?? null, source: over.source ?? 'manual',
    observedAt: over.observedAt ?? hoursAgo(3), expiresAt: over.expiresAt ?? null,
  }
}

describe('isSignalActive', () => {
  it('usa expires_at cuando está', () => {
    expect(isSignalActive(sig({ expiresAt: new Date(NOW + 3_600_000).toISOString() }), NOW)).toBe(true)
    expect(isSignalActive(sig({ expiresAt: new Date(NOW - 3_600_000).toISOString() }), NOW)).toBe(false)
  })
  it('usa TTL por tipo cuando no hay expires_at', () => {
    // traveling TTL = 72h
    expect(isSignalActive(sig({ kind: 'traveling', observedAt: hoursAgo(20) }), NOW)).toBe(true)
    expect(isSignalActive(sig({ kind: 'traveling', observedAt: hoursAgo(100) }), NOW)).toBe(false)
    // available TTL = 12h (envejece rápido)
    expect(isSignalActive(sig({ kind: 'available', observedAt: hoursAgo(20) }), NOW)).toBe(false)
  })
})

describe('assessContactTiming', () => {
  it('sin señales activas → neutral, sin reason (SIR no inventa)', () => {
    const v = assessContactTiming([], NOW)
    expect(v.level).toBe('neutral')
    expect(v.reason).toBe('')
    expect(v.drivingKind).toBeNull()
  })
  it('ignora señales expiradas', () => {
    const v = assessContactTiming([sig({ kind: 'traveling', observedAt: hoursAgo(200) })], NOW)
    expect(v.level).toBe('neutral')
  })
  it('de viaje → bad, con frase de "espera"', () => {
    const v = assessContactTiming([sig({ kind: 'traveling', detail: 'escapadita' })], NOW)
    expect(v.level).toBe('bad')
    expect(v.reason).toMatch(/viaje/i)
    expect(v.reason).toContain('escapadita')
    expect(v.drivingKind).toBe('traveling')
  })
  it('mal momento gana sobre buen momento (prioridad)', () => {
    const v = assessContactTiming([
      sig({ id: 'x', kind: 'available', observedAt: hoursAgo(1) }),
      sig({ id: 'y', kind: 'traveling', observedAt: hoursAgo(2) }),
    ], NOW)
    expect(v.level).toBe('bad')
    expect(v.drivingKind).toBe('traveling')
  })
  it('a igual nivel, la más reciente manda', () => {
    const v = assessContactTiming([
      sig({ id: 'old', kind: 'busy', detail: 'vieja', observedAt: hoursAgo(10) }),
      sig({ id: 'new', kind: 'job_change', detail: 'nueva', observedAt: hoursAgo(1) }),
    ], NOW)
    expect(v.level).toBe('caution')
    expect(v.reason).toContain('nueva')
  })
  it('solo señales buenas → good', () => {
    const v = assessContactTiming([sig({ kind: 'available' })], NOW)
    expect(v.level).toBe('good')
    expect(v.reason).toMatch(/buen momento/i)
  })
})

describe('timingPushLine', () => {
  it('avisa en bad/caution, calla en good/neutral', () => {
    expect(timingPushLine(assessContactTiming([sig({ kind: 'traveling' })], NOW))).toMatch(/viaje/i)
    expect(timingPushLine(assessContactTiming([sig({ kind: 'available' })], NOW))).toBe('')
    expect(timingPushLine(assessContactTiming([], NOW))).toBe('')
  })
})

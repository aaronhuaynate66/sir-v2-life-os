import { describe, it, expect } from 'vitest'
import { isSignalStale } from './relevance'
import type { Signal } from '@/types'

const NOW = new Date('2026-06-12T12:00:00Z')
const sig = (o: Partial<Signal>): Signal => ({ id: 'x', source: 'manual', type: 'pattern', content: 'c', strength: 5, urgency: 'soon', relatedPersons: [], relatedGoals: [], actionRequired: true, detectedAt: '2026-06-11T00:00:00Z', resolved: false, ...o }) as Signal

describe('isSignalStale', () => {
  it('reciente → no stale', () => { expect(isSignalStale(sig({ detectedAt: '2026-06-10T00:00:00Z' }), NOW)).toBe(false) })
  it('vieja (>7 días) → stale', () => { expect(isSignalStale(sig({ detectedAt: '2026-06-01T00:00:00Z' }), NOW)).toBe(true) })
  it('expiresAt pasado → stale', () => { expect(isSignalStale(sig({ detectedAt: '2026-06-11T00:00:00Z', expiresAt: '2026-06-11T23:00:00Z' }), NOW)).toBe(true) })
  it('expiresAt futuro + reciente → no stale', () => { expect(isSignalStale(sig({ detectedAt: '2026-06-11T00:00:00Z', expiresAt: '2026-06-30T00:00:00Z' }), NOW)).toBe(false) })
})

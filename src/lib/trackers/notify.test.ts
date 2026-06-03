// SIR V2 — Tests de alertas/email de trackers (puro).

import { describe, it, expect } from 'vitest'
import type { Tracker } from '@/types'
import {
  buildTrackerAlerts,
  shouldSendEmail,
  buildEmailPayload,
  trackerHref,
  absoluteUrl,
} from './notify'

const NOW = new Date(2026, 5, 3)

function tracker(partial: Partial<Tracker>): Tracker {
  return {
    id: 'tk_flight',
    label: 'Precio vuelo Lima→Dammam',
    unit: 'PEN',
    conditionKind: 'lte',
    conditionValue: 4500,
    createdAt: '2026-06-03T00:00:00.000Z',
    ...partial,
  }
}

describe('trackerHref / absoluteUrl', () => {
  it('deep-link relativo', () => {
    expect(trackerHref('tk_flight')).toBe('/seguimiento?t=tk_flight')
  })
  it('absoluteUrl une sin doble barra', () => {
    expect(absoluteUrl('https://app.sir/', '/seguimiento?t=x')).toBe('https://app.sir/seguimiento?t=x')
    expect(absoluteUrl('https://app.sir', 'seguimiento')).toBe('https://app.sir/seguimiento')
  })
})

describe('buildTrackerAlerts', () => {
  it('met cuando cumple', () => {
    const alerts = buildTrackerAlerts([tracker({ currentValue: 4000, currentValueDate: '2026-06-03' })], NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].kind).toBe('met')
    expect(alerts[0].href).toBe('/seguimiento?t=tk_flight')
  })
  it('stale cuando viejo y no cumple', () => {
    const alerts = buildTrackerAlerts(
      [tracker({ currentValue: 5000, currentValueDate: '2026-05-01', cadenceDays: 7 })],
      NOW,
    )
    expect(alerts[0].kind).toBe('stale')
  })
  it('nada cuando tracking normal', () => {
    expect(buildTrackerAlerts([tracker({ currentValue: 5000, currentValueDate: '2026-06-02' })], NOW)).toHaveLength(0)
  })
})

describe('shouldSendEmail (idempotencia)', () => {
  it('manda met si no se notificó antes', () => {
    expect(shouldSendEmail(tracker({ currentValue: 4000 }), NOW)).toBe('met')
  })
  it('NO re-manda met si ya fue met', () => {
    expect(shouldSendEmail(tracker({ currentValue: 4000, lastAlertKind: 'met' }), NOW)).toBeNull()
  })
  it('manda met si antes había sido stale (cambió el estado)', () => {
    expect(shouldSendEmail(tracker({ currentValue: 4000, lastAlertKind: 'stale' }), NOW)).toBe('met')
  })
  it('no manda nada en tracking normal', () => {
    expect(shouldSendEmail(tracker({ currentValue: 5000, currentValueDate: '2026-06-02' }), NOW)).toBeNull()
  })
})

describe('buildEmailPayload', () => {
  it('met: subject + deep-link absoluto', () => {
    const p = buildEmailPayload(tracker({ currentValue: 4000 }), 'met', 'https://app.sir', NOW)
    expect(p.subject).toContain('condición cumplida')
    expect(p.href).toBe('https://app.sir/seguimiento?t=tk_flight')
    expect(p.text).toContain('https://app.sir/seguimiento?t=tk_flight')
    expect(p.html).toContain('href="https://app.sir/seguimiento?t=tk_flight"')
  })
  it('stale: subject de desactualizado', () => {
    const p = buildEmailPayload(tracker({ cadenceDays: 7 }), 'stale', 'https://app.sir', NOW)
    expect(p.subject).toContain('desactualizado')
  })
})

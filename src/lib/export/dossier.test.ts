// SIR V2 — Tests del armado de datos del Dossier (Export, Parte A).
//
// buildDossier es puro (recibe `now`). Cubrimos: labels traducidos, días
// desde contacto, fechas importantes ordenadas/formateadas, redes presentes,
// merge y orden de la línea de tiempo (logs + observations), y casos borde
// (sin contacto, sin redes, sin síntesis, límite de timeline).

import { describe, it, expect } from 'vitest'

import type { Person } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'
import { buildDossier } from './dossier'

const NOW = new Date(2026, 5, 1) // 1-jun-2026

function person(over: Partial<Person>): Person {
  return {
    id: 'p1',
    name: over.name ?? 'Diana',
    relationship: over.relationship ?? 'romantic',
    category: over.category ?? 'inner_circle',
    importanceScore: over.importanceScore ?? 9,
    energyImpact: 'energizing',
    trustLevel: over.trustLevel ?? 8,
    lastContact: over.lastContact,
    contactFrequency: 'weekly',
    tags: [],
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function plog(over: Partial<PersonLog>): PersonLog {
  return {
    id: over.id ?? 'l1',
    userId: 'u',
    personId: 'p1',
    kind: over.kind ?? 'mood',
    value: over.value ?? 4,
    note: over.note ?? null,
    loggedAt: over.loggedAt ?? '2026-05-20T10:00:00Z',
    createdAt: over.createdAt ?? '2026-05-20T10:00:00Z',
    ...over,
  }
}

function obs(over: Partial<Observation>): Observation {
  return {
    id: over.id ?? 'o1',
    userId: 'u',
    personId: 'p1',
    captureType: over.captureType ?? 'whatsapp_chat',
    sourceImagePath: null,
    storageBucket: null,
    data: over.data ?? {},
    detectorData: null,
    userEdits: null,
    confidence: over.confidence ?? 'high',
    needsReview: false,
    observedAt: over.observedAt ?? '2026-05-25T14:00:00Z',
    capturedAt: '2026-05-26T08:00:00Z',
    isObsolete: false,
    obsoletedAt: null,
    obsoletedReason: null,
    createdAt: '2026-05-26T08:00:00Z',
    ...over,
  }
}

describe('buildDossier — identidad y contacto', () => {
  it('traduce relación/categoría y copia score/confianza', () => {
    const d = buildDossier({ person: person({}) }, NOW)
    expect(d.identity.relationshipLabel).toBe('Pareja')
    expect(d.identity.categoryLabel).toBe('Círculo cercano')
    expect(d.identity.importanceScore).toBe(9)
    expect(d.identity.trustLevel).toBe(8)
  })

  it('días desde contacto (fecha date-only)', () => {
    const d = buildDossier({ person: person({ lastContact: '2026-05-22' }) }, NOW)
    expect(d.daysSinceContact).toBe(10)
    expect(d.lastContactFormatted).toBe('2026-05-22')
  })

  it('sin lastContact → null', () => {
    const d = buildDossier({ person: person({}) }, NOW)
    expect(d.daysSinceContact).toBeNull()
    expect(d.lastContactFormatted).toBeNull()
  })
})

describe('buildDossier — fechas importantes', () => {
  it('ordena por cercanía y formatea con countdown', () => {
    const d = buildDossier(
      {
        person: person({
          specialDates: [
            { id: 's1', label: 'Aniversario', date: '2026-06-20', recurring: true },
            { id: 's2', label: 'Santo', date: '2026-06-05', recurring: true },
          ],
        }),
      },
      NOW,
    )
    expect(d.specialDates.map((s) => s.label)).toEqual(['Santo', 'Aniversario'])
    expect(d.specialDates[0].countdownPhrase).toBe('en 4 días')
  })

  it('sin fechas → []', () => {
    expect(buildDossier({ person: person({}) }, NOW).specialDates).toEqual([])
  })
})

describe('buildDossier — redes', () => {
  it('solo incluye las presentes y marca hasNetworks', () => {
    const d = buildDossier(
      { person: person({ instagramHandle: 'diana.d', phoneNumber: '+51 999' }) },
      NOW,
    )
    expect(d.networks.instagram).toBe('diana.d')
    expect(d.networks.phone).toBe('+51 999')
    expect(d.networks.linkedin).toBeUndefined()
    expect(d.hasNetworks).toBe(true)
  })

  it('sin redes → hasNetworks false', () => {
    expect(buildDossier({ person: person({}) }, NOW).hasNetworks).toBe(false)
  })
})

describe('buildDossier — línea de tiempo', () => {
  it('mergea logs + observations, más nuevos primero', () => {
    const d = buildDossier(
      {
        person: person({}),
        personLogs: [
          plog({ id: 'a', kind: 'interaction', value: 5, loggedAt: '2026-05-20T10:00:00Z', note: 'linda charla' }),
        ],
        observations: [obs({ id: 'b', observedAt: '2026-05-25T14:00:00Z' })],
      },
      NOW,
    )
    expect(d.recentTimeline).toHaveLength(2)
    // 05-25 (obs) antes que 05-20 (log)
    expect(d.recentTimeline[0].source).toBe('observation')
    expect(d.recentTimeline[1].source).toBe('log')
    expect(d.recentTimeline[1].label).toBe('Interacción')
    expect(d.recentTimeline[1].detail).toContain('valor 5/5')
    expect(d.recentTimeline[1].detail).toContain('linda charla')
  })

  it('respeta el límite de timeline', () => {
    const logs = Array.from({ length: 20 }, (_, i) =>
      plog({ id: `l${i}`, loggedAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z` }),
    )
    const d = buildDossier({ person: person({}), personLogs: logs, timelineLimit: 5 }, NOW)
    expect(d.recentTimeline).toHaveLength(5)
  })

  it('sin logs ni observations → timeline vacía', () => {
    expect(buildDossier({ person: person({}) }, NOW).recentTimeline).toEqual([])
  })
})

describe('buildDossier — Lo personal', () => {
  it('incluye síntesis si existe, null si vacía/blank', () => {
    expect(buildDossier({ person: person({}), personalSynthesis: '  Texto.  ' }, NOW).personal).toBe('Texto.')
    expect(buildDossier({ person: person({}), personalSynthesis: '   ' }, NOW).personal).toBeNull()
    expect(buildDossier({ person: person({}) }, NOW).personal).toBeNull()
  })
})

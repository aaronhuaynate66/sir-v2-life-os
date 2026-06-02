import { describe, it, expect } from 'vitest'

import {
  buildDailyActions,
  computeAvailability,
  type DailyActionPersonInput,
} from './build'
import type { Person } from '@/types'

const NOW = new Date('2026-06-02T12:00:00')

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    slug: 'ana',
    name: 'Ana',
    relationship: 'friend',
    category: 'close',
    importanceScore: 6,
    energyImpact: 'neutral',
    trustLevel: 6,
    contactFrequency: '',
    tags: [],
    notes: '',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  }
}

function input(over: Partial<DailyActionPersonInput> = {}): DailyActionPersonInput {
  return {
    person: person(),
    fuerza: 50,
    reciprocidad: null,
    confianza: 50,
    status: 'active',
    daysSinceContact: 40,
    contactFrequencyDays: 14,
    hasUpcomingDate: false,
    recentSignals: [],
    ...over,
  }
}

describe('computeAvailability', () => {
  it('promedia energía, ánimo y (10-estrés) a 0-100', () => {
    expect(computeAvailability({ energy: 8, mood: 6, stress: 2 })).toBe(73) // (8+6+8)/3=7.33→73
  })
  it('sin métricas → null', () => {
    expect(computeAvailability({})).toBeNull()
  })
  it('usa las que haya', () => {
    expect(computeAvailability({ energy: 5 })).toBe(50)
  })
})

describe('buildDailyActions', () => {
  it('genera una tarjeta de contacto para un vínculo vencido', () => {
    const r = buildDailyActions([input({ daysSinceContact: 60, contactFrequencyDays: 14 })], {}, NOW)
    expect(r.length).toBe(1)
    expect(r[0].kind).toBe('contact')
    expect(r[0].personName).toBe('Ana')
  })

  it('una tarjeta por persona (la razón de mayor score gana)', () => {
    // Cumple hoy + vínculo vencido → debe quedar la de cumpleaños (mayor score)
    const r = buildDailyActions(
      [input({ person: person({ birthDate: '1990-06-02' }), daysSinceContact: 60 })],
      {},
      NOW,
    )
    expect(r.length).toBe(1)
    expect(r[0].kind).toBe('birthday')
  })

  it('omite vínculos terminados (status ended)', () => {
    const r = buildDailyActions([input({ status: 'ended', daysSinceContact: 200 })], {}, NOW)
    expect(r.length).toBe(0)
  })

  it('omite vínculos al día (sin nada urgente que decir)', () => {
    const r = buildDailyActions(
      [input({ person: person({ category: 'close' }), daysSinceContact: 1, contactFrequencyDays: 30, fuerza: 80, confianza: 80 })],
      {},
      NOW,
    )
    expect(r.length).toBe(0)
  })

  it('expone reciprocidad y fuerza en la tarjeta (GEMA C visible)', () => {
    const r = buildDailyActions([input({ reciprocidad: 58, fuerza: 70, daysSinceContact: 60 })], {}, NOW)
    expect(r[0].reciprocidad).toBe(58)
    expect(r[0].fuerza).toBe(70)
  })

  it('disponibilidad baja atenúa los contactos proactivos (no las fechas)', () => {
    const lowAvail = buildDailyActions([input({ daysSinceContact: 60 })], { availability: 0 }, NOW)
    const highAvail = buildDailyActions([input({ daysSinceContact: 60 })], { availability: 100 }, NOW)
    expect(lowAvail[0].score).toBeLessThan(highAvail[0].score)
  })

  it('un cumpleaños NO se atenúa por disponibilidad baja', () => {
    const p = person({ birthDate: '1990-06-02' })
    const low = buildDailyActions([input({ person: p, daysSinceContact: 5 })], { availability: 0 }, NOW)
    const high = buildDailyActions([input({ person: p, daysSinceContact: 5 })], { availability: 100 }, NOW)
    expect(low[0].kind).toBe('birthday')
    expect(low[0].score).toBe(high[0].score) // fecha intacta
  })

  it('respeta el límite', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      input({ person: person({ id: `p${i}`, name: `P${i}`, slug: `p${i}` }), daysSinceContact: 60 }),
    )
    const r = buildDailyActions(many, { limit: 3 }, NOW)
    expect(r.length).toBe(3)
  })

  it('ordena por score desc', () => {
    const r = buildDailyActions(
      [
        input({ person: person({ id: 'a', name: 'A', slug: 'a' }), daysSinceContact: 50, contactFrequencyDays: 14 }),
        input({ person: person({ id: 'b', name: 'B', slug: 'b' }), status: 'dormant', daysSinceContact: 120, contactFrequencyDays: 14, fuerza: 20, confianza: 20 }),
      ],
      {},
      NOW,
    )
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score)
  })
})

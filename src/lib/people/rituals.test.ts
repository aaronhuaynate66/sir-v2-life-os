import { describe, it, expect } from 'vitest'

import { generateRituals, type RitualPersonInput } from './rituals'
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

function input(over: Partial<RitualPersonInput> = {}): RitualPersonInput {
  return {
    person: person(),
    daysSinceContact: 3,
    fuerza: 60,
    status: 'active',
    recentSignals: [],
    ...over,
  }
}

describe('generateRituals — contacto frío (no_contact)', () => {
  it('≥21 días sin hablar y fuerza>20 dispara reconexión', () => {
    const r = generateRituals([input({ daysSinceContact: 24, fuerza: 50 })], NOW)
    const ritual = r.find((x) => x.type === 'no_contact')
    expect(ritual).toBeDefined()
    expect(ritual!.message).toContain('semana')
    expect(ritual!.priority).toBe(7)
  })

  it('prioridad escala con los días (45d→8, 60d→9)', () => {
    expect(generateRituals([input({ daysSinceContact: 50, fuerza: 50 })], NOW)[0].priority).toBe(8)
    expect(generateRituals([input({ daysSinceContact: 70, fuerza: 50 })], NOW)[0].priority).toBe(9)
  })

  it('no dispara si la fuerza es ≤20 (vínculo trivial)', () => {
    const r = generateRituals([input({ daysSinceContact: 40, fuerza: 15 })], NOW)
    expect(r.find((x) => x.type === 'no_contact')).toBeUndefined()
  })

  it('no dispara con contacto reciente', () => {
    const r = generateRituals([input({ daysSinceContact: 5, fuerza: 60 })], NOW)
    expect(r.find((x) => x.type === 'no_contact')).toBeUndefined()
  })
})

describe('generateRituals — cumpleaños', () => {
  it('cumple hoy → prioridad 10', () => {
    const r = generateRituals(
      [input({ person: person({ birthDate: '1990-06-02' }), daysSinceContact: 2 })],
      NOW,
    )
    const b = r.find((x) => x.type === 'birthday')!
    expect(b.priority).toBe(10)
    expect(b.message).toContain('¡Hoy es el cumpleaños')
  })

  it('cumple en 5 días → dispara con prioridad 8', () => {
    const r = generateRituals(
      [input({ person: person({ birthDate: '1990-06-07' }), daysSinceContact: 2 })],
      NOW,
    )
    const b = r.find((x) => x.type === 'birthday')!
    expect(b.daysUntil).toBe(5)
    expect(b.priority).toBe(8)
  })

  it('cumple en 20 días → no dispara (fuera de ventana de 7d)', () => {
    const r = generateRituals(
      [input({ person: person({ birthDate: '1990-06-22' }), daysSinceContact: 2 })],
      NOW,
    )
    expect(r.find((x) => x.type === 'birthday')).toBeUndefined()
  })
})

describe('generateRituals — fechas especiales', () => {
  it('aniversario en ≤14d con acción específica', () => {
    const r = generateRituals(
      [
        input({
          person: person({
            specialDates: [{ id: 's1', label: 'Aniversario de bodas', date: '2020-06-10', recurring: true }],
          }),
          daysSinceContact: 2,
        }),
      ],
      NOW,
    )
    const sd = r.find((x) => x.type === 'special_date')!
    expect(sd).toBeDefined()
    expect(sd.action).toBe('Planeá algo especial')
  })
})

describe('generateRituals — enfriándose (cooling)', () => {
  it('relación tensa dispara cooling', () => {
    const r = generateRituals([input({ status: 'strained', daysSinceContact: 2 })], NOW)
    const c = r.find((x) => x.type === 'cooling')!
    expect(c.message).toContain('está tensa')
  })

  it('fuerza baja (10-40) con actividad reciente dispara cooling', () => {
    const r = generateRituals([input({ fuerza: 30, status: 'active', daysSinceContact: 10 })], NOW)
    const c = r.find((x) => x.type === 'cooling')!
    expect(c.message).toContain('enfriando')
  })
})

describe('generateRituals — reconocer novedad (acknowledge)', () => {
  it('señal accionable de hace 5 días dispara acknowledge', () => {
    const r = generateRituals(
      [
        input({
          daysSinceContact: 2,
          recentSignals: [
            { type: 'opportunity', detectedAt: '2026-05-28T12:00:00', actionRequired: true },
          ],
        }),
      ],
      NOW,
    )
    expect(r.find((x) => x.type === 'acknowledge')).toBeDefined()
  })

  it('señal de hace 1 día (todavía fresca) NO dispara acknowledge', () => {
    const r = generateRituals(
      [
        input({
          daysSinceContact: 2,
          recentSignals: [
            { type: 'opportunity', detectedAt: '2026-06-01T12:00:00', actionRequired: true },
          ],
        }),
      ],
      NOW,
    )
    expect(r.find((x) => x.type === 'acknowledge')).toBeUndefined()
  })
})

describe('generateRituals — orden', () => {
  it('ordena por prioridad desc (cumple hoy antes que contacto frío)', () => {
    const r = generateRituals(
      [
        input({ person: person({ id: 'p2', name: 'Beto', birthDate: '1990-06-02' }), daysSinceContact: 2 }),
        input({ person: person({ id: 'p3', name: 'Caro' }), daysSinceContact: 40, fuerza: 50 }),
      ],
      NOW,
    )
    expect(r[0].type).toBe('birthday')
    expect(r[0].priority).toBeGreaterThanOrEqual(r[1].priority)
  })
})

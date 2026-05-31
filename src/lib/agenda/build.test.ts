// SIR V2 — Tests de la agenda "Próximo" (Feature 1).
//
// buildAgenda recibe `now` explícito → determinístico y TZ-independiente
// (toda fecha date-only se parsea con parseLocalDate / componentes locales).
//
// Cubrimos las 5 fuentes (señales / sin-contacto / objetivos / cumpleaños /
// fechas especiales), el orden por grupos, el horizonte, los umbrales por
// importancia y los casos borde (data vacía, una sola persona, fechas en
// pasado/futuro, lastContact ausente, objetivo vencido).

import { describe, it, expect } from 'vitest'

import type { Goal, Person, Signal, SpecialDate } from '@/types'
import { buildAgenda } from './build'

const NOW = new Date(2026, 5, 1) // 1-jun-2026, medianoche local.

function person(over: Partial<Person>): Person {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'Persona',
    slug: over.slug,
    relationship: 'friend',
    category: 'close',
    importanceScore: over.importanceScore ?? 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    lastContact: over.lastContact,
    contactFrequency: 'weekly',
    tags: [],
    notes: '',
    birthDate: over.birthDate,
    specialDates: over.specialDates,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function goal(over: Partial<Goal>): Goal {
  return {
    id: over.id ?? 'g1',
    title: over.title ?? 'Objetivo',
    description: '',
    category: 'personal',
    priority: 'medium',
    status: over.status ?? 'active',
    targetDate: over.targetDate,
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 0,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function signal(over: Partial<Signal>): Signal {
  return {
    id: over.id ?? 's1',
    source: 'manual',
    type: 'warning',
    content: over.content ?? 'Señal',
    strength: 5,
    urgency: over.urgency ?? 'soon',
    relatedPersons: [],
    relatedGoals: [],
    actionRequired: over.actionRequired ?? true,
    resolved: over.resolved ?? false,
    detectedAt: '2026-05-01T00:00:00Z',
    ...over,
  }
}

const EMPTY = { people: [], goals: [], signals: [] }

describe('buildAgenda — casos vacíos', () => {
  it('sin data → lista vacía', () => {
    expect(buildAgenda(EMPTY, {}, NOW)).toEqual([])
  })

  it('persona sin ninguna fecha ni lastContact → no genera items', () => {
    const items = buildAgenda({ ...EMPTY, people: [person({})] }, {}, NOW)
    expect(items).toEqual([])
  })
})

describe('buildAgenda — cumpleaños', () => {
  it('cumpleaños dentro del horizonte → item con edad y frase', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ name: 'Diana', birthDate: '1995-06-06' })] },
      {},
      NOW,
    )
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('birthday')
    expect(items[0].title).toBe('Cumpleaños de Diana')
    expect(items[0].daysUntil).toBe(5)
    expect(items[0].detail).toContain('cumple 31')
    expect(items[0].detail).toContain('en 5 días')
  })

  it('cumpleaños fuera del horizonte → excluido', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ birthDate: '1995-08-20' })] },
      { horizonDays: 30 },
      NOW,
    )
    expect(items).toHaveLength(0)
  })

  it('cumpleaños hoy → daysUntil 0, frase "hoy"', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ birthDate: '1990-06-01' })] },
      {},
      NOW,
    )
    expect(items[0].daysUntil).toBe(0)
    expect(items[0].detail).toContain('hoy')
  })
})

describe('buildAgenda — fechas especiales (agenda global)', () => {
  const sd = (o: Partial<SpecialDate>): SpecialDate => ({
    id: o.id ?? 'sd1',
    label: o.label ?? 'Aniversario',
    date: o.date ?? '2020-06-10',
    recurring: o.recurring ?? true,
  })

  it('agrega fechas especiales de TODA la red, no por persona', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        people: [
          person({ id: 'a', name: 'Ana', specialDates: [sd({ id: 's_a', label: 'Santo', date: '2020-06-05' })] }),
          person({ id: 'b', name: 'Bob', specialDates: [sd({ id: 's_b', label: 'Mudanza', date: '2020-06-10' })] }),
        ],
      },
      {},
      NOW,
    )
    const specials = items.filter((i) => i.kind === 'special_date')
    expect(specials).toHaveLength(2)
    expect(specials.map((i) => i.title)).toContain('Santo · Ana')
    expect(specials.map((i) => i.title)).toContain('Mudanza · Bob')
  })

  it('one-time ya pasada → excluida; one-time futura dentro de horizonte → incluida', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        people: [
          person({
            id: 'a',
            name: 'Ana',
            specialDates: [
              sd({ id: 'past', label: 'Pasado', date: '2026-05-01', recurring: false }),
              sd({ id: 'fut', label: 'Futuro', date: '2026-06-10', recurring: false }),
            ],
          }),
        ],
      },
      {},
      NOW,
    )
    const specials = items.filter((i) => i.kind === 'special_date')
    expect(specials).toHaveLength(1)
    expect(specials[0].title).toBe('Futuro · Ana')
  })
})

describe('buildAgenda — sin contacto', () => {
  it('persona normal supera umbral base (30d) → alerta', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ name: 'Leo', lastContact: '2026-04-20' })] },
      {},
      NOW,
    )
    const nc = items.find((i) => i.kind === 'no_contact')
    expect(nc).toBeDefined()
    expect(nc!.title).toContain('Leo')
    expect(nc!.detail).toContain('hace 42 días')
    expect(nc!.daysUntil).toBe(-42)
  })

  it('persona normal por debajo del umbral base → sin alerta', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ lastContact: '2026-05-20' })] }, // 12 días
      {},
      NOW,
    )
    expect(items.filter((i) => i.kind === 'no_contact')).toHaveLength(0)
  })

  it('alta importancia usa umbral más corto (14d)', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ name: 'VIP', importanceScore: 9, lastContact: '2026-05-12' })] }, // 20 días
      {},
      NOW,
    )
    expect(items.find((i) => i.kind === 'no_contact')).toBeDefined()
  })

  it('lastContact ausente → no clasifica (no inventa urgencia)', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ importanceScore: 10 })] },
      {},
      NOW,
    )
    expect(items.filter((i) => i.kind === 'no_contact')).toHaveLength(0)
  })

  it('umbral configurable', () => {
    const items = buildAgenda(
      { ...EMPTY, people: [person({ lastContact: '2026-05-25' })] }, // 7 días
      { noContactThresholdDays: 5 },
      NOW,
    )
    expect(items.find((i) => i.kind === 'no_contact')).toBeDefined()
  })
})

describe('buildAgenda — objetivos', () => {
  it('objetivo activo con targetDate cercana → item', () => {
    const items = buildAgenda(
      { ...EMPTY, goals: [goal({ title: 'Lanzar', targetDate: '2026-06-10' })] },
      {},
      NOW,
    )
    const gi = items.find((i) => i.kind === 'goal_target')
    expect(gi).toBeDefined()
    expect(gi!.title).toBe('Objetivo: Lanzar')
    expect(gi!.daysUntil).toBe(9)
  })

  it('objetivo vencido (activo) → incluido con daysUntil negativo', () => {
    const items = buildAgenda(
      { ...EMPTY, goals: [goal({ title: 'Tarde', targetDate: '2026-05-20' })] },
      {},
      NOW,
    )
    const gi = items.find((i) => i.kind === 'goal_target')!
    expect(gi.daysUntil).toBe(-12)
    expect(gi.detail).toContain('vencido')
  })

  it('objetivo no-activo → excluido', () => {
    const items = buildAgenda(
      { ...EMPTY, goals: [goal({ status: 'completed', targetDate: '2026-06-05' })] },
      {},
      NOW,
    )
    expect(items.filter((i) => i.kind === 'goal_target')).toHaveLength(0)
  })

  it('objetivo sin targetDate → excluido', () => {
    const items = buildAgenda({ ...EMPTY, goals: [goal({})] }, {}, NOW)
    expect(items.filter((i) => i.kind === 'goal_target')).toHaveLength(0)
  })
})

describe('buildAgenda — señales críticas', () => {
  it('señal sin resolver, accionable y urgente → item', () => {
    const items = buildAgenda(
      { ...EMPTY, signals: [signal({ content: 'Revisar contrato', urgency: 'immediate' })] },
      {},
      NOW,
    )
    expect(items[0].kind).toBe('critical_signal')
    expect(items[0].title).toBe('Revisar contrato')
  })

  it('señal resuelta o no accionable o de baja urgencia → excluida', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        signals: [
          signal({ id: 'x', resolved: true }),
          signal({ id: 'y', actionRequired: false }),
          signal({ id: 'z', urgency: 'monitor' }),
        ],
      },
      {},
      NOW,
    )
    expect(items.filter((i) => i.kind === 'critical_signal')).toHaveLength(0)
  })
})

describe('buildAgenda — orden por urgencia', () => {
  it('orden: señal inmediata → señal pronto → sin-contacto → fechas', () => {
    const items = buildAgenda(
      {
        people: [
          person({ id: 'nc', name: 'Zoe', lastContact: '2026-04-01' }), // sin contacto
          person({ id: 'bd', name: 'Ema', birthDate: '1990-06-03' }), // cumple en 2 días
        ],
        goals: [goal({ title: 'Meta', targetDate: '2026-06-02' })],
        signals: [
          signal({ id: 'imm', content: 'Inmediata', urgency: 'immediate' }),
          signal({ id: 'soon', content: 'Pronto', urgency: 'soon' }),
        ],
      },
      {},
      NOW,
    )
    expect(items.map((i) => i.kind)).toEqual([
      'critical_signal', // immediate
      'critical_signal', // soon
      'no_contact',
      'goal_target', // daysUntil 1
      'birthday', // daysUntil 2
    ])
    expect(items[0].title).toBe('Inmediata')
    expect(items[1].title).toBe('Pronto')
  })

  it('dentro del grupo de fechas ordena por cercanía ascendente', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        people: [
          person({ id: 'a', name: 'Lejos', birthDate: '1990-06-20' }),
          person({ id: 'b', name: 'Cerca', birthDate: '1990-06-03' }),
        ],
      },
      {},
      NOW,
    )
    expect(items.map((i) => i.title)).toEqual([
      'Cumpleaños de Cerca',
      'Cumpleaños de Lejos',
    ])
  })

  it('respeta el límite tras ordenar', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        signals: [
          signal({ id: '1', content: 'A', urgency: 'immediate' }),
          signal({ id: '2', content: 'B', urgency: 'immediate' }),
          signal({ id: '3', content: 'C', urgency: 'soon' }),
        ],
      },
      { limit: 2 },
      NOW,
    )
    expect(items).toHaveLength(2)
    // Las 2 inmediatas ganan al recortar (sortRank 0 antes que 'soon').
    expect(items.map((i) => i.title)).toEqual(['A', 'B'])
    expect(items[2]).toBeUndefined()
  })
})

describe('buildAgenda — href', () => {
  it('usa slug si existe, si no el id', () => {
    const items = buildAgenda(
      {
        ...EMPTY,
        people: [
          person({ id: 'p_slug', slug: 'diana', birthDate: '1990-06-02' }),
          person({ id: 'p_noslug', birthDate: '1990-06-02' }),
        ],
      },
      {},
      NOW,
    )
    const withSlug = items.find((i) => i.personId === 'p_slug')!
    const noSlug = items.find((i) => i.personId === 'p_noslug')!
    expect(withSlug.href).toBe('/relaciones/diana')
    expect(noSlug.href).toBe('/relaciones/p_noslug')
  })
})

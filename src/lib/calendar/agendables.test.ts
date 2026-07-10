import { describe, it, expect } from 'vitest'

import { collectAgendables, collectTaskAgendables } from './agendables'
import type { Person, ObjectiveStep } from '@/types'

const NOW = new Date(2026, 6, 10) // 10-jul-2026 local

function step(o: Partial<ObjectiveStep> & { id: string }): ObjectiveStep {
  return {
    objectiveId: 'g', kind: 'task', title: o.title ?? 'Tarea', status: 'pendiente',
    order: 0, createdAt: '', ...o,
  } as ObjectiveStep
}

function person(o: Partial<Person> & { id: string; name: string }): Person {
  return {
    relationship: 'friend', category: 'close', importanceScore: 5, energyImpact: 'neutral',
    trustLevel: 5, contactFrequency: '', tags: [], notes: '', createdAt: '', updatedAt: '', ...o,
  } as Person
}

describe('collectAgendables', () => {
  it('trae cumpleaños y fechas dentro del horizonte, ordenados por cercanía', () => {
    const people = [
      person({ id: 'a', name: 'Ana Pérez', birthDate: '1990-07-20' }), // en 10 días
      person({ id: 'b', name: 'Beto Ruiz', specialDates: [{ id: 's1', label: 'Aniversario', date: '2024-07-15', recurring: true }] }), // en 5
    ]
    const out = collectAgendables(people, [], NOW)
    expect(out.map((x) => x.title)).toEqual(['Aniversario', 'Cumpleaños de Ana']) // 5d antes que 10d
    expect(out[1].date).toBe('2026-07-20')
    expect(out[1].recurring).toBe(true)
  })

  it('excluye fechas fuera del horizonte y pasadas', () => {
    const people = [
      person({ id: 'a', name: 'Lejos', specialDates: [{ id: 's', label: 'Evento lejano', date: '2026-12-01', recurring: false }] }),
      person({ id: 'b', name: 'Pasado', specialDates: [{ id: 's', label: 'Ya fue', date: '2026-07-01', recurring: false }] }),
    ]
    expect(collectAgendables(people, [], NOW)).toEqual([])
  })

  it('dedup: no propone lo que ya está en el calendario (por título)', () => {
    const people = [person({ id: 'a', name: 'Ana', birthDate: '1990-07-20' })]
    const out = collectAgendables(people, ['cumpleaños de ANA'], NOW) // ya en el calendario
    expect(out).toEqual([])
  })

  it('recurring=false para una fecha única dentro del horizonte, kind=fecha', () => {
    const people = [person({ id: 'a', name: 'X', specialDates: [{ id: 's', label: 'Mudanza', date: '2026-07-25', recurring: false }] })]
    const out = collectAgendables(people, [], NOW)
    expect(out).toHaveLength(1)
    expect(out[0].recurring).toBe(false)
    expect(out[0].kind).toBe('fecha')
    expect(out[0].date).toBe('2026-07-25')
  })
})

describe('collectTaskAgendables', () => {
  it('trae tareas con targetDate dentro del horizonte, ordenadas y con hora opcional', () => {
    const steps = [
      step({ id: 't1', title: 'Acuerdo con Marita', targetDate: '2026-07-20' }),          // en 10d, día completo
      step({ id: 't2', title: 'Llamar al médico', targetDate: '2026-07-12', dueTime: '18:00' }), // en 2d, con hora
    ]
    const out = collectTaskAgendables(steps, [], NOW)
    expect(out.map((x) => x.title)).toEqual(['Llamar al médico', 'Acuerdo con Marita'])
    expect(out[0].kind).toBe('tarea')
    expect(out[0].time).toBe('18:00')
    expect(out[1].time).toBeUndefined()
  })

  it('excluye hechas, sin fecha, fuera de horizonte y las que no son tarea', () => {
    const steps = [
      step({ id: 'a', title: 'Hecha', targetDate: '2026-07-15', status: 'hecho' }),
      step({ id: 'b', title: 'Sin fecha' }),
      step({ id: 'c', title: 'Lejana', targetDate: '2026-12-01' }),
      step({ id: 'd', title: 'Es un KR', targetDate: '2026-07-15', kind: 'key_result' }),
    ]
    expect(collectTaskAgendables(steps, [], NOW)).toEqual([])
  })

  it('dedup contra el calendario por título', () => {
    const steps = [step({ id: 't', title: 'Pagar alquiler', targetDate: '2026-07-15' })]
    expect(collectTaskAgendables(steps, ['PAGAR alquiler'], NOW)).toEqual([])
  })
})

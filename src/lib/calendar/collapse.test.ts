// SIR V2 — Tests del colapso de eventos recurrentes.

import { describe, it, expect } from 'vitest'

import type { CalendarEvent } from './types'
import { collapseRecurring } from './collapse'

function ev(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: over.id ?? over.uid ?? 'e1',
    uid: over.uid ?? 'u1',
    title: over.title ?? 'Evento',
    start: over.start ?? '2026-06-01T12:00:00.000Z',
    allDay: over.allDay ?? false,
    recurring: over.recurring ?? false,
    ...over,
  }
}

describe('collapseRecurring', () => {
  it('separa únicos de recurrentes', () => {
    const { oneOff, series } = collapseRecurring([
      ev({ uid: 'reunion', title: 'Reunión cliente', recurring: false }),
      ev({ uid: 'gym', title: 'Gym', recurring: true }),
    ])
    expect(oneOff.map((e) => e.title)).toEqual(['Reunión cliente'])
    expect(series.map((e) => e.title)).toEqual(['Gym'])
  })

  it('colapsa cada serie a su PRÓXIMA ocurrencia (una fila por uid)', () => {
    const { series } = collapseRecurring([
      ev({ id: 'gym@3', uid: 'gym', title: 'Gym', start: '2026-06-03T12:00:00.000Z', recurring: true }),
      ev({ id: 'gym@1', uid: 'gym', title: 'Gym', start: '2026-06-01T12:00:00.000Z', recurring: true }),
      ev({ id: 'gym@2', uid: 'gym', title: 'Gym', start: '2026-06-02T12:00:00.000Z', recurring: true }),
    ])
    expect(series).toHaveLength(1)
    expect(series[0].start).toBe('2026-06-01T12:00:00.000Z') // la más próxima
  })

  it('mantiene series distintas separadas', () => {
    const { series } = collapseRecurring([
      ev({ uid: 'gym', title: 'Gym', recurring: true }),
      ev({ uid: 'daily', title: 'Daily Teams', recurring: true, start: '2026-06-01T13:00:00.000Z' }),
    ])
    expect(series.map((e) => e.title).sort()).toEqual(['Daily Teams', 'Gym'])
  })

  it('ordena ambas listas por inicio ascendente', () => {
    const { oneOff } = collapseRecurring([
      ev({ uid: 'b', title: 'B', start: '2026-06-05T12:00:00.000Z' }),
      ev({ uid: 'a', title: 'A', start: '2026-06-02T12:00:00.000Z' }),
    ])
    expect(oneOff.map((e) => e.title)).toEqual(['A', 'B'])
  })

  it('sin uid → cae al título como clave de serie', () => {
    const { series } = collapseRecurring([
      ev({ id: 'x1', uid: '', title: 'Standup', recurring: true, start: '2026-06-01T12:00:00.000Z' }),
      ev({ id: 'x2', uid: '', title: 'Standup', recurring: true, start: '2026-06-02T12:00:00.000Z' }),
    ])
    expect(series).toHaveLength(1)
  })

  it('lista vacía → ambas vacías', () => {
    expect(collapseRecurring([])).toEqual({ oneOff: [], series: [] })
  })
})

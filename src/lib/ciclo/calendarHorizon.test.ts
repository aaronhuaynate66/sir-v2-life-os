// SIR V2 — Tests del cruce calendario × horizonte del ciclo.

import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from '@/lib/calendar/types'
import { calendarEventsToHorizon, mergeHorizonEvents, limaDateOf } from './calendarHorizon'
import type { HorizonEventInput } from './horizon'

function ev(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: over.id ?? 'e1', uid: over.uid ?? 'u1', title: over.title ?? 'Evento',
    start: over.start ?? '2026-07-15', end: over.end, allDay: over.allDay ?? false,
    location: over.location, recurring: over.recurring ?? false, ...over,
  }
}

const WIN = { personName: 'Diana Carolina Díaz', fromIso: '2026-07-01', toIso: '2026-08-31' }

describe('limaDateOf', () => {
  it('all-day queda igual', () => {
    expect(limaDateOf('2026-07-18')).toBe('2026-07-18')
  })
  it('cronometrado nocturno UTC baja a Lima (UTC-5) sin saltar de día', () => {
    // 2026-07-10T02:00:00Z = 2026-07-09 21:00 en Lima → 07-09.
    expect(limaDateOf('2026-07-10T02:00:00Z')).toBe('2026-07-09')
  })
})

describe('calendarEventsToHorizon — curated', () => {
  it('incluye all-day (viaje) y descarta reuniones sueltas cronometradas', () => {
    const out = calendarEventsToHorizon([
      ev({ title: 'Viaje Cusco', start: '2026-07-18', allDay: true }),
      ev({ title: 'Daily K2', start: '2026-07-10T14:00:00Z', allDay: false }),
      ev({ title: 'Reunión con Alex', start: '2026-07-11T15:00:00Z', allDay: false }),
    ], { ...WIN, mode: 'curated' })
    expect(out.map((e) => e.label)).toEqual(['Viaje Cusco'])
    expect(out[0].kind).toBe('trip')
  })
  it('incluye un evento cronometrado si menciona a la persona', () => {
    const out = calendarEventsToHorizon([
      ev({ title: 'Cena con Diana', start: '2026-08-09T23:00:00Z', allDay: false }),
      ev({ title: 'Comité HNG', start: '2026-08-09T15:00:00Z', allDay: false }),
    ], { ...WIN, mode: 'curated' })
    expect(out.map((e) => e.label)).toEqual(['Cena con Diana'])
    expect(out[0].kind).toBe('calendar')
  })
  it('match de persona es sin acentos', () => {
    const out = calendarEventsToHorizon([ev({ title: 'Almuerzo con díana', start: '2026-07-20T18:00:00Z' })], { ...WIN, mode: 'curated' })
    expect(out).toHaveLength(1)
  })
  it('respeta la ventana [from,to]', () => {
    const out = calendarEventsToHorizon([
      ev({ title: 'Viaje viejo', start: '2026-06-01', allDay: true }),
      ev({ title: 'Viaje futuro lejano', start: '2026-12-01', allDay: true }),
    ], { ...WIN, mode: 'curated' })
    expect(out).toHaveLength(0)
  })
  it('dedup por misma fecha+título', () => {
    const out = calendarEventsToHorizon([
      ev({ id: 'a', title: 'Feriado', start: '2026-07-28', allDay: true }),
      ev({ id: 'b', title: 'Feriado', start: '2026-07-28', allDay: true }),
    ], { ...WIN, mode: 'curated' })
    expect(out).toHaveLength(1)
  })
})

describe('calendarEventsToHorizon — modos all / person', () => {
  const base = [
    ev({ title: 'Daily K2', start: '2026-07-10T14:00:00Z' }),
    ev({ title: 'Cena con Diana', start: '2026-07-12T23:00:00Z' }),
  ]
  it('all incluye todo y respeta el limit', () => {
    expect(calendarEventsToHorizon(base, { ...WIN, mode: 'all' })).toHaveLength(2)
    expect(calendarEventsToHorizon(base, { ...WIN, mode: 'all', limit: 1 })).toHaveLength(1)
  })
  it('person solo los que la mencionan', () => {
    const out = calendarEventsToHorizon(base, { ...WIN, mode: 'person' })
    expect(out.map((e) => e.label)).toEqual(['Cena con Diana'])
  })
})

describe('calendarEventsToHorizon — upcoming (default)', () => {
  const today = '2026-07-08'
  it('descarta pasados y respeta tope por día + total', () => {
    const events = [
      ev({ title: 'Pasado', start: '2026-07-01T14:00:00Z' }),
      ev({ title: 'A', start: '2026-07-10T14:00:00Z' }),
      ev({ title: 'B', start: '2026-07-10T16:00:00Z' }),
      ev({ title: 'C', start: '2026-07-10T18:00:00Z' }), // 3ro del día → cae por maxPerDay=2
      ev({ title: 'D', start: '2026-07-20T14:00:00Z' }),
    ]
    const out = calendarEventsToHorizon(events, { ...WIN, mode: 'upcoming', todayIso: today, maxPerDay: 2, limit: 8 })
    const labels = out.map((e) => e.label)
    expect(labels).not.toContain('Pasado')
    expect(labels.filter((l) => l === 'A' || l === 'B' || l === 'C')).toHaveLength(2) // tope por día
    expect(labels).toContain('D')
  })
  it('prioriza menciones de la persona ante el tope total', () => {
    const events = [
      ev({ title: 'Reunión 1', start: '2026-07-09T14:00:00Z' }),
      ev({ title: 'Reunión 2', start: '2026-07-11T14:00:00Z' }),
      ev({ title: 'Aniversario con Diana', start: '2026-08-20T14:00:00Z' }), // más lejano pero prioritario
    ]
    const out = calendarEventsToHorizon(events, { ...WIN, mode: 'upcoming', todayIso: today, limit: 1 })
    expect(out.map((e) => e.label)).toEqual(['Aniversario con Diana'])
  })
})

describe('mergeHorizonEvents', () => {
  it('las fechas especiales ganan sobre el calendario en colisión fecha+label', () => {
    const special: HorizonEventInput[] = [{ date: '2026-08-02', label: 'Cumple de Diana', kind: 'birthday' }]
    const cal: HorizonEventInput[] = [{ date: '2026-08-02', label: 'cumple de diana', kind: 'calendar' }]
    const out = mergeHorizonEvents(special, cal)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('birthday')
  })
  it('mergea distintos y ordena por fecha', () => {
    const out = mergeHorizonEvents(
      [{ date: '2026-08-10', label: 'B', kind: 'calendar' }],
      [{ date: '2026-07-05', label: 'A', kind: 'trip' }],
    )
    expect(out.map((e) => e.label)).toEqual(['A', 'B'])
  })
})

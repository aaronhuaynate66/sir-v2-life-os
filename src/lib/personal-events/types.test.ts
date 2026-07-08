// SIR V2 — Tests de la agenda personal (mapeo puro al horizonte del ciclo).

import { describe, it, expect } from 'vitest'
import { personalEventsToHorizon, rowToPersonalEvent, type PersonalEvent, type PersonalEventRow } from './types'

function pe(over: Partial<PersonalEvent>): PersonalEvent {
  return {
    id: over.id ?? 'p1', personId: over.personId ?? 'diana', title: over.title ?? 'Cena',
    date: over.date ?? '2026-07-20', endDate: over.endDate ?? null, allDay: over.allDay ?? true,
    note: over.note ?? null, source: over.source ?? 'sir', ...over,
  }
}

const WIN = { personId: 'diana', fromIso: '2026-07-01', toIso: '2026-08-31' }

describe('personalEventsToHorizon', () => {
  it('mapea planes de la persona a eventos ♥ del horizonte', () => {
    const out = personalEventsToHorizon([pe({ title: 'Cena romántica', date: '2026-07-20' })], WIN)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ date: '2026-07-20', label: 'Cena romántica', kind: 'partner' })
  })
  it('un viaje se marca como trip', () => {
    const out = personalEventsToHorizon([pe({ title: 'Viaje a Cusco', date: '2026-08-05' })], WIN)
    expect(out[0].kind).toBe('trip')
  })
  it('ignora planes de OTRA persona', () => {
    const out = personalEventsToHorizon([pe({ personId: 'otro', title: 'X' })], WIN)
    expect(out).toHaveLength(0)
  })
  it('ignora planes generales (sin persona)', () => {
    const out = personalEventsToHorizon([pe({ personId: null, title: 'Gym' })], WIN)
    expect(out).toHaveLength(0)
  })
  it('respeta la ventana', () => {
    const out = personalEventsToHorizon([
      pe({ title: 'Viejo', date: '2026-06-01' }),
      pe({ title: 'Lejano', date: '2026-12-01' }),
    ], WIN)
    expect(out).toHaveLength(0)
  })
  it('deduplica por fecha+título', () => {
    const out = personalEventsToHorizon([
      pe({ id: 'a', title: 'Cine', date: '2026-07-15' }),
      pe({ id: 'b', title: 'Cine', date: '2026-07-15' }),
    ], WIN)
    expect(out).toHaveLength(1)
  })
})

describe('rowToPersonalEvent', () => {
  it('normaliza fila → DTO (fechas recortadas, source válida)', () => {
    const row: PersonalEventRow = {
      id: 'x', person_id: 'diana', title: '  Cena  ', event_date: '2026-07-20',
      end_date: '2026-07-21', all_day: true, note: '  rico ', source: 'sir',
    }
    expect(rowToPersonalEvent(row)).toMatchObject({
      id: 'x', personId: 'diana', title: 'Cena', date: '2026-07-20', endDate: '2026-07-21', note: 'rico', source: 'sir',
    })
  })
  it('source desconocida → manual; note vacía → null', () => {
    const row: PersonalEventRow = { id: 'x', person_id: null, title: 'T', event_date: '2026-07-20', end_date: null, all_day: null, note: '   ', source: 'weird' }
    const dto = rowToPersonalEvent(row)
    expect(dto.source).toBe('manual')
    expect(dto.note).toBeNull()
    expect(dto.allDay).toBe(true)
    expect(dto.personId).toBeNull()
  })
})

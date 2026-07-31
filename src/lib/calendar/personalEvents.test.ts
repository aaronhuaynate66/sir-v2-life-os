// SIR V2 — Tests de personal_events → calendario.
//
// El caso que lo motivó: Aaron preguntó DOS veces por qué no veía el matrimonio de
// Laura en su calendario. El 30-jul se arregló que el BRIEF lo nombrara (#1033) y se
// dio el reclamo por cerrado sin verificar la superficie que él nombró: `/api/calendar`
// leía SOLO feeds .ics externos y nunca `personal_events`.
import { describe, it, expect } from 'vitest'
import {
  personalEventsToCalendar, mergeCalendarEvents, horaDeLaNota, lugarDeLaNota,
  SIR_CALENDAR_ID, type PersonalEventRow,
} from './personalEvents'
import type { CalendarEvent } from './types'

function pe(p: Partial<PersonalEventRow> & { id: string }): PersonalEventRow {
  return {
    id: p.id,
    // `in` y no `??`: un null EXPLÍCITO es lo que se quiere probar, y `??` lo
    // convertía al default silenciosamente (el test pasaba por el helper, no por
    // el código).
    title: 'title' in p ? (p.title as string | null) : 'Evento',
    event_date: 'event_date' in p ? (p.event_date as string | null) : '2026-08-01',
    end_date: p.end_date ?? null, all_day: p.all_day ?? true, note: p.note ?? null,
    source: p.source ?? 'sir', personName: p.personName ?? null,
  }
}
function ext(p: Partial<CalendarEvent> & { title: string; start: string }): CalendarEvent {
  return { id: p.id ?? p.title, uid: p.uid ?? p.title, title: p.title, start: p.start, allDay: true, recurring: false, calendarId: 'outlook' }
}

describe('personalEventsToCalendar — el caso real de la boda', () => {
  const BODA = pe({
    id: 'pe_boda_religiosa_laura_20260801',
    title: 'Boda religiosa de Laura Alfaro',
    event_date: '2026-08-01',
    note: '18:00–20:00. Miluska Castillo también va.',
    personName: 'Laura Alfaro',
  })

  it('la convierte en evento de calendario, con su hora rescatada de la nota', () => {
    const [e] = personalEventsToCalendar([BODA])
    expect(e.title).toContain('Boda religiosa de Laura Alfaro')
    expect(e.title).toContain('18:00–20:00')
    expect(e.start).toBe('2026-08-01')
    expect(e.allDay).toBe(true)
    expect(e.calendarId).toBe(SIR_CALENDAR_ID)
  })

  it('no duplica el nombre si el título ya lo trae', () => {
    const [e] = personalEventsToCalendar([BODA])
    expect(e.title.match(/Laura/g)?.length).toBe(1)
  })

  it('sí agrega el nombre cuando el título NO lo menciona', () => {
    const [e] = personalEventsToCalendar([pe({ id: 'x', title: 'Almuerzo familiar', personName: 'Diana Carolina' })])
    expect(e.title).toContain('Diana Carolina')
  })

  it('rango de fechas: conserva el fin cuando es válido', () => {
    const [e] = personalEventsToCalendar([pe({ id: 'tk', title: 'Taekwondo WFG26', event_date: '2026-11-06', end_date: '2026-11-07' })])
    expect(e.end).toBe('2026-11-07')
  })

  it('descarta un fin ANTERIOR al inicio (data mal cargada)', () => {
    const [e] = personalEventsToCalendar([pe({ id: 'mal', event_date: '2026-08-05', end_date: '2026-08-01' })])
    expect(e.end).toBeUndefined()
  })

  it('descarta filas sin título o sin fecha válida: no pinta eventos fantasma', () => {
    expect(personalEventsToCalendar([pe({ id: 'a', title: '' })])).toHaveLength(0)
    expect(personalEventsToCalendar([pe({ id: 'b', event_date: null })])).toHaveLength(0)
    expect(personalEventsToCalendar([pe({ id: 'c', event_date: 'mañana' })])).toHaveLength(0)
    expect(personalEventsToCalendar(null as unknown as PersonalEventRow[])).toHaveLength(0)
  })
})

describe('mergeCalendarEvents — dedupe contra el doble conteo', () => {
  // Si un evento propio YA se empujó a Google, el feed externo lo trae también.
  it('descarta el propio cuando el externo ya lo trae ese día', () => {
    const externos = [ext({ title: 'Boda religiosa de Laura Alfaro', start: '2026-08-01' })]
    const propios = personalEventsToCalendar([pe({ id: 'x', title: 'Boda religiosa de Laura Alfaro', event_date: '2026-08-01' })])
    expect(mergeCalendarEvents(externos, propios)).toHaveLength(1)
  })

  it('compara normalizado: Google recorta y reescribe títulos', () => {
    const externos = [ext({ title: 'BODA RELIGIOSA DE LAURA ALFARO!', start: '2026-08-01' })]
    const propios = personalEventsToCalendar([pe({ id: 'x', title: 'Boda religiosa de Laura Alfaro', event_date: '2026-08-01' })])
    expect(mergeCalendarEvents(externos, propios)).toHaveLength(1)
  })

  it('el MISMO título en otro día NO es duplicado', () => {
    const externos = [ext({ title: 'Control maxilofacial', start: '2026-07-30' })]
    const propios = personalEventsToCalendar([pe({ id: 'x', title: 'Control maxilofacial', event_date: '2026-08-03' })])
    expect(mergeCalendarEvents(externos, propios)).toHaveLength(2)
  })

  it('queda ordenado por fecha y respeta el límite', () => {
    const externos = [ext({ title: 'Z', start: '2026-08-10' })]
    const propios = personalEventsToCalendar([
      pe({ id: '1', title: 'A', event_date: '2026-08-01' }),
      pe({ id: '2', title: 'B', event_date: '2026-08-05' }),
    ])
    const m = mergeCalendarEvents(externos, propios)
    expect(m.map((e) => e.start)).toEqual(['2026-08-01', '2026-08-05', '2026-08-10'])
    expect(mergeCalendarEvents(externos, propios, 2)).toHaveLength(2)
  })

  it('sin externos devuelve solo los propios', () => {
    const propios = personalEventsToCalendar([pe({ id: '1', title: 'A' })])
    expect(mergeCalendarEvents([], propios)).toHaveLength(1)
  })
})

describe('horaDeLaNota — las notas están en prosa, escritas por gente', () => {
  it('rango con guion largo', () => {
    expect(horaDeLaNota('18:00–20:00. Ya pagada.')).toBe('18:00–20:00')
  })
  it('hora simple con separador de la nota', () => {
    expect(horaDeLaNota('14:00 · voy con Diana · Jirón Pedro Solari 242')).toBe('14:00')
  })
  it('con meridiano', () => {
    expect(horaDeLaNota('A partir de 4:00 pm, consultorio C-101')).toBe('4:00 pm')
  })
  it('null cuando no hay hora', () => {
    expect(horaDeLaNota('Segundo momento compartido en 8 días')).toBeNull()
    expect(horaDeLaNota(null)).toBeNull()
    expect(horaDeLaNota('')).toBeNull()
  })
  it('no confunde una fecha con una hora', () => {
    expect(horaDeLaNota('Cargado a mano el 28-jul')).toBeNull()
  })
})

describe('lugarDeLaNota — conservador a propósito', () => {
  it('rescata la dirección cuando hay marca de vía', () => {
    expect(lugarDeLaNota('Derivación de Emergencia. Av. Guardia Civil 337, San Borja.')).toContain('Av. Guardia Civil 337')
    expect(lugarDeLaNota('14:00 · voy con Diana · Jirón Pedro Solari 242')).toContain('Pedro Solari 242')
  })
  it('null con prosa suelta: no vuelca la nota entera en el campo de lugar', () => {
    expect(lugarDeLaNota('18:00–20:00. Ya pagada dentro de la inscripción.')).toBeNull()
    expect(lugarDeLaNota(null)).toBeNull()
  })
})

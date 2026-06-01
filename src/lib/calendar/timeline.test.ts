import { describe, it, expect } from 'vitest'
import { buildDayTimeline } from './timeline'
import type { CalendarEvent } from './types'

// Lima = UTC-5. 2026-06-01 09:00 Lima = 14:00 UTC.
function ev(startUtc: string, endUtc: string | undefined, title: string, opts: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id: title, uid: title, title, start: startUtc, end: endUtc, allDay: false, recurring: false, ...opts }
}
const H = 3_600_000

// "hoy" = 2026-06-01 en Lima.
const NOON_LIMA = Date.parse('2026-06-01T17:00:00.000Z') // 12:00 Lima

describe('buildDayTimeline', () => {
  it('clasifica past/current/upcoming y detecta actual + próximo', () => {
    const events = [
      ev('2026-06-01T13:00:00.000Z', '2026-06-01T14:00:00.000Z', 'Mañana 08-09'), // pasado
      ev('2026-06-01T16:30:00.000Z', '2026-06-01T17:30:00.000Z', 'Actual 11:30-12:30'), // actual (12:00 dentro)
      ev('2026-06-01T19:00:00.000Z', '2026-06-01T20:00:00.000Z', 'Tarde 14-15'), // futuro
    ]
    const t = buildDayTimeline(events, NOON_LIMA)
    expect(t.dateKey).toBe('2026-06-01')
    expect(t.blocks).toHaveLength(3)
    expect(t.blocks[0].status).toBe('past')
    expect(t.current?.event.title).toBe('Actual 11:30-12:30')
    expect(t.next?.event.title).toBe('Tarde 14-15')
    // transición = fin del actual (12:30 Lima = 17:30 UTC) - ahora (12:00)
    expect(t.msToNextTransition).toBe(30 * 60_000)
  })

  it('sin bloque actual → cuenta al inicio del próximo', () => {
    const events = [ev('2026-06-01T19:00:00.000Z', '2026-06-01T20:00:00.000Z', 'Tarde')]
    const t = buildDayTimeline(events, NOON_LIMA)
    expect(t.current).toBeNull()
    expect(t.next?.event.title).toBe('Tarde')
    expect(t.msToNextTransition).toBe(2 * H) // 12:00 -> 14:00 Lima
  })

  it('evento sin fin → bloque default de 60 min', () => {
    const events = [ev('2026-06-01T16:30:00.000Z', undefined, 'Sin fin')]
    const t = buildDayTimeline(events, NOON_LIMA)
    // 11:30 + 60min = 12:30 → a las 12:00 está en curso
    expect(t.current?.event.title).toBe('Sin fin')
    expect(t.msToNextTransition).toBe(30 * 60_000)
  })

  it('separa all-day y solo cuenta los de hoy', () => {
    const events: CalendarEvent[] = [
      { id: 'a', uid: 'a', title: 'Feriado hoy', start: '2026-06-01', allDay: true, recurring: false },
      { id: 'b', uid: 'b', title: 'Feriado otro día', start: '2026-06-02', allDay: true, recurring: false },
    ]
    const t = buildDayTimeline(events, NOON_LIMA)
    expect(t.allDay.map((e) => e.title)).toEqual(['Feriado hoy'])
    expect(t.blocks).toHaveLength(0)
  })

  it('excluye eventos con hora de otros días', () => {
    const events = [ev('2026-06-02T16:00:00.000Z', '2026-06-02T17:00:00.000Z', 'Mañana')]
    const t = buildDayTimeline(events, NOON_LIMA)
    expect(t.blocks).toHaveLength(0)
  })

  it('detección de sobrecarga: muchos bloques → overloaded', () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      ev(`2026-06-01T${String(13 + i).padStart(2, '0')}:00:00.000Z`, `2026-06-01T${String(13 + i).padStart(2, '0')}:45:00.000Z`, `B${i}`),
    )
    const t = buildDayTimeline(events, NOON_LIMA)
    expect(t.overload.level).toBe('overloaded')
    expect(t.overload.blockCount).toBe(6)
  })

  it('día tranquilo → ok', () => {
    const t = buildDayTimeline([ev('2026-06-01T19:00:00.000Z', '2026-06-01T20:00:00.000Z', 'Una cosa')], NOON_LIMA)
    expect(t.overload.level).toBe('ok')
  })

  it('día sin eventos → vacío, sin actual ni próximo, ok', () => {
    const t = buildDayTimeline([], NOON_LIMA)
    expect(t.blocks).toHaveLength(0)
    expect(t.current).toBeNull()
    expect(t.next).toBeNull()
    expect(t.msToNextTransition).toBeNull()
    expect(t.overload.level).toBe('ok')
  })
})

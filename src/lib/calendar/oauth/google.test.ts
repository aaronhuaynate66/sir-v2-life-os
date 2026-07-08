// SIR V2 — Tests del payload de creación de eventos de Google (lógica pura).

import { describe, it, expect } from 'vitest'
import { buildGoogleEventPayload } from './google'

describe('buildGoogleEventPayload', () => {
  it('día completo (fecha sin hora) → start.date + end.date EXCLUSIVO (+1 día)', () => {
    const p = buildGoogleEventPayload({ title: 'Viaje', start: '2026-07-20' })
    expect(p.start).toEqual({ date: '2026-07-20' })
    expect(p.end).toEqual({ date: '2026-07-21' }) // end exclusivo
    expect(p.summary).toBe('Viaje')
  })

  it('día completo multi-día → end = díaFin + 1 (exclusivo)', () => {
    const p = buildGoogleEventPayload({ title: 'Finde', start: '2026-07-18', end: '2026-07-20', allDay: true })
    expect(p.start.date).toBe('2026-07-18')
    expect(p.end.date).toBe('2026-07-21') // 20 + 1
  })

  it('cronometrado → start.dateTime + timeZone Lima + fin default +1h', () => {
    const p = buildGoogleEventPayload({ title: 'Reunión', start: '2026-07-20T15:00:00-05:00' })
    expect(p.start.dateTime).toBe('2026-07-20T15:00:00-05:00')
    expect(p.start.timeZone).toBe('America/Lima')
    expect(p.end.dateTime).toBeTruthy()
    // +1h → 16:00 Lima = 21:00Z
    expect(Date.parse(p.end.dateTime!)).toBe(Date.parse('2026-07-20T16:00:00-05:00'))
  })

  it('respeta timeZone y end explícitos', () => {
    const p = buildGoogleEventPayload({ title: 'X', start: '2026-07-20T09:00:00Z', end: '2026-07-20T10:30:00Z', timeZone: 'UTC' })
    expect(p.start.timeZone).toBe('UTC')
    expect(p.end.dateTime).toBe('2026-07-20T10:30:00Z')
  })

  it('trimea título/descr/ubicación y omite vacíos', () => {
    const p = buildGoogleEventPayload({ title: '  Café  ', start: '2026-07-20', description: '  ', location: ' Barranco ' })
    expect(p.summary).toBe('Café')
    expect(p.description).toBeUndefined()
    expect(p.location).toBe('Barranco')
  })

  it('sin título → lanza', () => {
    expect(() => buildGoogleEventPayload({ title: '  ', start: '2026-07-20' })).toThrow()
  })
})

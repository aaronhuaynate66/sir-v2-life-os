// SIR V2 — Tests del payload de creación + borrado de eventos de Google.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGoogleEventPayload, deleteGoogleEvent, updateGoogleEvent } from './google'

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

describe('deleteGoogleEvent', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = (status: number) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 204 ? null : 'x', { status })))

  it('204 → resuelve (borrado)', async () => {
    stub(204)
    await expect(deleteGoogleEvent('tok', 'ev1')).resolves.toBeUndefined()
  })
  it('404/410 → resuelve (ya no existe, idempotente)', async () => {
    stub(404)
    await expect(deleteGoogleEvent('tok', 'ev1')).resolves.toBeUndefined()
    stub(410)
    await expect(deleteGoogleEvent('tok', 'ev1')).resolves.toBeUndefined()
  })
  it('500 → lanza', async () => {
    stub(500)
    await expect(deleteGoogleEvent('tok', 'ev1')).rejects.toThrow()
  })
  it('id vacío → no-op (no llama a fetch)', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await deleteGoogleEvent('tok', '  ')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('updateGoogleEvent', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('PATCH ok → devuelve id; usa el método PATCH', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => { void init; return new Response(JSON.stringify({ id: 'ev1', htmlLink: 'x' }), { status: 200 }) })
    vi.stubGlobal('fetch', f)
    const r = await updateGoogleEvent('tok', 'ev1', { title: 'Nuevo', start: '2026-07-20' })
    expect(r.id).toBe('ev1')
    expect(f.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
  })
  it('error → lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(updateGoogleEvent('tok', 'ev1', { title: 'X', start: '2026-07-20' })).rejects.toThrow()
  })
  it('sin id → lanza', async () => {
    await expect(updateGoogleEvent('tok', '  ', { title: 'X', start: '2026-07-20' })).rejects.toThrow()
  })
})

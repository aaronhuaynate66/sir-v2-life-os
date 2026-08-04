// SIR V2 — Tests del payload de creación + borrado de eventos de Google.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildGoogleEventPatchPayload, buildGoogleEventPayload, deleteGoogleEvent, updateGoogleEvent } from './google'

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

  // El bug del 3-ago: la cita del maxilofacial de las 16:00 seguía saliendo como
  // "todo el día" porque el PATCH no anulaba `start.date`. Google hace patch
  // semántico y el objeto quedaba con `date` y `dateTime` a la vez.
  it('convertir a cronometrado manda date:null para que Google borre la fecha', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => { void init; return new Response(JSON.stringify({ id: 'ev1' }), { status: 200 }) })
    vi.stubGlobal('fetch', f)
    await updateGoogleEvent('tok', 'ev1', { title: 'Cirugía', start: '2026-08-03T16:00:00-05:00', end: '2026-08-03T17:00:00-05:00' })
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body))
    expect(body.start).toEqual({ dateTime: '2026-08-03T16:00:00-05:00', timeZone: 'America/Lima', date: null })
    expect(body.end.date).toBeNull()
    // `date: null` tiene que viajar de verdad: si JSON.stringify lo omitiera, Google
    // dejaría el evento de día completo y el bug volvería en silencio.
    expect(String(f.mock.calls[0]?.[1]?.body)).toContain('"date":null')
  })

  it('volver a todo el día anula dateTime y timeZone', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => { void init; return new Response(JSON.stringify({ id: 'ev1' }), { status: 200 }) })
    vi.stubGlobal('fetch', f)
    await updateGoogleEvent('tok', 'ev1', { title: 'Límite', start: '2026-08-10' })
    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body))
    expect(body.start).toEqual({ date: '2026-08-10', dateTime: null, timeZone: null })
    expect(body.end).toEqual({ date: '2026-08-11', dateTime: null, timeZone: null })
  })
})

describe('buildGoogleEventPatchPayload', () => {
  it('no toca el payload de CREAR (ahí no hay nada que borrar)', () => {
    const crear = buildGoogleEventPayload({ title: 'X', start: '2026-08-03T16:00:00-05:00' })
    expect(crear.start).toEqual({ dateTime: '2026-08-03T16:00:00-05:00', timeZone: 'America/Lima' })
    expect('date' in crear.start).toBe(false)
  })

  it('el de PATCH agrega el null excluyente', () => {
    const patch = buildGoogleEventPatchPayload({ title: 'X', start: '2026-08-03T16:00:00-05:00' })
    expect(patch.start.date).toBeNull()
    expect(patch.start.dateTime).toBe('2026-08-03T16:00:00-05:00')
  })

  it('conserva título, descripción y recurrencia', () => {
    const p = buildGoogleEventPatchPayload({ title: 'Aniversario', start: '2026-08-13', description: 'nota', recurring: true })
    expect(p.summary).toBe('Aniversario')
    expect(p.description).toBe('nota')
    expect(p.recurrence).toEqual(['RRULE:FREQ=YEARLY'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// "¿Y POR QUÉ SALE ESTO ASÍ?" — 4-ago-2026
//
// Aaron mandó una captura de su Google Calendar del evento "LÍMITE: certificado
// médico deportivo": Google lo mostraba como **Ocupado**. Era el default (al no
// mandar el campo, Google asume `opaque`), y está mal para lo que SIR carga como
// todo-el-día: un LÍMITE o un aniversario es un MARCADOR, no un bloque de tiempo.
// ═══════════════════════════════════════════════════════════════════════════

describe('buildGoogleEventPayload · transparency', () => {
  it('todo-el-día NO ocupa el día: es un marcador', () => {
    const p = buildGoogleEventPayload({
      title: 'LÍMITE: certificado médico deportivo para el Mundial',
      start: '2026-08-10', allDay: true,
    })
    expect(p.transparency).toBe('transparent')
    expect(p.start.date).toBe('2026-08-10')
  })

  it('una fecha sin hora también se trata como marcador', () => {
    expect(buildGoogleEventPayload({ title: 'Aniversario con Diana', start: '2026-08-13' }).transparency)
      .toBe('transparent')
  })

  it('un evento CRONOMETRADO sí ocupa: la cita de las 16:40 no está libre', () => {
    const p = buildGoogleEventPayload({
      title: 'Cita con el Dr. Paz (neurología)',
      start: '2026-08-12T21:40:00.000Z',
      end: '2026-08-12T22:40:00.000Z',
    })
    expect(p.transparency).toBe('opaque')
    expect(p.start.dateTime).toBeTruthy()
  })

  it('el recordatorio NO lo manda SIR: se deja el default del calendario de Aaron', () => {
    // El "un día antes a las 23:30" de su captura es la configuración de SU Google,
    // no algo que este payload defina. Se fija por test para que nadie lo agregue
    // sin decidirlo: mandar `reminders` pisaría sus preferencias.
    const p = buildGoogleEventPayload({ title: 'X', start: '2026-08-10', allDay: true }) as unknown as Record<string, unknown>
    expect(p.reminders).toBeUndefined()
  })
})

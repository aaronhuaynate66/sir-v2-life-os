import { describe, it, expect } from 'vitest'
import { extractCycleSignals, parseSpanishDate } from './cycleSignals'
import type { ExportMessage } from './types'

function msg(author: string, content: string, iso: string | null): ExportMessage {
  return { iso, time: iso ? iso.slice(11, 16) : '', author, content, isMedia: false }
}

// Diana = contacta ('other'); Aaron = 'user'.
const ROLES = new Map<string, 'user' | 'other'>([['Diana', 'other'], ['Aaron', 'user']])

describe('extractCycleSignals', () => {
  it('detecta sangrado en primera persona de la contacta', () => {
    const out = extractCycleSignals([msg('Diana', 'ay me vino la regla hoy 😩', '2026-05-08T14:30:00-05:00')], ROLES)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ date: '2026-05-08', phase: 'bleeding' })
  })

  it('detecta variantes de sangrado (estoy con la regla / indispuesta / en mis días)', () => {
    const out = extractCycleSignals([
      msg('Diana', 'estoy con la regla', '2026-05-01T10:00:00-05:00'),
      msg('Diana', 'ando indispuesta', '2026-06-01T10:00:00-05:00'),
      msg('Diana', 'estoy en mis dias', '2026-07-01T10:00:00-05:00'),
    ], ROLES)
    expect(out.map((s) => s.phase)).toEqual(['bleeding', 'bleeding', 'bleeding'])
  })

  it('detecta SPM / premenstrual como pms', () => {
    const out = extractCycleSignals([
      msg('Diana', 'ando con SPM insoportable', '2026-05-20T09:00:00-05:00'),
      msg('Diana', 'estoy premenstrual', '2026-06-20T09:00:00-05:00'),
    ], ROLES)
    expect(out.map((s) => s.phase)).toEqual(['pms', 'pms'])
  })

  it('NUNCA infiere de los mensajes de Aaron (rol user)', () => {
    const out = extractCycleSignals([
      msg('Aaron', 'me vino la regla jaja', '2026-05-08T14:30:00-05:00'),
      msg('Aaron', '¿te vino la regla?', '2026-05-08T14:31:00-05:00'),
    ], ROLES)
    expect(out).toHaveLength(0)
  })

  it('descarta negaciones (atraso, no sangrado)', () => {
    const out = extractCycleSignals([
      msg('Diana', 'todavia no me vino la regla, estoy nerviosa', '2026-05-08T14:30:00-05:00'),
      msg('Diana', 'ya no ando con la regla', '2026-05-09T10:00:00-05:00'),
    ], ROLES)
    expect(out).toHaveLength(0)
  })

  it('dedup por día: bleeding gana sobre pms el mismo día', () => {
    const out = extractCycleSignals([
      msg('Diana', 'estoy premenstrual', '2026-05-08T08:00:00-05:00'),
      msg('Diana', 'ya me vino la regla', '2026-05-08T20:00:00-05:00'),
    ], ROLES)
    expect(out).toHaveLength(1)
    expect(out[0].phase).toBe('bleeding')
  })

  it('sinceISO filtra los anteriores (no re-infiere al re-subir)', () => {
    const out = extractCycleSignals([
      msg('Diana', 'me vino la regla', '2026-05-08T14:30:00-05:00'),
      msg('Diana', 'me vino la regla', '2026-06-05T14:30:00-05:00'),
    ], ROLES, '2026-05-31T00:00:00-05:00')
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-06-05')
  })

  it('ignora mensajes sin fecha resoluble', () => {
    const out = extractCycleSignals([msg('Diana', 'me vino la regla', null)], ROLES)
    expect(out).toHaveLength(0)
  })

  it('no matchea charla no relacionada', () => {
    const out = extractCycleSignals([
      msg('Diana', 'vamos a la reunion el jueves?', '2026-05-08T14:30:00-05:00'),
      msg('Diana', 'la regla del juego es simple', '2026-05-09T14:30:00-05:00'),
    ], ROLES)
    // "la regla del juego" no matchea (no es primera persona de ciclo).
    expect(out).toHaveLength(0)
  })

  // ─── Modo B: fecha reportada (caso real Nicolle) ───────────────────────
  it('CASO NICOLLE: Aaron pregunta → ella responde "me vino el 25 de junio" (evento = fecha mencionada, no la del mensaje)', () => {
    const out = extractCycleSignals([
      msg('Aaron', 'solo dime la ultima vez que te vino la regla', '2026-07-08T09:35:00-05:00'),
      msg('Aaron', 'la fecha', '2026-07-08T09:35:30-05:00'),
      msg('Nicolle', 'Me vino el 25 de junio', '2026-07-08T10:00:00-05:00'),
    ], new Map([['Aaron', 'user'], ['Nicolle', 'other']]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ date: '2026-06-25', phase: 'bleeding' })
  })

  it('respuesta con fecha SOLO tras pregunta de Aaron por el período (fecha suelta no dispara)', () => {
    const roles = new Map<string, 'user' | 'other'>([['Aaron', 'user'], ['Nicolle', 'other']])
    const suelta = extractCycleSignals([msg('Nicolle', 'nos vemos el 25 de junio', '2026-07-08T10:00:00-05:00')], roles)
    expect(suelta).toHaveLength(0)
    const conPregunta = extractCycleSignals([
      msg('Aaron', 'cuando te vino la regla?', '2026-07-08T09:00:00-05:00'),
      msg('Nicolle', 'el 25 de junio', '2026-07-08T10:00:00-05:00'),
    ], roles)
    expect(conPregunta).toHaveLength(1)
    expect(conPregunta[0].date).toBe('2026-06-25')
  })

  it('"me vino el 25/6" (formato numérico día/mes) + relativos ayer/hoy', () => {
    const out = extractCycleSignals([
      msg('Diana', 'me vino el 25/6', '2026-07-08T10:00:00-05:00'),
      msg('Diana', 'me vino ayer', '2026-08-01T10:00:00-05:00'),
    ], ROLES)
    expect(out.map((s) => s.date)).toEqual(['2026-06-25', '2026-07-31'])
  })

  it('descarta negación reportada ("todavía no me vino, capaz el 25")', () => {
    const out = extractCycleSignals([msg('Diana', 'todavia no me vino, capaz el 25 de junio', '2026-07-08T10:00:00-05:00')], ROLES)
    expect(out).toHaveLength(0)
  })
})

describe('parseSpanishDate', () => {
  it('resuelve el año más reciente <= fecha de referencia', () => {
    expect(parseSpanishDate('me vino el 25 de junio', '2026-07-08')).toBe('2026-06-25')
    // diciembre reportado en enero → año anterior.
    expect(parseSpanishDate('fue el 20 de diciembre', '2026-01-05')).toBe('2025-12-20')
  })
  it('sin año, resuelve diciembre reportado a mitad de año como el diciembre PASADO', () => {
    expect(parseSpanishDate('el 25 de diciembre', '2026-07-08')).toBe('2025-12-25')
  })
  it('descarta futuros (año explícito) y fechas inexistentes', () => {
    expect(parseSpanishDate('el 10 de agosto de 2027', '2026-07-08')).toBeNull() // futuro
    expect(parseSpanishDate('el 31 de febrero', '2026-07-08')).toBeNull() // inexistente
  })
  it('relativos', () => {
    expect(parseSpanishDate('me vino hoy', '2026-07-08')).toBe('2026-07-08')
    expect(parseSpanishDate('fue anteayer', '2026-07-08')).toBe('2026-07-06')
  })
})

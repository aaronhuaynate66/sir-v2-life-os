// SIR V2 — Tests de la sesión OAuth de Google para escribir.
//
// Nació del 3-ago-2026. Aaron: *"¿cómo es que en mi calendario no me sale la cita del
// cirujano maxilofacial hoy a las 4?"*. Entre las causas había una credencial muerta:
// el refresh fallaba con `invalid_client` y este módulo entregaba el access_token YA
// EXPIRADO, así que el sincronizador salía a empujar 17 eventos y Google los rechazaba
// uno por uno con 401 — sin que nadie viera "no hay conexión usable".
//
// NOTA SOBRE EL MOCK: `./google` se dobla con una función normal y un contador a mano,
// no con `vi.fn()`. Con un spy, un test que use `mockResolvedValue` hace que el
// siguiente —el que necesita que el refresh FALLE— se reporte como fallido con el error
// del mock, aunque el módulo lo maneje bien (comprobado: devuelve null). Es un artefacto
// del registro de resultados del spy, no del código.

import { beforeEach, describe, expect, it, vi } from 'vitest'

let modo: 'ok' | 'falla' = 'ok'
let llamadas = 0

vi.mock('./google', () => ({
  refreshAccessToken: async () => {
    llamadas++
    if (modo === 'falla') throw new Error('refresh falló (401): invalid_client')
    return { access_token: 'nuevo', expires_in: 3600 }
  },
}))
vi.mock('./crypto', () => ({
  // Acá el "cifrado" es identidad: lo que se prueba es la lógica de vigencia.
  decryptToken: (v: string | null) => v,
  encryptToken: (v: string) => v,
}))

import { ensureFreshGoogleToken } from './session'

const AHORA = Date.parse('2026-08-03T14:50:00Z')

/** Supabase de mentira: solo lo que este módulo usa (select→order→limit, update). */
function fakeSupabase(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = []
  const api: Record<string, unknown> = {}
  Object.assign(api, {
    from: () => api,
    select: () => api,
    eq: () => api,
    order: () => api,
    limit: async () => ({ data: row ? [row] : [], error: null }),
    update: (v: Record<string, unknown>) => {
      updates.push(v)
      return { eq: () => ({ eq: async () => ({ error: null }) }) }
    },
  })
  return { supabase: api as never, updates }
}

/** Fila de conexión con el access_token VENCIDO hace una hora. */
const fila = (over: Record<string, unknown> = {}) => ({
  id: 'conn1',
  account_email: 'aaronhuaynate@gmail.com',
  access_token: 'viejo',
  refresh_token: 'refresh',
  token_expires_at: new Date(AHORA - 3_600_000).toISOString(),
  ...over,
})

describe('ensureFreshGoogleToken', () => {
  beforeEach(() => {
    modo = 'ok'
    llamadas = 0
  })

  it('token vigente → lo usa sin refrescar', async () => {
    const { supabase } = fakeSupabase(fila({ token_expires_at: new Date(AHORA + 600_000).toISOString() }))
    const r = await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)
    expect(r?.token).toBe('viejo')
    expect(llamadas).toBe(0)
  })

  it('vencido + refresh OK → devuelve el nuevo y lo persiste cifrado', async () => {
    const { supabase, updates } = fakeSupabase(fila())
    const r = await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)
    expect(r?.token).toBe('nuevo')
    expect(updates[0]?.access_token).toBe('nuevo')
    expect(llamadas).toBe(1)
  })

  // ═══ EL BUG DEL 3-AGO ═══
  // Antes devolvía 'viejo' (vencido) y el sync empujaba 17 eventos contra un 401.
  it('vencido + refresh falla → null, NO el token expirado', async () => {
    modo = 'falla'
    const { supabase } = fakeSupabase(fila())
    expect(await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)).toBeNull()
    expect(llamadas).toBe(1)
  })

  // Los 30 s de gracia: un token que muere dentro de ese margen se trata como vencido,
  // para no salir a escribir con algo que expira a mitad de la corrida.
  it('vence dentro de los 30 s de gracia → refresca', async () => {
    const { supabase } = fakeSupabase(fila({ token_expires_at: new Date(AHORA + 10_000).toISOString() }))
    const r = await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)
    expect(r?.token).toBe('nuevo')
    expect(llamadas).toBe(1)
  })

  it('sin conexión de Google → null', async () => {
    const { supabase } = fakeSupabase(null)
    expect(await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)).toBeNull()
  })

  it('sin refresh_token y el access vencido → null (no hay nada que hacer)', async () => {
    const { supabase } = fakeSupabase(fila({ refresh_token: null }))
    expect(await ensureFreshGoogleToken(supabase, 'u1', null, AHORA)).toBeNull()
    expect(llamadas).toBe(0)
  })
})

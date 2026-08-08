import { describe, it, expect } from 'vitest'
import { ultimaDataPorCanal, masReciente, type ClienteMinimo } from './ultimaData'

// ═══ EL CANAL NO SE LLAMA IGUAL QUE SU PLATAFORMA ═══════════════════════════
//
// 7-ago-2026. Buscando la frescura de Outlook con `platform='outlook'` daba cero, y
// con esa foto le dije a Aaron que ese lector *"nunca funcionó, 0 enviados de por
// vida"*. Había capturado seis correos esa misma tarde — entre ellos uno de trabajo
// de Josehp Cabanillas y William Gonzales.
//
// Outlook no pasa por el reader: sale por `/api/email/ingest` → `ingestEmailMessages`,
// que arma el batch con `platform: 'email'` porque el mismo camino sirve a Graph y
// al scrape de OWA. El nombre del canal y el de la plataforma NO coinciden, y no hay
// forma de deducirlo leyendo el código del canal.
//
// Es la regla de honestidad de cobertura mordiéndome a mí: una consulta que devuelve
// cero prueba que la consulta no encontró nada, no que no exista.

/** Cliente falso que ANOTA cada consulta y devuelve lo que se le diga por clave. */
function fakeDb(respuestas: Record<string, Array<Record<string, string>>>) {
  const consultas: Array<{ tabla: string; filtros: Record<string, string> }> = []
  const make = (tabla: string) => {
    const filtros: Record<string, string> = {}
    consultas.push({ tabla, filtros })
    const clave = () => `${tabla}|${Object.entries(filtros).filter(([k]) => k !== 'user_id').map(([k, v]) => `${k}=${v}`).join('&')}`
    const nodo: Record<string, unknown> = {}
    const eq = (col: string, val: string) => { filtros[col] = val; return nodo }
    Object.assign(nodo, {
      eq,
      not: () => nodo,
      order: () => nodo,
      limit: async () => ({ data: respuestas[clave()] ?? [] }),
    })
    return nodo
  }
  const db = {
    from: (tabla: string) => ({ select: () => make(tabla) }),
  } as unknown as ClienteMinimo
  return { db, consultas }
}

const U = 'user-1'

describe('ultimaDataPorCanal — a qué tabla y con qué nombre le pregunta a cada canal', () => {
  it('a Outlook lo busca como platform=email, NO como outlook', async () => {
    const { db, consultas } = fakeDb({
      'observations|data->>platform=email': [{ observed_at: '2026-08-07T23:23:00Z' }],
    })
    const out = await ultimaDataPorCanal(db, U)
    expect(out.outlook).toBe('2026-08-07T23:23:00Z')

    const plataformas = consultas.filter((c) => c.tabla === 'observations').map((c) => c.filtros['data->>platform'])
    expect(plataformas).toContain('email')
    expect(plataformas).not.toContain('outlook') // el bug, explícito
  })

  it('a LinkedIn lo busca en unmatched_social_activity, no en observations', async () => {
    const { db, consultas } = fakeDb({
      'unmatched_social_activity|platform=linkedin': [{ observed_at: '2026-08-07T20:00:00Z' }],
    })
    const out = await ultimaDataPorCanal(db, U)
    expect(out.linkedin).toBe('2026-08-07T20:00:00Z')

    const enObs = consultas.filter((c) => c.tabla === 'observations').map((c) => c.filtros['data->>platform'])
    expect(enObs).not.toContain('linkedin')
  })

  it('WhatsApp y Teams sí se llaman igual, y se leen por separado', async () => {
    const { db } = fakeDb({
      'observations|data->>platform=whatsapp': [{ observed_at: '2026-08-07T22:42:00Z' }],
      'observations|data->>platform=teams': [{ observed_at: '2026-07-30T19:06:00Z' }],
    })
    const out = await ultimaDataPorCanal(db, U)
    expect(out.whatsapp).toBe('2026-08-07T22:42:00Z')
    expect(out.teams).toBe('2026-07-30T19:06:00Z')
  })

  it('un canal que nunca trajo nada NO se devuelve: no está caído, no está en uso', async () => {
    const { db } = fakeDb({}) // todo vacío
    const out = await ultimaDataPorCanal(db, U)
    expect(out).not.toHaveProperty('teams')
    expect(out).not.toHaveProperty('outlook')
    expect(out).not.toHaveProperty('linkedin')
    // whatsapp e instagram siempre vienen (con null): son los dos que se vigilan
    // desde antes y el brief los espera presentes.
    expect(out.whatsapp).toBeNull()
    expect(out.instagram).toBeNull()
  })

  it('Instagram junta sus TRES tablas y se queda con la más reciente', async () => {
    const { db } = fakeDb({
      'unmatched_social_activity|platform=instagram': [{ observed_at: '2026-08-01T10:00:00Z' }],
      'social_profiles|platform=instagram': [{ captured_at: '2026-08-07T19:24:00Z' }],
      'social_page_followers|source=instagram': [{ observed_at: '2026-07-30T21:54:00Z' }],
    })
    const out = await ultimaDataPorCanal(db, U)
    expect(out.instagram).toBe('2026-08-07T19:24:00Z')
  })
})

describe('masReciente', () => {
  it('se queda con la más nueva e ignora nulls y basura', () => {
    expect(masReciente(null, '2026-08-01T00:00:00Z', undefined, '2026-08-07T00:00:00Z')).toBe('2026-08-07T00:00:00Z')
    expect(masReciente(null, undefined)).toBeNull()
    expect(masReciente('no-es-fecha', '2026-08-01T00:00:00Z')).toBe('2026-08-01T00:00:00Z')
  })
})

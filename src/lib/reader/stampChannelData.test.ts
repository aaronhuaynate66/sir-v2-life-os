// SIR V2 — Tests del sello de frescura por canal.
//
// Lo que se pinnea acá es el CONTRATO, no la implementación: este campo es lo que
// mira el diagnóstico de silencio del brief, y ya se rompió dos veces por los dos
// extremos — nadie lo escribía (Instagram con data real y `last_data_at` en null),
// y antes de eso el detector dependía de una señal que se borraba sola.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stampChannelData } from './stampChannelData'

/** Mock que captura qué método se llamó y con qué filtros. */
function mockClient(opts: { throwOnUpdate?: boolean } = {}) {
  const captured: {
    from?: string
    updated?: Record<string, unknown>
    upserted?: unknown
    inserted?: unknown
    eqs: Array<[string, unknown]>
  } = { eqs: [] }
  const chain: Record<string, unknown> = {}
  chain.from = (t: string) => { captured.from = t; return chain }
  chain.update = (patch: Record<string, unknown>) => {
    if (opts.throwOnUpdate) throw new Error('boom')
    captured.updated = patch
    return chain
  }
  chain.upsert = (rows: unknown) => { captured.upserted = rows; return Promise.resolve({ error: null }) }
  chain.insert = (rows: unknown) => { captured.inserted = rows; return Promise.resolve({ error: null }) }
  chain.eq = (col: string, val: unknown) => {
    captured.eqs.push([col, val])
    // La cadena se resuelve en el último .eq() — como la usa la función real.
    return Object.assign(Promise.resolve({ error: null }), chain)
  }
  return { client: chain as unknown as SupabaseClient, captured }
}

describe('stampChannelData', () => {
  it('sella el canal en reader_heartbeats con last_data_at y updated_at', async () => {
    const { client, captured } = mockClient()
    await stampChannelData(client, 'u1', 'instagram')
    expect(captured.from).toBe('reader_heartbeats')
    expect(typeof captured.updated?.last_data_at).toBe('string')
    expect(typeof captured.updated?.updated_at).toBe('string')
    expect(Number.isFinite(Date.parse(String(captured.updated?.last_data_at)))).toBe(true)
  })

  it('filtra por usuario Y canal — nunca sella el canal de otro', async () => {
    const { client, captured } = mockClient()
    await stampChannelData(client, 'u1', 'linkedin')
    expect(captured.eqs).toEqual([['user_id', 'u1'], ['channel', 'linkedin']])
  })

  it('es UPDATE, jamás upsert/insert: una fila inventada mentiría diciendo que el canal reportó', async () => {
    // Ésta es la razón de ser del test. Si algún día alguien "arregla" el sello
    // cambiándolo por upsert, el diagnóstico pasaría a ver un canal que nunca
    // latió como si hubiera reportado, y el brief afirmaría de más.
    const { client, captured } = mockClient()
    await stampChannelData(client, 'u1', 'whatsapp')
    expect(captured.updated).toBeTruthy()
    expect(captured.upserted).toBeUndefined()
    expect(captured.inserted).toBeUndefined()
  })

  it('no toca nada si el canal viene vacío', async () => {
    const { client, captured } = mockClient()
    await stampChannelData(client, 'u1', '')
    expect(captured.from).toBeUndefined()
  })

  it('fail-soft: si la escritura lanza, no propaga — perder el sello no puede tumbar la ingesta', async () => {
    const { client } = mockClient({ throwOnUpdate: true })
    await expect(stampChannelData(client, 'u1', 'instagram')).resolves.toBeUndefined()
  })
})

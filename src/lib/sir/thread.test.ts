// SIR V2 — Tests del hilo unificado (thread.ts): lectura detallada con
// metadatos (channel/at) y retorno de timestamps al persistir.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSirThreadDetailed, appendSirThread } from './thread'

/** Mock mínimo del cliente: la query de lectura resuelve en `.limit()`; el
 *  insert resuelve con `{ error }`. Captura lo insertado para inspección. */
function mockClient(opts: { rows?: unknown[]; insertError?: boolean; throwOnInsert?: boolean }) {
  const captured: { inserted?: unknown[] } = {}
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => chain
  chain.limit = () => Promise.resolve({ data: opts.rows ?? [] })
  chain.insert = (rows: unknown[]) => {
    if (opts.throwOnInsert) throw new Error('boom')
    captured.inserted = rows
    return Promise.resolve({ error: opts.insertError ? { message: 'fail' } : null })
  }
  return { client: chain as unknown as SupabaseClient, captured }
}

describe('getSirThreadDetailed', () => {
  it('devuelve turnos en orden cronológico con channel + at', async () => {
    // La DB devuelve desc (más nuevo primero); la función invierte a cronológico.
    const { client } = mockClient({
      rows: [
        { role: 'sir', content: 'respuesta', channel: 'telegram', created_at: '2026-07-21T10:01:00Z' },
        { role: 'user', content: 'pregunta', channel: 'telegram', created_at: '2026-07-21T10:00:00Z' },
      ],
    })
    const turns = await getSirThreadDetailed(client, 'u1', 40)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toEqual({ role: 'user', text: 'pregunta', channel: 'telegram', at: '2026-07-21T10:00:00Z' })
    expect(turns[1]).toEqual({ role: 'sir', text: 'respuesta', channel: 'telegram', at: '2026-07-21T10:01:00Z' })
  })

  it('normaliza channel desconocido a "web" y filtra filas inválidas', async () => {
    const { client } = mockClient({
      rows: [
        { role: 'user', content: 'hola', channel: 'otro', created_at: '2026-07-21T09:00:00Z' },
        { role: 'bot', content: 'x', channel: 'web', created_at: '2026-07-21T09:01:00Z' }, // role inválido
        { role: 'sir', content: '', channel: 'web', created_at: '2026-07-21T09:02:00Z' }, // vacío
      ],
    })
    const turns = await getSirThreadDetailed(client, 'u1')
    expect(turns).toHaveLength(1)
    expect(turns[0].channel).toBe('web')
  })

  it('fail-open → [] si la query lanza', async () => {
    const bad = { from() { throw new Error('no table') } } as unknown as SupabaseClient
    expect(await getSirThreadDetailed(bad, 'u1')).toEqual([])
  })
})

describe('appendSirThread', () => {
  it('persiste user + sir y devuelve los timestamps (sir 1ms después)', async () => {
    const { client, captured } = mockClient({})
    const res = await appendSirThread(client, 'u1', 'web', 'pregunta', 'respuesta')
    expect(res).not.toBeNull()
    expect(new Date(res!.sirAt).getTime()).toBe(new Date(res!.userAt).getTime() + 1)
    expect(captured.inserted).toHaveLength(2)
    expect((captured.inserted as Array<{ channel: string }>).every((r) => r.channel === 'web')).toBe(true)
  })

  it('null si falta texto de usuario o de SIR', async () => {
    const { client } = mockClient({})
    expect(await appendSirThread(client, 'u1', 'web', '   ', 'respuesta')).toBeNull()
    expect(await appendSirThread(client, 'u1', 'web', 'pregunta', '')).toBeNull()
  })

  it('fail-open → null si el insert lanza', async () => {
    const { client } = mockClient({ throwOnInsert: true })
    expect(await appendSirThread(client, 'u1', 'telegram', 'p', 'r')).toBeNull()
  })
})

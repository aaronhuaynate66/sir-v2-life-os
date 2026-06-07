// SIR V2 — Garantía: las memorias PRIVADAS no entran a la lectura que alimenta
// la IA ni la vista general.
//
// getMemoriesForPerson es la ÚNICA lectura server-side de memorias derivadas que
// usan TODOS los consumidores de IA (person-briefing, "Antes de contactar"/
// contactBrief, lista de la ficha). Si esa lectura filtra is_private=false, una
// memoria marcada privada queda fuera de todo prompt por construcción. Estos
// tests fallan si alguien quita ese filtro o invierte la semántica.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getMemoriesForPerson, getPrivateMemoriesForPerson } from './fetch'

/** Mock mínimo del query-builder de supabase-js: encadenable y thenable.
 *  Registra cada .eq(col, val) para poder aseverar los filtros aplicados.
 *  Resuelve siempre OK (sin error) → no se dispara el fallback pre-migración. */
function makeSupabaseMock(rows: Record<string, unknown>[]) {
  const eqCalls: Array<[string, unknown]> = []
  const query: Record<string, unknown> = {}
  const chain = () => query
  query.select = chain
  query.order = chain
  query.limit = chain
  query.in = chain
  query.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val])
    return query
  }
  // Thenable: `await query` resuelve { data, error }.
  query.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    resolve({ data: rows, error: null })

  const supabase = { from: () => query } as unknown as SupabaseClient
  return { supabase, eqCalls }
}

const ROW = {
  id: 'mem_obs:c1:0',
  user_id: 'u1',
  person_id: 'p1',
  type: 'episodic',
  title: 'T',
  content: 'algo',
  occurred_at: '2026-06-01T00:00:00Z',
  tags: [],
}

describe('getMemoriesForPerson excluye privadas y descartadas', () => {
  it('aplica is_obsolete=false Y is_private=false', async () => {
    const { supabase, eqCalls } = makeSupabaseMock([ROW])
    await getMemoriesForPerson(supabase, 'u1', 'p1')
    expect(eqCalls).toContainEqual(['user_id', 'u1'])
    expect(eqCalls).toContainEqual(['person_id', 'p1'])
    expect(eqCalls).toContainEqual(['is_obsolete', false])
    expect(eqCalls).toContainEqual(['is_private', false])
    // Nunca pediría is_private=true en la lectura general.
    expect(eqCalls).not.toContainEqual(['is_private', true])
  })
})

describe('getPrivateMemoriesForPerson trae SÓLO las privadas', () => {
  it('aplica is_private=true y marca isPrivate en el resultado', async () => {
    const { supabase, eqCalls } = makeSupabaseMock([{ ...ROW, is_private: true }])
    const result = await getPrivateMemoriesForPerson(supabase, 'u1', 'p1')
    expect(eqCalls).toContainEqual(['is_private', true])
    expect(result).toHaveLength(1)
    expect(result[0].isPrivate).toBe(true)
  })
})

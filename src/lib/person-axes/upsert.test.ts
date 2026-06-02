// SIR V2 — Tests del upsert de ejes (merge + respeto de 'manual').
//
// upsert.ts hace read→merge→upsert sobre un row único por persona. Lo crítico:
//   - no pisar el OTRO eje al escribir uno (merge),
//   - respetar source='manual' (no sobrescribir ediciones del usuario),
//   - no escribir texto vacío.
// Mockeamos el cliente Supabase con el chain exacto que usan fetch/upsert.

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { upsertAxisAuto } from './upsert'

interface Recorded {
  upserts: Array<{ row: Record<string, unknown>; opts: unknown }>
}

function makeSupabase(existingRow: Record<string, unknown> | null): {
  supabase: SupabaseClient
  rec: Recorded
} {
  const rec: Recorded = { upserts: [] }
  const builder = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    async maybeSingle() {
      return { data: existingRow, error: null }
    },
    async upsert(row: Record<string, unknown>, opts: unknown) {
      rec.upserts.push({ row, opts })
      return { error: null }
    },
  }
  const api = { from: () => builder }
  return { supabase: api as unknown as SupabaseClient, rec }
}

describe('upsertAxisAuto', () => {
  it('persona nueva: escribe el eje profesional, deja el social en null', async () => {
    const { supabase, rec } = makeSupabase(null)
    const wrote = await upsertAxisAuto(supabase, 'u1', 'p1', 'professional', 'Texto profesional.', 'obs1')
    expect(wrote).toBe(true)
    expect(rec.upserts).toHaveLength(1)
    const row = rec.upserts[0].row
    expect(row.professional_text).toBe('Texto profesional.')
    expect(row.professional_source).toBe('auto')
    expect(row.professional_observation_ids).toEqual(['obs1'])
    expect(row.social_text).toBeNull()
    expect(rec.upserts[0].opts).toEqual({ onConflict: 'user_id,person_id' })
  })

  it('merge: al escribir social, preserva el profesional existente', async () => {
    const { supabase, rec } = makeSupabase({
      person_id: 'p1',
      professional_text: 'Pro previo.',
      professional_source: 'auto',
      professional_observation_ids: ['obsX'],
      professional_generated_at: '2026-06-01T00:00:00Z',
      social_text: null,
      social_source: 'auto',
      social_observation_ids: [],
      social_generated_at: null,
    })
    const wrote = await upsertAxisAuto(supabase, 'u1', 'p1', 'social', 'Texto social.', 'obs2')
    expect(wrote).toBe(true)
    const row = rec.upserts[0].row
    expect(row.social_text).toBe('Texto social.')
    expect(row.professional_text).toBe('Pro previo.') // preservado
    expect(row.professional_observation_ids).toEqual(['obsX'])
  })

  it('respeta manual: no pisa un eje editado por el usuario', async () => {
    const { supabase, rec } = makeSupabase({
      person_id: 'p1',
      professional_text: 'Editado a mano.',
      professional_source: 'manual',
      professional_observation_ids: [],
      professional_generated_at: null,
      social_text: null,
      social_source: 'auto',
      social_observation_ids: [],
      social_generated_at: null,
    })
    const wrote = await upsertAxisAuto(supabase, 'u1', 'p1', 'professional', 'Auto nuevo.', 'obs3')
    expect(wrote).toBe(false)
    expect(rec.upserts).toHaveLength(0)
  })

  it('texto vacío → no escribe', async () => {
    const { supabase, rec } = makeSupabase(null)
    expect(await upsertAxisAuto(supabase, 'u1', 'p1', 'social', '   ', 'obs4')).toBe(false)
    expect(await upsertAxisAuto(supabase, 'u1', 'p1', 'social', null, 'obs4')).toBe(false)
    expect(rec.upserts).toHaveLength(0)
  })
})

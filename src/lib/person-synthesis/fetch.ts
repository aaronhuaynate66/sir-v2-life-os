// SIR V2 — Server-side helper para leer person_synthesis en el detail page.
//
// Mismo patrón que observations/fetch.ts y memories/fetch.ts: RLS + filtro
// user_id explícito (defense-in-depth), conversión snake_case <-> camelCase.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { PersonSynthesis } from './types'

const SYNTHESIS_COLUMNS =
  'id, person_id, synthesis_text, source_observation_count, source_observation_ids, model_used, input_tokens, output_tokens, generated_at, is_current, generated_reason'

export function rowToPersonSynthesis(row: Record<string, unknown>): PersonSynthesis {
  return {
    id: row.id as string,
    personId: row.person_id as string,
    synthesisText: (row.synthesis_text as string) ?? '',
    sourceObservationCount: Number(row.source_observation_count) || 0,
    sourceObservationIds: (row.source_observation_ids as string[]) ?? [],
    modelUsed: (row.model_used as string) ?? '',
    inputTokens: row.input_tokens !== null && row.input_tokens !== undefined ? Number(row.input_tokens) : null,
    outputTokens: row.output_tokens !== null && row.output_tokens !== undefined ? Number(row.output_tokens) : null,
    generatedAt: row.generated_at as string,
    isCurrent: Boolean(row.is_current),
    generatedReason: (row.generated_reason as string | null) ?? null,
  }
}

/**
 * La síntesis vigente (is_current=true) de una persona. null si nunca se
 * generó. Hay índice parcial idx_person_synthesis_current para esta query.
 */
export async function getCurrentSynthesis(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<PersonSynthesis | null> {
  const { data, error } = await supabase
    .from('person_synthesis')
    .select(SYNTHESIS_COLUMNS)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_current', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return rowToPersonSynthesis(data as Record<string, unknown>)
}

// SIR V2 — Server-side helper para leer longitudinal_summaries (Fase 3c).
//
// Mismo patron RLS + snake_case<->camelCase que person-synthesis/fetch.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { LongitudinalSummary, PeriodKind } from './types'

const COLUMNS =
  'id, period_kind, period_start, period_end, summary_text, source_counts, model_used, input_tokens, output_tokens, generated_at'

export function rowToLongitudinalSummary(row: Record<string, unknown>): LongitudinalSummary {
  return {
    id: row.id as string,
    periodKind: (row.period_kind as PeriodKind) ?? 'weekly',
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    summaryText: (row.summary_text as string) ?? '',
    sourceCounts: (row.source_counts as Record<string, number>) ?? {},
    modelUsed: (row.model_used as string) ?? '',
    inputTokens: row.input_tokens !== null && row.input_tokens !== undefined ? Number(row.input_tokens) : null,
    outputTokens: row.output_tokens !== null && row.output_tokens !== undefined ? Number(row.output_tokens) : null,
    generatedAt: row.generated_at as string,
  }
}

/** Resúmenes más recientes del usuario (default 8), por period_end DESC. */
export async function getRecentSummaries(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<LongitudinalSummary[]> {
  const { data, error } = await supabase
    .from('longitudinal_summaries')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('period_end', { ascending: false })
    .order('generated_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(rowToLongitudinalSummary)
}

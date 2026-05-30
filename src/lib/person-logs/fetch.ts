// SIR V2 — Server-side helpers para leer person_logs en la vista detalle.
//
// Sesion 6. Mismo patron que src/lib/observations/fetch.ts +
// src/lib/memories/fetch.ts:
//   - RLS habilitada en DB + .eq('user_id') explicito (defensivo).
//   - Orden por logged_at DESC ("cuando paso").
//   - Conversion snake_case -> camelCase via rowToPersonLog.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { PersonLog, PersonLogKind } from './types'

const COLUMNS = 'id, user_id, person_id, kind, value, note, logged_at, created_at'

export function rowToPersonLog(row: Record<string, unknown>): PersonLog {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    personId: row.person_id as string,
    kind: row.kind as PersonLogKind,
    value: Number(row.value) || 0,
    note: (row.note as string | null) ?? null,
    loggedAt: row.logged_at as string,
    createdAt: row.created_at as string,
  }
}

export interface GetLogsOptions {
  /** Default 50. El detail page raramente quiere mas. */
  limit?: number
  /** Filtrar a un solo kind (ej. solo 'interaction'). */
  kind?: PersonLogKind
}

/**
 * Logs de una persona, ordenados por logged_at DESC. RLS + .eq('user_id')
 * explicito (defensive, mismo patron de seguridad que el resto de las
 * fetch layers de Sesion 3+).
 */
export async function getLogsForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: GetLogsOptions = {},
): Promise<PersonLog[]> {
  let query = supabase
    .from('person_logs')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .order('logged_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.kind) {
    query = query.eq('kind', opts.kind)
  }

  const { data, error } = await query
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(rowToPersonLog)
}

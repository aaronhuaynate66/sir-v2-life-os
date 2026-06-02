// SIR V2 — Server-side helpers para leer memories en la vista detalle.
//
// Sesion 4 (Memorias asociadas, PR #1 backend). Mismo patron que
// src/lib/observations/fetch.ts: RLS + filtro user_id explicito, orden
// por la fecha de ocurrencia, conversion snake_case <-> camelCase.
//
// IMPORTANTE: este modulo NO toca useMemoryStore. La via Supabase-native
// del detail page lee SIEMPRE server-side; el store sigue siendo el path
// local-first del resto de la app (creates manuales, sync engine, etc.).

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Memory, MemoryType } from '@/types'

// NOTA: NO seleccionamos source_event_id — esa columna es de la migration
// 0012 que puede no estar aplicada en prod (bug 31/05). Seleccionarla
// rompería todo el fetch. rowToMemory ya tolera su ausencia (→ undefined).
const MEMORY_COLUMNS =
  'id, user_id, person_id, type, title, content, entities, emotional_charge, importance, decay_rate, tags, related_memories, occurred_at, last_accessed, created_at, source'

/** snake_case (DB) -> camelCase (TS). Compatible con rows pre-Sesion 4
 *  (source/source_event_id pueden venir null). */
export function rowToMemory(row: Record<string, unknown>): Memory {
  const source = row.source as string | null
  return {
    id: row.id as string,
    type: row.type as MemoryType,
    title: (row.title as string) ?? '',
    content: (row.content as string) ?? '',
    entities: (row.entities as string[]) ?? [],
    emotionalCharge: Number(row.emotional_charge) || 0,
    importance: Number(row.importance) || 5,
    timestamp: row.occurred_at as string,
    lastAccessed: (row.last_accessed as string) ?? (row.occurred_at as string),
    decayRate: Number(row.decay_rate) || 0.05,
    tags: (row.tags as string[]) ?? [],
    relatedMemories: (row.related_memories as string[]) ?? [],
    personId: (row.person_id as string | null) ?? undefined,
    source:
      source === 'whatsapp_capture' || source === 'manual' || source === 'inferred'
        ? source
        : undefined,
    sourceEventId: (row.source_event_id as string | null) ?? undefined,
  }
}

export interface GetMemoriesOptions {
  /** Default 100. Sidebar del detail page raramente quiere mas. */
  limit?: number
  /** Filtrar a un solo tipo (ej. solo 'episodic'). */
  type?: MemoryType
}

/**
 * Memorias de una persona, ordenadas por occurred_at DESC.
 *
 * RLS + .eq('user_id') explicito (defensive, mismo patron que
 * observations/fetch.ts).
 */
export async function getMemoriesForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: GetMemoriesOptions = {},
): Promise<Memory[]> {
  // Filtra memorias descartadas (is_obsolete=true). PRE-MIGRATION-SAFE: la
  // columna es de la migration 0045; si todavia no se aplico, el filtro
  // rompe el fetch (error 42703) → reintentamos sin el filtro. Asi el deploy
  // del filtro no necesita esperar a la migration.
  const build = (withObsoleteFilter: boolean) => {
    let q = supabase
      .from('memories')
      .select(MEMORY_COLUMNS)
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('occurred_at', { ascending: false })
      .limit(opts.limit ?? 100)
    if (opts.type) q = q.eq('type', opts.type)
    if (withObsoleteFilter) q = q.eq('is_obsolete', false)
    return q
  }

  let { data, error } = await build(true)
  if (error) {
    // Fallback: columna ausente (o cualquier error del filtro) → sin filtro.
    ;({ data, error } = await build(false))
  }
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(rowToMemory)
}

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
    // is_private sólo se selecciona en getPrivateMemoriesForPerson; acá queda
    // undefined (no se castiga el fetch general sin la columna 0064).
    isPrivate: row.is_private === true ? true : undefined,
  }
}

export interface GetMemoriesOptions {
  /** Default 100. Sidebar del detail page raramente quiere mas. */
  limit?: number
  /** Filtrar a un solo tipo (ej. solo 'episodic'). */
  type?: MemoryType
}

/**
 * Memorias VISIBLES de una persona (NI descartadas NI privadas), ordenadas por
 * occurred_at DESC.
 *
 * Es la ÚNICA lectura que alimenta a la IA y a la vista general (briefing,
 * "Antes de contactar"/contactBrief, lista de la ficha). Filtrar acá garantiza
 * por construcción que una memoria privada (is_private=true, mig 0064) NO viaje
 * a ningún prompt ni aparezca en la vista general — sin tener que recordar
 * filtrarla en cada consumidor.
 *
 * PRE-MIGRATION-SAFE: is_obsolete (0045) e is_private (0064) pueden no estar
 * aplicadas en prod; si un filtro rompe el fetch (42703), reintentamos sin él.
 * Probamos {obsolete + private} → {sólo obsolete} → {sin filtros} para no
 * acoplar el deploy a las migraciones.
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
  const build = (withObsolete: boolean, withPrivate: boolean) => {
    let q = supabase
      .from('memories')
      .select(MEMORY_COLUMNS)
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('occurred_at', { ascending: false })
      .limit(opts.limit ?? 100)
    if (opts.type) q = q.eq('type', opts.type)
    if (withObsolete) q = q.eq('is_obsolete', false)
    if (withPrivate) q = q.eq('is_private', false)
    return q
  }

  let { data, error } = await build(true, true)
  if (error) {
    // is_private ausente → reintentar sólo con is_obsolete.
    ;({ data, error } = await build(true, false))
  }
  if (error) {
    // is_obsolete ausente también → sin filtros opcionales.
    ;({ data, error } = await build(false, false))
  }
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map(rowToMemory)
}

// Lista de columnas para el affordance de privadas: incluye is_private para
// poder marcar isPrivate en el mapeo. Sólo se usa en getPrivateMemoriesForPerson
// (con su propio fallback si la columna 0064 no existe).
const MEMORY_COLUMNS_WITH_PRIVATE = `${MEMORY_COLUMNS}, is_private`

/**
 * Memorias PRIVADAS/excluidas de una persona (is_private=true), ordenadas por
 * occurred_at DESC. Alimenta SÓLO el affordance "privadas" de la ficha — NUNCA
 * a la IA ni a la vista general. Pre-migration-safe: si is_private (0064) no
 * existe, devuelve [] (no hay privadas todavía).
 */
export async function getPrivateMemoriesForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: GetMemoriesOptions = {},
): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select(MEMORY_COLUMNS_WITH_PRIVATE)
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('is_private', true)
    .order('occurred_at', { ascending: false })
    .limit(opts.limit ?? 100)
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map((row) => ({
    ...rowToMemory(row),
    isPrivate: true,
  }))
}

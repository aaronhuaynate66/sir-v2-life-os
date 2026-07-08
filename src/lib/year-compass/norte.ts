// SIR V2 — El norte del año, como fuente única server-side.
//
// "TU NORTE" (el ancla del año) NO es un flag confiable: en la práctica Aaron casi
// nunca toca el ⚓, así que `goals.is_anchor` está en false para todos y consultar
// is_anchor=true devuelve 0 filas. El norte REAL que Aaron ve en /panel es el que
// deriva buildYearCompass (ancla explícita si existe, si no la infiere por
// prioridad+fecha, self-first). Cualquier feature server-side que quiera "el norte
// del año" debe usar ESTO, no is_anchor, para no quedar dormida. Ver
// lib/year-compass/build.ts y el panel (YearCompass).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Goal } from '@/types'
import { buildYearCompass } from './build'
import { goalAdapter } from '@/lib/supabase/sync/adapters/goals'

export interface YearNorte {
  /** id del objetivo ancla (para marcarlo en listas de objetivos). */
  id: string
  title: string
  /** Detalle SMART (ciudad/disciplina/target…), si hay. */
  subtitle?: string
  /** Próximo paso registrado del ancla, si hay. */
  nextAction?: string
}

/** Columnas que goalAdapter.fromRow necesita para reconstruir un Goal completo. */
const GOAL_COLS =
  'id, title, description, category, priority, status, target_date, progress, milestones, related_goals, related_persons, peace_impact, obstacles, next_action, target, baseline, why, is_anchor, anchor_subtitle, created_at, updated_at'

/** PURA: deriva el norte desde los objetivos ya cargados. null si no hay ancla. */
export function deriveNorte(goals: Goal[], now: Date): YearNorte | null {
  const anchor = buildYearCompass(goals, now).anchor
  if (!anchor) return null
  const na = goals.find((g) => g.id === anchor.id)?.nextAction?.trim()
  return {
    id: anchor.id,
    title: anchor.title.slice(0, 120),
    subtitle: anchor.subtitle?.slice(0, 120) || undefined,
    nextAction: na ? na.slice(0, 120) : undefined,
  }
}

/**
 * Carga los objetivos activos y devuelve el norte del año (misma fuente que /panel).
 * Fail-safe: devuelve null ante cualquier error (el llamador decide el fallback).
 */
export async function getYearNorte(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<YearNorte | null> {
  try {
    const { data } = await supabase
      .from('goals')
      .select(GOAL_COLS)
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(100)
    const goals = ((data ?? []) as Record<string, unknown>[]).map((r) => goalAdapter.fromRow(r))
    return deriveNorte(goals, now)
  } catch {
    return null
  }
}

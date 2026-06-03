// SIR V2 — Objetivos vinculados a UNA persona + contexto para los prompts.
//
// Conciencia del objetivo (caso Dayana → deal "Cerrar Boticas Jhodaal como
// cliente de Marlab"): cuando una persona está vinculada a uno o más objetivos
// comerciales/relacionales, la derivación de memorias y la síntesis "Lo
// personal" tienen que SABERLO, para extraer señales relevantes al objetivo
// (interés/temperatura, objeciones, compromisos, timing, decisores, próximos
// pasos, ganchos de la relación) en vez de quedarse en datos triviales.
//
// `getGoalsForPerson` es el fetch server-side (RLS + filtro user_id explícito).
// `buildGoalContext` es PURO y testeable: arma el bloque de texto que se inyecta
// en el prompt. Si no hay objetivos vinculados, devuelve null (el prompt sigue
// funcionando exactamente como antes — cero regresión).

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Goal } from '@/types'
import { goalAdapter } from '@/lib/supabase/sync/adapters/goals'

/** Columnas base (existen desde 0001). target/baseline/why son de 0042 y
 *  pueden no estar aplicadas en prod → las pedimos aparte con fallback. */
const GOAL_COLUMNS_BASE =
  'id, title, description, category, priority, status, target_date, progress, milestones, related_goals, related_persons, peace_impact, obstacles, next_action, created_at, updated_at'
const GOAL_COLUMNS_SMART = `${GOAL_COLUMNS_BASE}, target, baseline, why`

/**
 * Objetivos ACTIVOS vinculados a una persona (related_persons contiene el id).
 * Orden: prioridad declarada por el usuario no está garantizada acá; devolvemos
 * los activos y dejamos el recorte/orden al builder.
 *
 * PRE-MIGRATION-SAFE: si las columnas SMART (0042) no existen, reintenta con el
 * set base. Cualquier error de query → [] (el prompt corre sin contexto de
 * objetivo, igual que antes).
 */
export async function getGoalsForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<Goal[]> {
  const build = (columns: string) =>
    supabase
      .from('goals')
      .select(columns)
      .eq('user_id', userId)
      .contains('related_persons', [personId])
      .eq('status', 'active')
      .limit(10)

  let { data, error } = await build(GOAL_COLUMNS_SMART)
  if (error) {
    ;({ data, error } = await build(GOAL_COLUMNS_BASE))
  }
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map((row) => goalAdapter.fromRow(row))
}

function clip(s: string | undefined | null, max: number): string | null {
  const t = (s ?? '').trim()
  return t.length > 0 ? t.slice(0, max) : null
}

/**
 * Bloque de texto compacto con los objetivos vinculados, para inyectar en el
 * prompt de derivación/síntesis. null si no hay objetivos (sin contexto extra).
 *
 * Incluye lo accionable de cada objetivo: título, qué se busca lograr (target),
 * por qué importa (why) y la descripción. Acotado en tamaño para no inflar el
 * input (la conversación ya aporta el grueso de tokens).
 */
export function buildGoalContext(goals: Goal[]): string | null {
  const active = goals.filter((g) => g.status === 'active')
  if (active.length === 0) return null

  const blocks = active.slice(0, 5).map((g, i) => {
    const lines: string[] = [`${i + 1}. "${clip(g.title, 160) ?? 'objetivo'}" [${g.category}]`]
    const target = clip(g.target, 200)
    if (target) lines.push(`   meta: ${target}`)
    const why = clip(g.why, 240)
    if (why) lines.push(`   por qué importa: ${why}`)
    const desc = clip(g.description, 400)
    if (desc) lines.push(`   detalle: ${desc}`)
    const next = clip(g.nextAction, 200)
    if (next) lines.push(`   próxima acción declarada: ${next}`)
    return lines.join('\n')
  })

  return blocks.join('\n')
}

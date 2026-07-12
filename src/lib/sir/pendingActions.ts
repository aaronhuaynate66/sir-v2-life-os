// SIR V2 — Acciones propuestas pendientes de confirmación (captura por chat).
//
// Entre que SIR propone una acción (mensaje de Telegram) y que Aaron la confirma
// (tap del botón inline) hay DOS invocaciones serverless distintas → la acción
// se persiste en sir_messages… no: en sir_pending_actions (mig 0144), y el botón
// la referencia por id en su callback_data. Todo FAIL-OPEN: si la tabla no existe
// o falla, save → null (no se ofrece confirmación) y load → null (no se ejecuta).

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProposedActionResolved } from '@/lib/sir/askSir'

/** Persiste la acción propuesta y devuelve su id (para el callback_data), o null. */
export async function savePendingAction(
  client: SupabaseClient,
  userId: string,
  action: ProposedActionResolved,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('sir_pending_actions')
      .insert({ user_id: userId, action })
      .select('id')
      .single()
    if (error || !data) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

/** Trae la acción pendiente por id, verificando dueño. null si no existe/ajena. */
export async function loadPendingAction(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<ProposedActionResolved | null> {
  try {
    const { data, error } = await client
      .from('sir_pending_actions')
      .select('action')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return (data as { action: ProposedActionResolved }).action ?? null
  } catch {
    return null
  }
}

/** Borra la acción pendiente (tras confirmar o descartar). Fail-open. */
export async function deletePendingAction(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  try {
    await client.from('sir_pending_actions').delete().eq('user_id', userId).eq('id', id)
  } catch {
    /* fail-open */
  }
}

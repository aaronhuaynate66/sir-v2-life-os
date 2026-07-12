// SIR V2 — Ejecutor SERVER-SIDE de una acción propuesta (captura por chat).
//
// La web ejecuta las proposedActions en el cliente (sir/page.tsx confirmAction).
// Telegram no tiene cliente: cuando Aaron confirma por botón, hay que escribir
// desde el server (service-role). Este módulo centraliza esa escritura.
//
// Regla de oro (igual que en la web): esto SOLO corre tras confirmación explícita
// de Aaron. Nunca escritura silenciosa.
//
// MVP (PR1): registrar_interaccion — el "anota que hablé con X" (el caso dominante
// de captura de notas). Reusa la materialización de memoria del endpoint web
// (person_logs → memories) para que el briefing de la persona lo vea. Los otros
// kinds (crear_objetivo/persona/cerrar_relacion) quedan para el PR siguiente.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ProposedActionResolved } from '@/lib/sir/askSir'
import { shouldMaterializeInteraction, interactionLogToMemoryRow } from '@/lib/memories/fromInteractionLog'

export interface ExecuteResult {
  ok: boolean
  /** Mensaje corto y humano para devolver al chat. */
  message: string
}

/** ¿Este tipo de acción ya se puede ejecutar por chat? (gate del MVP). */
export function isExecutableByChat(kind: string): boolean {
  return kind === 'registrar_interaccion'
}

export async function executeProposedAction(
  supabase: SupabaseClient,
  userId: string,
  action: ProposedActionResolved,
): Promise<ExecuteResult> {
  if (action.kind === 'registrar_interaccion') {
    const personId = action.personId
    if (!personId) {
      return { ok: false, message: `No encontré a ${action.persona || 'esa persona'} en tu red, así que no lo registré. Podés nombrarla distinto o crearla primero.` }
    }
    // Ownership explícito (defensa sobre RLS; acá vamos con service-role).
    const { data: person } = await supabase
      .from('people').select('id, name').eq('user_id', userId).eq('id', personId).maybeSingle()
    if (!person) {
      return { ok: false, message: 'No encontré esa persona (o no es tuya), no registré nada.' }
    }
    const value = Math.max(1, Math.min(5, Math.round(Number(action.calidad) || 3)))
    const note = (action.nota || '').trim().slice(0, 500) || null

    const { data: log, error } = await supabase
      .from('person_logs')
      .insert({ user_id: userId, person_id: personId, kind: 'interaction', value, note })
      .select('id, logged_at, created_at')
      .single()
    if (error || !log) {
      return { ok: false, message: 'Uf, no pude registrar la interacción. Reintentá en un momento.' }
    }

    // Materializar como memoria (mismo camino que el endpoint web). Fail-soft.
    if (shouldMaterializeInteraction('interaction', note)) {
      try {
        const l = log as { id: string; logged_at: string | null; created_at: string | null }
        const row = interactionLogToMemoryRow(
          { id: l.id, personId, note: note ?? '', value, loggedAt: l.logged_at ?? l.created_at ?? new Date().toISOString() },
          userId,
        )
        await supabase.from('memories').upsert([row], { onConflict: 'id', ignoreDuplicates: true })
      } catch { /* fail-soft: el log ya quedó */ }
    }

    const name = (person as { name?: string }).name || action.persona || 'esa persona'
    return {
      ok: true,
      message: `✅ Registré la interacción con ${name} (tono ${value}/5)${note ? ` — "${note.slice(0, 90)}${note.length > 90 ? '…' : ''}"` : ''}.`,
    }
  }

  return { ok: false, message: 'Ese tipo de acción todavía no lo guardo por chat — por ahora hacelo desde la web.' }
}

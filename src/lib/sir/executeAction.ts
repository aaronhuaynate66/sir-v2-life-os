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
import { generateSlug } from '@/lib/people/slug'

export interface ExecuteResult {
  ok: boolean
  /** Mensaje corto y humano para devolver al chat. */
  message: string
}

/** ¿Este tipo de acción ya se puede ejecutar por chat?
 *  registrar_interaccion + crear_objetivo + crear_persona. `cerrar_relacion`
 *  queda web-only por ahora (multi-tabla + constraints; ver PR de captura). */
export function isExecutableByChat(kind: string): boolean {
  return kind === 'registrar_interaccion' || kind === 'crear_objetivo' || kind === 'crear_persona'
}

function randSuffix(n: number): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < n; i++) s += alpha[Math.floor(Math.random() * alpha.length)]
  return s
}

/** Slug único para una persona nueva (evita chocar con los existentes). */
async function uniquePersonSlug(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  let slug = generateSlug(name)
  try {
    const { data } = await supabase.from('people').select('slug').eq('user_id', userId)
    const taken = new Set(((data as Array<{ slug: string | null }>) ?? []).map((r) => r.slug).filter(Boolean) as string[])
    while (taken.has(slug)) slug = `${slug}-${randSuffix(3)}`
  } catch { /* best-effort: si falla la query, usamos el slug base */ }
  return slug
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

  if (action.kind === 'crear_objetivo') {
    const titulo = (action.titulo || '').trim()
    if (titulo.length < 2) return { ok: false, message: 'Faltó el título del objetivo, no creé nada.' }
    const now = new Date().toISOString()
    const id = `g_${Date.now()}_${randSuffix(4)}`
    // Si el modelo ligó una persona, la resolvió a personId (askSir). La sumamos.
    const relatedPersons = action.personId ? [action.personId] : []
    const { error } = await supabase.from('goals').insert({
      id,
      user_id: userId,
      title: titulo.slice(0, 200),
      description: '',
      category: action.categoria,
      priority: action.prioridad,
      status: 'active',
      progress: 0,
      milestones: [],
      related_goals: [],
      related_persons: relatedPersons,
      peace_impact: Math.max(1, Math.min(10, Math.round(Number(action.impactoPaz) || 5))),
      obstacles: [],
      next_action: (action.proximoPaso || '').slice(0, 240),
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, message: 'Uf, no pude crear el objetivo. Reintentá en un momento.' }
    return { ok: true, message: `🎯 Creé el objetivo "${titulo.slice(0, 90)}".` }
  }

  if (action.kind === 'crear_persona') {
    const name = (action.nombre || '').trim()
    if (name.length < 2) return { ok: false, message: 'Faltó el nombre, no creé la persona.' }
    const now = new Date().toISOString()
    const slug = await uniquePersonSlug(supabase, userId, name)
    const id = `per_${Date.now()}_${randSuffix(6)}`
    // Mismas columnas NOT NULL que usa el import y el alta desde la web.
    const { error } = await supabase.from('people').insert({
      id,
      user_id: userId,
      name: name.slice(0, 120),
      slug,
      relationship: action.relacion,
      category: action.categoria,
      importance_score: 5,
      trust_level: 5,
      energy_impact: 'neutral',
      contact_frequency: '',
      tags: [],
      notes: 'Creado desde el chat de SIR.',
      relational_notes: {},
      created_at: now,
      updated_at: now,
    })
    if (error) return { ok: false, message: 'Uf, no pude agregar a la persona. Reintentá en un momento.' }
    return { ok: true, message: `👤 Agregué a ${name.slice(0, 80)} a tu red.` }
  }

  return { ok: false, message: 'Ese tipo de acción todavía no lo guardo por chat — por ahora hacelo desde la web.' }
}

// SIR V2 — Cerebro F1 · loader server-side.
//
// Junta las lecturas de todas las tablas que alimentan la proyeccion en un
// solo lugar. RLS filtra por user_id automaticamente (usa el server client).
// Todas las lecturas son fail-soft: si una tabla no existe o rompe, se
// degrada a lista vacia para esa fuente.
//
// La entrada de la proyeccion (`projectGraph`) es intencionalmente laxa —
// campos opcionales, arrays por defecto vacios. Esto le permite al loader
// no explotar aunque una migracion futura cambie una columna.

import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchLearnedWeights } from './weights'
import { projectGraph, type ProjectorInput } from './projector'
import type { Graph } from './types'

/** Lee todas las fuentes en paralelo y arma la entrada del projector.
 *  No lanza — cada fuente cae a `[]` si falla. */
export async function loadBrainInput(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProjectorInput> {
  const safe = async <T>(
    p: PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> => {
    try {
      const { data, error } = await p
      if (error) return []
      return data ?? []
    } catch {
      return []
    }
  }

  const [
    people,
    goals,
    orgs,
    steps,
    moments,
    deals,
    personLinks,
    momentParticipants,
    momentReferences,
    memories,
    observations,
    trackers,
    personMoney,
    goalCosts,
    learnedWeights,
  ] = await Promise.all([
    safe(supabase.from('people').select('id, name, full_name')),
    safe(supabase.from('goals').select('id, title, name')),
    safe(supabase.from('org_profiles').select('slug, name')),
    safe(supabase.from('objective_steps').select('id, objective_id, title')),
    safe(supabase.from('relationship_moments').select('id, person_id, title')),
    safe(
      supabase
        .from('deals')
        .select('id, title, contact_person_id, client_org_slug, related_persons'),
    ),
    safe(supabase.from('person_links').select('person_a_id, person_b_id, kind')),
    safe(supabase.from('moment_participants').select('moment_id, person_id')),
    safe(supabase.from('moment_references').select('moment_id, person_id')),
    safe(supabase.from('memories').select('id, person_id')),
    safe(
      supabase
        .from('observations')
        .select('id, person_id')
        .eq('is_obsolete', false),
    ),
    safe(
      supabase
        .from('trackers')
        .select('id, objective_id, objective_step_id, title, name'),
    ),
    safe(supabase.from('person_money').select('id, person_id')),
    safe(supabase.from('goal_costs').select('id, goal_id, label')),
    fetchLearnedWeights(supabase, userId),
  ])

  return {
    people,
    goals,
    orgs,
    steps,
    moments,
    deals,
    personLinks,
    momentParticipants,
    momentReferences,
    memories,
    observations,
    trackers,
    personMoney,
    goalCosts,
    learnedWeights,
  } as ProjectorInput
}

/** Atajo: carga + proyecta. Usado por el debug page. */
export async function loadBrainGraph(
  supabase: SupabaseClient,
  userId: string,
): Promise<Graph> {
  const input = await loadBrainInput(supabase, userId)
  return projectGraph(input)
}

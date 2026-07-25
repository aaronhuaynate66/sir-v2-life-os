// SIR V2 — Cerebro · loader del grafo EXPLÍCITAMENTE scopeado por user_id.
//
// POR QUÉ EXISTE (SEGURIDAD): `loader.ts::loadBrainGraph` NO filtra por user_id
// — confía en RLS (server client con sesión). Eso es correcto en el debug page
// / /api/brain/glow (sesión web, auth.uid() aplica). PERO askSir corre también
// bajo SERVICE-ROLE (webhook de Telegram), donde RLS está BYPASSEADO: usar el
// loader confiado ahí cargaría el grafo de TODOS los usuarios (fuga cross-user,
// mismo patrón que el fix de agenda #963). Este loader agrega `.eq('user_id')`
// en CADA tabla, así es seguro bajo cualquier cliente.
//
// Además corrige BUGS latentes del loader confiado (columnas que NO existen en
// el schema real → el select falla silencioso por PostgREST → la fuente cae a
// [] → el grafo queda casi SIN nodos/aristas, que es lo que pasaba en prod):
//   - org_profiles: la columna es `org_slug`, no `slug`.
//   - people:       NO tiene `full_name` (solo `name`).
//   - goals:        NO tiene `name` (solo `title`).
//   - trackers:     el rótulo es `label`, no `title`/`name`.
// Verificado contra supabase/migrations/0001, 0051, 0077. Con estos selects el
// grafo por fin proyecta personas/objetivos/seguimientos y sus aristas.
//
// Fail-soft por tabla (igual que loader.ts): cualquier fuente que rompa cae a
// []. Reusa `projectGraph` (puro) y `fetchLearnedWeights` (ya scopeado).

import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchLearnedWeights } from './weights'
import { projectGraph, type ProjectorInput, type OrgRow } from './projector'
import type { Graph } from './types'

/** Carga scopeada por user_id + proyección. Segura bajo service-role. */
export async function loadBrainGraphForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<Graph> {
  // Lee una tabla scopeada por user_id. Fail-soft: cualquier error → [].
  const S = async <T>(table: string, cols: string): Promise<T[]> => {
    try {
      const { data, error } = await supabase.from(table).select(cols).eq('user_id', userId)
      if (error) return []
      return (data ?? []) as unknown as T[]
    } catch {
      return []
    }
  }

  const [
    people,
    goals,
    orgsRaw,
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
    pageFollowersRaw,
    learnedWeights,
  ] = await Promise.all([
    S<NonNullable<ProjectorInput['people']>[number]>('people', 'id, name'),
    S<NonNullable<ProjectorInput['goals']>[number]>('goals', 'id, title, related_goals, related_persons'),
    S<{ org_slug: string; name: string | null; instagram_handle: string | null }>('org_profiles', 'org_slug, name, instagram_handle'),
    S<NonNullable<ProjectorInput['steps']>[number]>('objective_steps', 'id, objective_id, title'),
    S<NonNullable<ProjectorInput['moments']>[number]>('relationship_moments', 'id, person_id, title'),
    S<NonNullable<ProjectorInput['deals']>[number]>('deals', 'id, title, contact_person_id, client_org_slug, related_persons'),
    S<NonNullable<ProjectorInput['personLinks']>[number]>('person_links', 'person_a_id, person_b_id, kind'),
    S<NonNullable<ProjectorInput['momentParticipants']>[number]>('moment_participants', 'moment_id, person_id'),
    S<NonNullable<ProjectorInput['momentReferences']>[number]>('moment_references', 'moment_id, person_id'),
    S<NonNullable<ProjectorInput['memories']>[number]>('memories', 'id, person_id'),
    // observations lleva filtro extra is_obsolete=false además del user scope.
    (async (): Promise<NonNullable<ProjectorInput['observations']>> => {
      try {
        const { data, error } = await supabase
          .from('observations')
          .select('id, person_id')
          .eq('user_id', userId)
          .eq('is_obsolete', false)
        if (error) return []
        return (data ?? []) as unknown as NonNullable<ProjectorInput['observations']>
      } catch { return [] }
    })(),
    S<{ id: string; objective_id: string | null; objective_step_id: string | null; label: string | null }>('trackers', 'id, objective_id, objective_step_id, label'),
    S<NonNullable<ProjectorInput['personMoney']>[number]>('person_money', 'id, person_id'),
    S<NonNullable<ProjectorInput['goalCosts']>[number]>('goal_costs', 'id, goal_id, label'),
    S<{ person_id: string | null; page_handle: string }>('social_page_followers', 'person_id, page_handle'),
    fetchLearnedWeights(supabase, userId),
  ])

  // org_profiles usa `org_slug`; el projector espera `slug`. Mapeamos.
  const orgs: OrgRow[] = orgsRaw.map((o) => ({ slug: o.org_slug, name: o.name }))

  // "Fulano sigue esta página" → arista person→org. El puente es el handle de
  // IG de la organización (0167): sin él la fila no se puede atribuir a nadie.
  const orgSlugByHandle = new Map<string, string>()
  for (const o of orgsRaw) {
    const h = (o.instagram_handle ?? '').trim().toLowerCase().replace(/^@/, '')
    if (h) orgSlugByHandle.set(h, o.org_slug)
  }
  const pageFollows = pageFollowersRaw
    .map((f) => {
      const slug = orgSlugByHandle.get((f.page_handle ?? '').trim().toLowerCase().replace(/^@/, ''))
      return f.person_id && slug ? { person_id: f.person_id, org_slug: slug } : null
    })
    .filter((f): f is { person_id: string; org_slug: string } => !!f)
  // trackers rotula con `label`; el projector usa `title`. Mapeamos.
  const trackersMapped: NonNullable<ProjectorInput['trackers']> = trackers.map((t) => ({
    id: t.id,
    objective_id: t.objective_id ?? undefined,
    objective_step_id: t.objective_step_id ?? undefined,
    title: t.label ?? undefined,
  }))

  const input: ProjectorInput = {
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
    trackers: trackersMapped,
    personMoney,
    goalCosts,
    pageFollows,
    learnedWeights,
  }
  return projectGraph(input)
}

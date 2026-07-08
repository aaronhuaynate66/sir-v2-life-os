// SIR V2 — Helper server-side para leer los moments (relationship_moments)
// de una persona, para renderizar en la Bitácora de la ficha.
//
// Reusa el mapper `mapMomentRow` que ya existe (paridad con /api/moments).
// Trae moments donde la persona es PRIMARIA O participante. Fail-open si la
// tabla no existe.

import type { SupabaseClient } from '@supabase/supabase-js'

import { mapMomentRow, type RelationshipMoment } from './types'

const SELECT = 'id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at'

export async function getMomentsForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: { limit?: number } = {},
): Promise<RelationshipMoment[]> {
  const limit = opts.limit ?? 50
  try {
    // Ids de moments donde la persona es PARTICIPANTE (no primaria).
    let participantMomentIds: string[] = []
    try {
      const { data } = await supabase
        .from('moment_participants')
        .select('moment_id')
        .eq('user_id', userId)
        .eq('person_id', personId)
      participantMomentIds = ((data ?? []) as Array<{ moment_id: string }>).map((r) => r.moment_id)
    } catch {
      /* tabla puede no existir (mig 0095) → sin participants */
    }

    let q = supabase.from('relationship_moments').select(SELECT).eq('user_id', userId)
    if (participantMomentIds.length > 0) {
      q = q.or(`person_id.eq.${personId},id.in.(${participantMomentIds.join(',')})`)
    } else {
      q = q.eq('person_id', personId)
    }
    const { data } = await q.order('occurred_on', { ascending: false }).limit(limit)
    if (!data) return []
    const rows = data as Array<Parameters<typeof mapMomentRow>[0]>
    const mapped = rows.map(mapMomentRow)

    // Poblar participantIds (primaria + participantes) para que los consumidores
    // — p. ej. Pendientes — reconozcan a la persona aunque no sea la primaria del
    // episodio compartido. Fail-open: si la tabla no existe, quedan sin poblar.
    try {
      const momentIds = mapped.map((m) => m.id)
      if (momentIds.length > 0) {
        const { data: parts } = await supabase
          .from('moment_participants')
          .select('moment_id, person_id')
          .eq('user_id', userId)
          .in('moment_id', momentIds)
        const byMoment = new Map<string, Set<string>>()
        for (const p of (parts ?? []) as Array<{ moment_id: string; person_id: string }>) {
          const s = byMoment.get(p.moment_id) ?? new Set<string>()
          s.add(p.person_id)
          byMoment.set(p.moment_id, s)
        }
        for (const m of mapped) {
          const ids = new Set<string>([m.personId])
          for (const pid of byMoment.get(m.id) ?? []) ids.add(pid)
          m.participantIds = [...ids]
        }
      }
    } catch {
      /* tabla puede no existir → participantIds sin poblar (fallback al personId) */
    }
    return mapped
  } catch {
    return []
  }
}

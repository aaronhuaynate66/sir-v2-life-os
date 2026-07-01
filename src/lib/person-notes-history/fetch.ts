// SIR V2 — Helper server-side para leer person_notes_history de una persona.
//
// Fetch inmutable (no muta nada); RLS filtra por user_id. Fail-open: si la
// tabla no existe todavía (mig 0108 sin correr) o el select falla, devuelve
// [] para no romper la ficha. La Bitácora renderiza lo que haya.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PersonNoteHistoryEntry {
  id: string
  snapshot: string | null
  changedAt: string
  changeSource: string
  /** Longitud del snapshot (columna generada). */
  snapshotLen: number
}

export async function getNotesHistoryForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: { limit?: number } = {},
): Promise<PersonNoteHistoryEntry[]> {
  const limit = opts.limit ?? 50
  try {
    const { data, error } = await supabase
      .from('person_notes_history')
      .select('id, snapshot, changed_at, change_source, snapshot_len')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('changed_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data.map((row) => {
      const r = row as {
        id: string
        snapshot: string | null
        changed_at: string
        change_source: string
        snapshot_len: number | string
      }
      return {
        id: r.id,
        snapshot: r.snapshot,
        changedAt: r.changed_at,
        changeSource: r.change_source,
        snapshotLen: typeof r.snapshot_len === 'string' ? Number(r.snapshot_len) : r.snapshot_len,
      }
    })
  } catch {
    return []
  }
}

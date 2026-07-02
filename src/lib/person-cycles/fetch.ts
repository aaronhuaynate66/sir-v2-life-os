// SIR V2 — Fetch server-side de person_cycles por persona.
//
// Tolerante: si la mig 0110 aún no está aplicada, devuelve [] en lugar de
// tirar 500 (patrón del resto de fetches del proyecto).

import type { createClient } from '@/lib/supabase/server'
import { mapPersonCycleRow, type PersonCycleEntry } from './types'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function getPersonCyclesForPerson(
  supabase: Supabase,
  userId: string,
  personId: string,
  { fromDays }: { fromDays?: number } = {},
): Promise<PersonCycleEntry[]> {
  try {
    let q = supabase
      .from('person_cycles')
      .select('id, person_id, date, phase, confidence, source, note, created_at')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('date', { ascending: true })
      .limit(1000)
    if (fromDays && fromDays > 0) {
      const cutoff = new Date(Date.now() - fromDays * 86_400_000)
      const ymd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
      q = q.gte('date', ymd)
    }
    const { data, error } = await q
    if (error || !data) return []
    return (data as Parameters<typeof mapPersonCycleRow>[0][]).map(mapPersonCycleRow)
  } catch {
    return []
  }
}

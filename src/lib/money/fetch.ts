// SIR V2 — Helper server-side para leer los movimientos de plata (person_money)
// de una persona, para renderizar en la Bitácora / timeline de la ficha.
//
// Reusa el mapper `mapMoneyRow` (paridad con /api/people/money). Fail-open []
// si la tabla no existe todavía → la Bitácora se ve como antes.

import type { SupabaseClient } from '@supabase/supabase-js'

import { mapMoneyRow, type MoneyEntry } from './types'

const SEL =
  'id, person_id, direction, amount, currency, concept, kind, occurred_on, occurred_time, op_ref, settled'

export async function getMoneyForPerson(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  opts: { limit?: number } = {},
): Promise<MoneyEntry[]> {
  const limit = opts.limit ?? 100
  try {
    const { data } = await supabase
      .from('person_money')
      .select(SEL)
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('occurred_on', { ascending: false })
      .limit(limit)
    if (!data) return []
    return (data as Parameters<typeof mapMoneyRow>[0][]).map(mapMoneyRow)
  } catch {
    return []
  }
}

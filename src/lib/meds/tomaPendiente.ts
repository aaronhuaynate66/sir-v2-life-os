// SIR V2 — Qué medicamentos entran en la toma de una hora, y si ya se registraron hoy.
//
// Impuro (toca la DB) a propósito: la decisión pura vive en `telegramToma.ts` y en
// `curso.ts`. Acá sólo se resuelve el estado desde la base.
//
// Se resuelven por `med_prescription_items.schedule` (la hora objetivo), NO por el
// texto del mensaje de Telegram: un mensaje no es fuente de verdad, y el aviso agrupa
// medicamentos de recetas distintas.

import type { SupabaseClient } from '@supabase/supabase-js'

import { dedupeRafagas, tomasDeHoy } from './curso'
import type { MedDeToma } from './telegramToma'

/** 'YYYY-MM-DD' de hoy en Lima (offset fijo −05:00). */
export function hoyLima(nowMs: number = Date.now()): string {
  return new Date(nowMs - 5 * 3_600_000).toISOString().slice(0, 10)
}

interface ItemRow {
  id: string
  med_name: string
  dose: string | null
  schedule: string[] | null
  prescription_id: string
}

/**
 * Los medicamentos de la toma de `hora` (formato 'HH:MM'), con su estado de hoy.
 *
 * Sólo de recetas ACTIVAS: un tratamiento suspendido o completado no debe pedir tomas.
 * Devuelve [] si algo falla — el llamador decide si eso significa "no mandar botones".
 */
export async function medsDeLaToma(
  supabase: SupabaseClient,
  userId: string,
  hora: string,
  nowMs: number = Date.now(),
): Promise<MedDeToma[]> {
  try {
    const { data: pres, error: pe } = await supabase
      .from('med_prescriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'activa')
    // PostgREST no lanza: el error viene en `.error`. Leerlo como "no hay recetas"
    // haría que el aviso salga sin botones y en silencio.
    if (pe || !pres || pres.length === 0) return []
    const ids = (pres as Array<{ id: string }>).map((p) => p.id)

    const { data: its, error: ie } = await supabase
      .from('med_prescription_items')
      .select('id, med_name, dose, schedule, prescription_id')
      .in('prescription_id', ids)
    if (ie || !its) return []

    const delaHora = (its as ItemRow[]).filter((i) => (i.schedule ?? []).some((s) => String(s).slice(0, 5) === hora))
    if (delaHora.length === 0) return []

    // Las tomas de hoy de esos ítems, dedupeadas: un doble tap no cubre dos dosis.
    const { data: tk } = await supabase
      .from('med_intakes')
      .select('taken_at, prescription_item_id')
      .eq('user_id', userId)
      .in('prescription_item_id', delaHora.map((i) => i.id))
      .limit(500)
    const porItem = new Map<string, string[]>()
    for (const t of (tk as Array<{ taken_at: string; prescription_item_id: string | null }>) ?? []) {
      if (!t.prescription_item_id) continue
      const arr = porItem.get(t.prescription_item_id) ?? []
      arr.push(t.taken_at)
      porItem.set(t.prescription_item_id, arr)
    }
    const hoy = hoyLima(nowMs)
    return delaHora.map((i) => {
      const times = porItem.get(i.id) ?? []
      const limpias = dedupeRafagas(times.map((takenAt) => ({ name: i.id, takenAt })))
      return {
        itemId: i.id,
        medName: i.med_name,
        dose: i.dose,
        yaHoy: tomasDeHoy(limpias.map((l) => l.takenAt), hoy) > 0,
      }
    })
  } catch {
    return []
  }
}

/**
 * Registra la toma de un ítem HOY. Idempotente: si ya hay una de hoy no duplica.
 * Devuelve el nombre del medicamento, o null si el ítem no es del usuario.
 */
export async function marcarToma(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  nowMs: number = Date.now(),
): Promise<{ medName: string; yaEstaba: boolean } | null> {
  const { data: item } = await supabase
    .from('med_prescription_items')
    .select('id, med_name, user_id')
    .eq('id', itemId)
    .maybeSingle()
  const it = item as { id: string; med_name: string; user_id: string } | null
  // `user_id` de los ítems es TEXT y el de `med_intakes` es UUID (ver mig 0183):
  // se comparan como string a propósito.
  if (!it || String(it.user_id) !== String(userId)) return null

  const hoy = hoyLima(nowMs)
  const { data: previas } = await supabase
    .from('med_intakes')
    .select('taken_at')
    .eq('user_id', userId)
    .eq('prescription_item_id', itemId)
    .limit(50)
  const yaEstaba = tomasDeHoy(
    ((previas as Array<{ taken_at: string }>) ?? []).map((p) => p.taken_at),
    hoy,
  ) > 0
  if (!yaEstaba) {
    await supabase.from('med_intakes').insert({
      user_id: userId,
      name: it.med_name,
      quantity: 1,
      prescription_item_id: itemId,
      note: 'Registrado desde Telegram',
      taken_at: new Date(nowMs).toISOString(),
    })
  }
  return { medName: it.med_name, yaEstaba }
}

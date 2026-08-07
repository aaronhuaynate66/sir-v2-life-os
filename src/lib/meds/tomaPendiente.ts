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
  slot?: string | null,
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
      .select('taken_at, prescription_item_id, dose_slot')
      .eq('user_id', userId)
      .in('prescription_item_id', delaHora.map((i) => i.id))
      .limit(500)
    const porItem = new Map<string, string[]>()
    const slotsPorItem = new Map<string, Set<string>>()
    for (const t of (tk as Array<{ taken_at: string; prescription_item_id: string | null; dose_slot: string | null }>) ?? []) {
      if (!t.prescription_item_id) continue
      const arr = porItem.get(t.prescription_item_id) ?? []
      arr.push(t.taken_at)
      porItem.set(t.prescription_item_id, arr)
      if (t.dose_slot) {
        const s = slotsPorItem.get(t.prescription_item_id) ?? new Set<string>()
        s.add(t.dose_slot)
        slotsPorItem.set(t.prescription_item_id, s)
      }
    }
    const hoy = hoyLima(nowMs)
    return delaHora.map((i) => {
      const times = porItem.get(i.id) ?? []
      const limpias = dedupeRafagas(times.map((takenAt) => ({ name: i.id, takenAt })))
      return {
        itemId: i.id,
        medName: i.med_name,
        dose: i.dose,
        // ═══ SE PREGUNTA POR LA DOSIS, NO POR EL DÍA ═════════════════════════
        //
        // Con `slot` la pregunta es "¿ya se registró LA TOMA de las 08:00 del 3?".
        // Antes era "¿hay alguna toma de este ítem HOY?", y eso produjo dos fallas:
        //   · 6-ago: el tap de las 09:31 respondía al aviso de la noche del 5, y esa
        //     noche las 4 salieron como "ya registradas" sin que hubiera tomado nada;
        //   · con dos tomas al día —el suplemento de calcio— marcar la del desayuno
        //     habría tapado la del almuerzo.
        //
        // Sin `slot` cae al comportamiento viejo, para que los avisos que ya están en
        // el chat con callbacks viejos sigan funcionando igual.
        yaRegistrada: slot
          ? (slotsPorItem.get(i.id)?.has(slot) ?? false)
          : tomasDeHoy(limpias.map((l) => l.takenAt), hoy) > 0,
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
  slot?: string | null,
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
    .select('taken_at, dose_slot')
    .eq('user_id', userId)
    .eq('prescription_item_id', itemId)
    .limit(50)
  const filas = ((previas as Array<{ taken_at: string; dose_slot: string | null }>) ?? [])

  // El candado: con `slot`, por DOSIS; sin él, el de siempre (por día).
  const yaEstaba = slot
    ? filas.some((p) => p.dose_slot === slot)
    : tomasDeHoy(filas.map((p) => p.taken_at), hoy) > 0

  if (!yaEstaba) {
    // ═══ `taken_at` HÍBRIDO ═══════════════════════════════════════════════════
    //
    // Si la dosis es de HOY, se guarda la hora real del tap: es dato bueno y no hay
    // razón para tirarlo. Si es de otro día —el caso "¿tomaste la de anoche?"— se
    // guarda el instante de la PAUTA, porque escribir la hora del tap metía la dosis
    // del 5 en el día 6, que es el bug que originó todo esto.
    //
    // El momento real del registro no se pierde: va en la nota.
    const fechaSlot = slot ? slot.slice(0, 10) : null
    const horaSlot = slot ? slot.slice(11) : null
    const diferido = !!fechaSlot && fechaSlot !== hoy
    const takenAt = diferido
      ? new Date(`${fechaSlot}T${horaSlot}:00-05:00`).toISOString()
      : new Date(nowMs).toISOString()
    const nota = diferido
      ? `Registrado desde Telegram el ${hoy} · dosis del ${fechaSlot} ${horaSlot}`
      : 'Registrado desde Telegram'

    const { error } = await supabase.from('med_intakes').insert({
      user_id: userId,
      name: it.med_name,
      quantity: 1,
      prescription_item_id: itemId,
      note: nota,
      taken_at: takenAt,
      dose_slot: slot ?? null,
    })
    // El índice único de la mig 0185 es la red final: si dos taps llegan a la vez, el
    // segundo choca acá en vez de duplicar la dosis. Un choque NO es un error para
    // Aaron — significa "ya estaba", que es justo lo que hay que responderle.
    if (error) return { medName: it.med_name, yaEstaba: true }
  }
  return { medName: it.med_name, yaEstaba }
}

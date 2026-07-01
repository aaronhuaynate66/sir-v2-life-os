// SIR V2 — Cerebro F1 · I/O de pesos aprendidos.
//
// F1 SOLO LEE `edge_weights`. F3 (Hebbian) va a escribir cuando exista. Esta
// lib expone dos superficies:
//
//  - `fetchLearnedWeights(supabase, userId)` — devuelve Map<edge_key, weight>.
//    Fail-soft: si la tabla no existe todavia (migracion 0106 no corrida) o
//    RLS filtra todo, devuelve Map vacio y la proyeccion sigue con peso base.
//
//  - `learnedWeightsFromRows(rows)` — puro, para tests: arma el Map desde un
//    array de filas ya leidas.
//
// Contrato con `projector.ts`: la llave es exactamente la que devuelve
// `edgeKey(...)` en `types.ts`. Cualquier drift entre lo escrito y lo leido
// se detecta con la firma determinista.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface EdgeWeightRow {
  edge_key: string
  weight: number | string  // supabase puede devolver numeric como string
}

/** Construye el Map desde filas ya leidas. Puro. */
export function learnedWeightsFromRows(rows: EdgeWeightRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const w = typeof r.weight === 'string' ? Number(r.weight) : r.weight
    if (!Number.isFinite(w)) continue
    m.set(r.edge_key, w)
  }
  return m
}

/** Lee `edge_weights` del usuario. Fail-soft si la tabla no existe.
 *  RLS filtra por user_id automaticamente (usa el server client con sesion). */
export async function fetchLearnedWeights(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('edge_weights')
    .select('edge_key, weight')
    .eq('user_id', userId)
  if (error) {
    // Fail-open: sin la mig 0106 la tabla no existe. No queremos que se caiga
    // el debug page ni la proyeccion — se degrada a "solo peso base".
    return new Map()
  }
  return learnedWeightsFromRows((data ?? []) as EdgeWeightRow[])
}

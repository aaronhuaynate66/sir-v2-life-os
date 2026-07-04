// SIR V2 — Notas del ciclo (rescate DD de person_cycles.note).
//
// Los registros día a día del ciclo traen una `note` (contexto que Aaron carga o
// que ella reporta) que no se mostraba en ningún lado. Este helper puro filtra
// los que tienen nota y los ordena para mostrarlos, más recientes primero.

import type { PersonCycleEntry } from './types'

/** Registros con nota no vacía, ordenados por fecha descendente. PURO. */
export function cycleEntriesWithNotes(entries: PersonCycleEntry[]): PersonCycleEntry[] {
  return entries
    .filter((e) => (e.note ?? '').trim().length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
}

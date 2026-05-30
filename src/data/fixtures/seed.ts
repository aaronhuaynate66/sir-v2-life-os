// SIR V2 — Control de semilla de fixtures (deuda "split-brain" del BACKLOG).
//
// PROBLEMA QUE RESUELVE:
//   Los fixtures (Marco Rodriguez, Sofia Vega, Papa + goals/signals/etc.
//   de muestra) eran el INITIAL_STATE de TODOS los stores. En cada
//   localStorage fresco se sembraban y, como el sync engine hace merge
//   aditivo (nunca borra filas local-only), sobrevivían para siempre —
//   contaminando producción con data de demo que parece "viva".
//
// SOLUCIÓN (dos partes):
//   1. SEED_FIXTURES gatea el seeding: true solo fuera de producción. En
//      prod el estado inicial de cada store es vacío. Como el flag se
//      resuelve en build (process.env.NODE_ENV), la rama dev — y con ella
//      el import de los objetos fixture — es eliminable por DCE/tree-shake
//      en el bundle de prod.
//   2. FIXTURE_IDS + purgeFixtureRows limpian el localStorage YA
//      contaminado de clientes existentes, vía el `migrate` del persist de
//      cada store (que sí corre en prod). Por eso esta lista es de strings
//      literales: NO importa los objetos fixture, así el path de migración
//      no vuelve a meter los fixtures al bundle de prod.
//
// IMPORTANTE: esta lista debe mantenerse en sync con los ids definidos en
// src/data/fixtures/index.ts y src/data/fixtures/memories.ts. Son ids
// estables y hardcodeados a propósito (los reales son UUID v4, así que no
// hay colisión posible con estos slugs cortos).

/** true fuera de producción. Resuelto en build → permite tree-shaking de
 *  los fixtures en el bundle de prod. */
export const SEED_FIXTURES = process.env.NODE_ENV !== 'production'

/** Ids de TODAS las filas pre-sembradas (people/relationships/goals/
 *  signals/sleep/metrics/finance/recommendation/memories). */
export const FIXTURE_IDS: ReadonlySet<string> = new Set<string>([
  // people
  'person_001', 'person_002', 'person_003',
  // relationships
  'rel_001', 'rel_002',
  // goals
  'goal_001', 'goal_002',
  // signals
  'signal_001', 'signal_002', 'signal_003',
  // sleep records
  'sl1', 'sl2', 'sl3',
  // self metrics
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
  // financial movements
  'f1', 'f2', 'f3', 'f4', 'f5',
  // recommendation
  'rec_initial_001',
  // memories
  'mem_001', 'mem_002', 'mem_003', 'mem_004', 'mem_005',
])

export function isFixtureId(id: string): boolean {
  return FIXTURE_IDS.has(id)
}

/** Devuelve las filas SIN las sembradas (filtra por id). Usado por el
 *  `migrate` del persist de cada store para autolimpiar clientes viejos. */
export function purgeFixtureRows<T extends { id: string }>(rows: T[] | undefined | null): T[] {
  if (!Array.isArray(rows)) return []
  return rows.filter((r) => !FIXTURE_IDS.has(r.id))
}

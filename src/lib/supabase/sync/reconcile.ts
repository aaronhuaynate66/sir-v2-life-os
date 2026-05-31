// SIR V2 — Núcleo PURO de reconciliación del sync engine.
//
// Extraído de engine.ts para poder testear la lógica sutil (y cara si
// regresiona) sin mockear Supabase, localStorage ni timers. engine.ts
// importa estas funciones; el comportamiento es idéntico.
//
// Las tres piezas:
//   - diffSlice:     prev vs curr (referential equality) -> upserts/deletes.
//   - reconcilePull: DB (autoritativo) + locales pendientes -> estado próximo.
//   - parsePendingIds: parseo tolerante del set persistido en localStorage.
//
// Semántica de reconcilePull (Supabase = única fuente de verdad):
//   - fila en DB                                  -> autoritativa, se conserva.
//   - fila local ausente de DB CON push pendiente -> se conserva (offline,
//                                                    se re-pushea; no se pierde).
//   - fila local ausente de DB SIN push pendiente -> se DROPEA (borrada
//                                                    remotamente o fantasma
//                                                    adoptada por un pull viejo).

/**
 * Diff de dos arrays por id usando igualdad referencial. Devuelve inserts +
 * updates (referencia distinta) colapsados en `upserts`, y `deletes` (ids
 * presentes en prev y ausentes en curr). O(n).
 */
export function diffSlice<T extends { id: string }>(
  prev: T[],
  curr: T[],
): { upserts: T[]; deletes: string[] } {
  const prevMap = new Map<string, T>()
  for (const item of prev) prevMap.set(item.id, item)
  const currMap = new Map<string, T>()
  for (const item of curr) currMap.set(item.id, item)

  const upserts: T[] = []
  for (const [id, curItem] of currMap) {
    const prevItem = prevMap.get(id)
    if (!prevItem || prevItem !== curItem) upserts.push(curItem)
  }
  const deletes: string[] = []
  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) deletes.push(id)
  }
  return { upserts, deletes }
}

export interface PullReconciliation<T> {
  /** Estado próximo a aplicar: DB (autoritativo) + locales pendientes. */
  next: T[]
  /** Ids pendientes que ya aparecen en DB -> confirmados, dejan de ser
   *  pendientes (el caller los purga del set persistido). */
  confirmedPendingIds: string[]
  /** Ids locales ausentes de DB y NO pendientes -> dropeados (solo para
   *  logging/diagnóstico; no son parte de `next`). */
  droppedIds: string[]
}

/**
 * Reconcilia el resultado de un pull. DB es autoritativo: el estado próximo
 * arranca de las filas de DB y SOLO suma las filas locales ausentes de DB
 * que tienen un push pendiente (creadas/editadas offline). Cualquier otra
 * fila local ausente de DB se dropea (delete remoto o fantasma).
 *
 * Orden de `next`: filas de DB (en su orden) seguidas por las pendientes
 * preservadas (en orden de `localItems`) — idéntico a engine.ts.
 */
export function reconcilePull<T extends { id: string }>(
  dbItems: T[],
  localItems: T[],
  pendingIds: ReadonlySet<string>,
): PullReconciliation<T> {
  const dbIds = new Set(dbItems.map((r) => r.id))

  const next: T[] = [...dbItems]
  const droppedIds: string[] = []
  for (const r of localItems) {
    if (dbIds.has(r.id)) continue
    if (pendingIds.has(r.id)) next.push(r)
    else droppedIds.push(r.id)
  }

  // Pendientes ya confirmados en DB (intersección pending ∩ dbIds).
  const confirmedPendingIds: string[] = []
  for (const id of pendingIds) {
    if (dbIds.has(id)) confirmedPendingIds.push(id)
  }

  return { next, confirmedPendingIds, droppedIds }
}

/**
 * Parseo tolerante del set de pendingIds persistido en localStorage.
 * Devuelve un Set vacío ante null, JSON inválido, o un valor que no sea un
 * array; filtra elementos no-string. Nunca tira.
 */
export function parsePendingIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr)
      ? new Set(arr.filter((x): x is string => typeof x === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

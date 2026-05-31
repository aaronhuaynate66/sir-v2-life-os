// SIR V2 — Helpers puros para el multi-select de personas vinculadas a un
// objetivo (goal.relatedPersons). Lógica de selección/dedup aislada del form
// para poder testearla sin React.

/** Quita duplicados preservando el orden de primera aparición. */
export function dedupePersonIds(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

/**
 * Alterna la pertenencia de `id` en `ids`: si está lo quita, si no está lo
 * agrega al final. El resultado siempre queda deduplicado. No muta `ids`.
 */
export function togglePersonId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : dedupePersonIds([...ids, id])
}

/**
 * Filtra `ids` a los que existen en `validIds` (personas que aún existen en el
 * store), deduplicado. Útil para limpiar vínculos a personas borradas antes de
 * persistir o mostrar.
 */
export function sanitizePersonIds(ids: string[], validIds: Iterable<string>): string[] {
  const valid = validIds instanceof Set ? validIds : new Set(validIds)
  return dedupePersonIds(ids.filter((id) => valid.has(id)))
}

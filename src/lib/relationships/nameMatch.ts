// SIR V2 — Matching de nombres para reconciliar familia (texto → persona).
//
// El problema raíz: la familia se cargaba como texto ("MADRE: maria") y nunca
// reconciliaba contra la persona que YA existe ("María Isabel Espinoza
// Vidaurre"). Acá vive la lógica pura para (a) filtrar el autocompletar y
// (b) puntuar candidatos al reconciliar texto libre. Tolerante a tildes,
// mayúsculas y a que el texto sea solo el primer nombre.

/** Normaliza: minúsculas, sin tildes, sin signos, espacios colapsados. */
export function normalizeName(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokens normalizados de un nombre. "María Isabel" -> ["maria","isabel"]. */
export function nameTokens(raw: string): string[] {
  const n = normalizeName(raw)
  return n ? n.split(' ') : []
}

/**
 * Fuerza del match entre una consulta (lo tipeado / el texto libre) y un nombre
 * candidato. 0 = sin match; 1 = match exacto. Pensado para ordenar candidatos,
 * no como probabilidad calibrada.
 *
 *   • exacto (normalizado)                         → 1
 *   • todos los tokens de la query están en el     → 0.9  (ej. "maria isabel"
 *     candidato                                              ⊂ nombre completo)
 *   • la query es el primer token del candidato    → 0.8  (ej. "maria" → "María …")
 *   • algún token de la query ⊂ tokens candidato   → 0.6
 *   • substring suelto                             → 0.4
 */
export function matchStrength(query: string, candidate: string): number {
  const q = normalizeName(query)
  const c = normalizeName(candidate)
  if (!q || !c) return 0
  if (q === c) return 1

  const qTokens = q.split(' ')
  const cTokens = c.split(' ')
  const cSet = new Set(cTokens)

  if (qTokens.every((t) => cSet.has(t))) return 0.9
  if (cTokens[0] === q || qTokens[0] === cTokens[0]) return 0.8
  if (qTokens.some((t) => t.length >= 3 && cSet.has(t))) return 0.6
  if (c.includes(q) || q.includes(c)) return 0.4
  return 0
}

/** ¿Pasa el umbral para considerarse el mismo? (reconciliación best-effort). */
export function isLikelySameName(query: string, candidate: string): boolean {
  return matchStrength(query, candidate) >= 0.8
}

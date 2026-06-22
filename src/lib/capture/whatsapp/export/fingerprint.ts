// SIR V2 — "Huella" de un chat de WhatsApp para reconocerlo al re-importar.
// PURO. Usa los PARTICIPANTES del export (los autores), normalizados y
// ordenados — no cambian aunque el export no traiga el nombre "lindo" del
// contacto (un número también es estable). Sirve para mapear chat → persona.

/** Normaliza un nombre de autor: sin acentos, minúsculas, sin símbolos. */
function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Huella determinística de un chat a partir de sus participantes. Ordena +
 * normaliza + une. '' si no hay participantes utilizables. Cap 240 chars.
 */
export function chatFingerprint(participants: string[]): string {
  const parts = (participants ?? [])
    .map(norm)
    .filter((p) => p.length > 0)
  if (parts.length === 0) return ''
  const uniq = [...new Set(parts)].sort()
  return uniq.join('|').slice(0, 240)
}

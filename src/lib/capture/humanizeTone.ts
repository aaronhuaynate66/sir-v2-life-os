// SIR V2 — Traducir el enum de tono emocional a español legible.
//
// El extractor de chats guarda emotionalStates como tokens snake_case en inglés,
// a veces combinados con '+' (ej. "affectionate_routine+supportive"). Ese crudo
// se colaba a la UI (línea de tiempo de la ficha). Esto lo vuelve legible sin
// perder el matiz. PURO. Fallback: limpia guiones/plus si no reconoce el token.

const TOKEN_ES: Record<string, string> = {
  affectionate: 'cariñoso',
  routine: 'rutinario',
  supportive: 'de apoyo',
  playful: 'juguetón',
  warm: 'cálido',
  tense: 'tenso',
  distant: 'distante',
  cold: 'frío',
  anxious: 'ansioso',
  sad: 'triste',
  frustrated: 'frustrado',
  excited: 'entusiasmado',
  happy: 'contento',
  neutral: 'neutral',
  conflict: 'en conflicto',
  unresolved: 'sin resolver',
  seeking: 'buscando',
  support: 'contención',
  loving: 'amoroso',
  reconnecting: 'reconectando',
  caring: 'atento',
  stressed: 'estresado',
  reassuring: 'tranquilizador',
  vulnerable: 'vulnerable',
  hopeful: 'esperanzado',
}

/**
 * "affectionate_routine+supportive" → "cariñoso, rutinario, de apoyo".
 * Divide por '+' y '_', traduce token a token, junta con coma. Los tokens
 * desconocidos se limpian (guiones→espacios) para no mostrar el crudo.
 */
export function humanizeTone(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const tokens = s
    .toLowerCase()
    .split(/[+_\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length === 0) return ''
  const words = tokens.map((t) => TOKEN_ES[t] ?? t)
  // Dedup preservando orden (evita "cálido, cálido" si el crudo repetía).
  const seen = new Set<string>()
  const uniq = words.filter((w) => (seen.has(w) ? false : (seen.add(w), true)))
  return uniq.join(', ')
}

// SIR V2 — Detección de menciones en el texto del diario.
//
// Cuando Aaron escribe "hoy pensé en Diana Díaz" o solo "Diana", queremos
// linkear la entry a esa ficha. Búsqueda tolerante:
//   - Match por nombre completo exacto.
//   - Match por primer nombre + confirma solo si UNA persona coincide (sin
//     ambigüedad). Ej. "Diana" con Díaz + Cencaro en la red → NO auto-link.
//   - Ignora words comunes (yo, tú, ella, etc.).
//
// PURO. Testeable sin DB.

/** Normaliza para comparar. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const STOP_WORDS = new Set([
  'yo', 'tu', 'tú', 'el', 'él', 'ella', 'ellos', 'ellas', 'nos', 'les', 'mi', 'me', 'te', 'se',
  'un', 'una', 'unos', 'unas', 'la', 'las', 'los', 'del', 'de',
  'que', 'para', 'por', 'con', 'sin', 'como',
  'hoy', 'ayer', 'mañana', 'ahora', 'antes', 'después',
  'ok', 'sí', 'no', 'ya', 'aún',
])

interface PersonMini { id: string; name: string }

/**
 * Devuelve los IDs de personas mencionadas en el texto. Solo linkea cuando
 * la resolución es INEQUÍVOCA (nombre completo O primer nombre único).
 */
export function detectMentionedPersons(
  content: string,
  people: PersonMini[],
): string[] {
  if (!content.trim() || people.length === 0) return []

  const normContent = ` ${norm(content)} `

  // Index: nombres completos y sus primer-tokens.
  const byFull = new Map<string, string>() // norm(full name) → personId
  const byFirst = new Map<string, string[]>() // norm(first token) → [personId]
  for (const p of people) {
    const nname = norm(p.name)
    if (nname.length < 2) continue
    byFull.set(nname, p.id)
    const tokens = nname.split(/\s+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    if (tokens.length === 0) continue
    const first = tokens[0]
    const arr = byFirst.get(first) ?? []
    arr.push(p.id)
    byFirst.set(first, arr)
  }

  const found = new Set<string>()

  // 1. Match por nombre completo (más específico).
  for (const [name, id] of byFull) {
    if (normContent.includes(` ${name} `)) found.add(id)
  }

  // 2. Match por primer nombre — solo si UNO solo.
  for (const [first, ids] of byFirst) {
    if (ids.length !== 1) continue // ambiguo → skip
    if (STOP_WORDS.has(first)) continue
    if (first.length < 3) continue // "ana" es común como stopword-like
    // Buscar como palabra separada.
    const re = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(normContent)) found.add(ids[0])
  }

  return [...found]
}

/** Extrae tags con hash (#reflexión, #trabajo). Normalizados en minúsculas. */
export function extractTags(content: string): string[] {
  const out = new Set<string>()
  const matches = content.matchAll(/#([\p{L}\p{N}_-]{2,30})/gu)
  for (const m of matches) out.add(m[1].toLowerCase())
  return [...out]
}

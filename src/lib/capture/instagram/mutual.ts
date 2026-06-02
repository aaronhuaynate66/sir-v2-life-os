// SIR V2 — Parser determinístico de la línea de "seguidores en común" (Instagram).
//
// Instagram muestra, en perfiles de terceros, una línea de prueba social:
//   ES: "its_almendrita, adrian.prog y 12 más siguen esta cuenta"
//   ES: "Seguido por its_almendrita y adrian.prog"
//   EN: "Followed by its_almendrita, adrian.prog and 12 others"
//
// El extractor de Visión copia esa línea LITERAL (campo mutualFollowersText,
// bajo riesgo de invento). Acá la convertimos en estructura — PURO y testeable,
// sin LLM, mismo criterio que el resto del pipeline de captura.
//
// Salida: handles explícitamente nombrados + conteo total (nombrados + "N más").

export interface InstagramMutualFollowers {
  /** Handles/nombres explícitamente nombrados en la línea (sin '@', literal). */
  named: string[]
  /** Conteo total: nombrados + el "N más"/"N others" si aparece. null si no
   *  hay forma de inferir ningún número (línea sin nombres ni conteo). */
  totalCount: number | null
}

/** Prefijos que Instagram antepone ("Seguido por", "Followed by"). */
const LEADING_RE = /^\s*(?:seguid[oa]s?\s+por|followed\s+by)\s*:?\s*/i

/** Sufijos de cierre ("… siguen esta cuenta", "… follow this account"). */
const TRAILING_RE =
  /\s*(?:siguen?\s+esta\s+cuenta|follows?\s+this\s+account)\s*\.?\s*$/i

/** Cláusula "y N más" / "and N others" / "y N personas más" / "and N more". */
const MORE_RE =
  /[,\s]*(?:\by\b|\band\b)?\s*([\d][\d.,\s]*)\s*(?:personas?\s+)?(?:más|mas|others|more)\b/i

/** Quita un '@' inicial y espacios. */
function cleanToken(t: string): string {
  let s = t.trim()
  if (s.startsWith('@')) s = s.slice(1)
  return s.trim()
}

/** "12" / "1.234" / "1,234" -> 12 / 1234 / 1234. null si no parsea. */
function parseIntLoose(raw: string): number | null {
  const digits = raw.replace(/[.,\s]/g, '')
  if (!/^\d+$/.test(digits)) return null
  const n = Number.parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Parsea la línea de seguidores en común a `{ named, totalCount }`.
 *
 * - Soporta español ("y N más siguen esta cuenta", "Seguido por …") e inglés
 *   ("and N others", "Followed by …").
 * - `named`: los handles/nombres listados (dedup, sin '@', orden de aparición).
 * - `totalCount`: named.length + el "N más" si aparece; si no hay "N más",
 *   es named.length; null sólo si no hay ni nombres ni número.
 *
 * No inventa: si la línea no matchea nada reconocible, devuelve named=[] y
 * totalCount=null (el caller lo trata como "datos insuficientes").
 */
export function parseMutualFollowers(rawInput: string | null | undefined): InstagramMutualFollowers {
  const empty: InstagramMutualFollowers = { named: [], totalCount: null }
  if (typeof rawInput !== 'string') return empty

  let s = rawInput.trim()
  if (s.length === 0) return empty

  // 1. Recortar prefijo/sufijo de Instagram.
  s = s.replace(LEADING_RE, '').replace(TRAILING_RE, '')

  // 2. Extraer y remover la cláusula "y N más" / "and N others".
  let more: number | null = null
  const moreMatch = s.match(MORE_RE)
  if (moreMatch) {
    more = parseIntLoose(moreMatch[1])
    s = s.slice(0, moreMatch.index).trim()
  }

  // 3. Lo que queda son los nombres, separados por comas o " y " / " and ".
  const tokens = s
    .split(/\s*,\s*|\s+y\s+|\s+and\s+/i)
    .map(cleanToken)
    // Descartar vacíos y tokens puramente numéricos (residuos del parseo).
    .filter((t) => t.length > 0 && !/^[\d.,]+$/.test(t))

  // Dedup conservando orden.
  const seen = new Set<string>()
  const named: string[] = []
  for (const t of tokens) {
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    named.push(t)
  }

  if (named.length === 0 && more === null) return empty

  const totalCount = named.length + (more ?? 0)
  return { named, totalCount: totalCount > 0 ? totalCount : null }
}

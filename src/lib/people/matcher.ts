// SIR V2 — Person matcher (modulo compartido entre /api/people/search y
// /api/capture/process).
//
// Toma señales (nombre, @handle, URL LinkedIn, telefono) y devuelve
// candidatos rankeados desde la tabla `people` del user actual.
//
// Politica de auto-link (Sesion 2.7, BUG-002):
//   - Auto-link SOLO con match exacto fuerte:
//       * instagram_handle exacto (case-insensitive, sin @)
//       * linkedin_url exacto (case-insensitive)
//       * phone_number normalizado exacto
//   - Matches por nombre/alias/substring -> NUNCA auto-link.
//     El usuario elige desde el bloque "¿Es alguna de estas personas?".
//
// Normalizacion de telefono:
//   - Quitar espacios, guiones, parentesis, puntos.
//   - Si arranca con '+', conservar el resto numerico.
//   - Si arranca con '00', convertir a '+' equivalent (00X -> +X).
//   - Heuristica Peru: si los 9 digitos finales son "9XXXXXXXX" y NO
//     hay prefijo, asumir +51.
//   - Si empieza con '0' (formato local con 0 inicial), quitarlo.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MatcherSignals {
  /** Nombre completo o display name (linkedin fullName, whatsapp displayName). */
  name?: string | null
  /** Handle de Instagram sin '@'. */
  handle?: string | null
  /** URL completa de perfil LinkedIn. */
  linkedinUrl?: string | null
  /** Numero de telefono crudo (cualquier formato visible). */
  phone?: string | null
}

export interface ScoredCandidate {
  id: string
  name: string
  slug: string | null
  alias: string | null
  relationship: string | null
  category: string | null
  importance_score: number | null
  instagram_handle: string | null
  linkedin_url: string | null
  phone_number: string | null
  matchScore: number
  matchReason: string
}

export interface MatcherResult {
  candidates: ScoredCandidate[]
  /** Si el matcher decidio auto-link, lleva el id de la persona y la
   *  razon. SOLO se setea para handle/URL/phone exactos. */
  autoLink: { personId: string; reason: string } | null
}

interface PeopleRow {
  id: string
  name: string | null
  slug: string | null
  alias: string | null
  relationship: string | null
  category: string | null
  importance_score: number | null
  instagram_handle: string | null
  linkedin_url: string | null
  phone_number: string | null
}

// ─── normalizaciones ────────────────────────────────────────────────

/**
 * Strip emojis + ruido, fold NFD (Díaz -> Diaz), manteniendo letras,
 * digitos, espacio y '@._-'.
 *
 * El fold de acentos no es la causa raiz del BUG-002 (el tramo
 * "diana carolina" del caso real no tiene acentos), pero hace falta
 * para que "Diana Carolina Diaz Sanchez" matchee con un row guardado
 * como "Diana Díaz" o "Díaz" — escenarios reales en español.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^\p{L}\p{N}@._\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokeniza un nombre normalizado: NFD + strip diacritics + lowercase +
 *  split por espacio + filter empty. */
function tokenizeName(s: string): string[] {
  return normalizeName(s)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

/** True si `a` es prefijo ORDENADO de `b` (mismos tokens en mismo orden
 *  desde el indice 0). Asume |a| <= |b|. */
function isOrderedPrefix(a: string[], b: string[]): boolean {
  if (a.length === 0 || a.length > b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** True si todos los tokens de `a` (set) estan presentes en `b` (set). */
function isTokenSubset(a: string[], b: string[]): boolean {
  if (a.length === 0) return false
  const setB = new Set(b)
  return a.every((t) => setB.has(t))
}

/** Strip '@' + trim + lowercase. */
export function normalizeHandle(s: string): string {
  return s.replace(/^@/, '').trim().toLowerCase()
}

/** Trim + lowercase + collapse trailing slash. */
export function normalizeLinkedInUrl(s: string): string {
  return s.trim().toLowerCase().replace(/\/+$/g, '')
}

/**
 * Normalizacion de telefono robusta para comparacion.
 *
 * Pasos:
 *   1. Strip caracteres no relevantes (espacios, guiones, parentesis, puntos).
 *   2. Convertir "00X..." a "+X..." (prefijo internacional).
 *   3. Si empieza con '0', quitarlo (formato local con prefijo de salida).
 *   4. Si solo quedan 9 digitos arrancando en '9' -> asumir +51 (Peru).
 *
 * Devuelve string solo con "+" + digitos, o "" si quedo vacio.
 *
 * Ejemplos:
 *   "+51 999 888 777"      -> "+51999888777"
 *   "(051) 999-888-777"    -> "+51999888777" (asume 0 inicial peruano)
 *   "999 888 777"          -> "+51999888777" (heuristica Peru)
 *   "0051999888777"        -> "+51999888777"
 *   "+1 (555) 123-4567"    -> "+15551234567"
 */
export function normalizePhone(s: string): string {
  if (!s) return ''
  let cleaned = s.replace(/[\s\-().]/g, '')
  if (cleaned.length === 0) return ''

  // 00X... -> +X...
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2)
  }

  // Solo digitos + (opcional) '+' al inicio. Cualquier otra cosa: descartar.
  const m = cleaned.match(/^(\+?)(\d+)$/)
  if (!m) return ''
  let prefix = m[1]
  let digits = m[2]

  if (!prefix) {
    // Sin '+' explicito: ver heuristicas locales.
    if (digits.startsWith('0') && digits.length > 9) {
      // Formato local con 0 inicial (ej. 051 999...).
      digits = digits.slice(1)
      prefix = '+'
    } else if (digits.length === 9 && digits.startsWith('9')) {
      // Heuristica Peru: 9XXXXXXXX -> +51 9XXXXXXXX
      prefix = '+51'
    }
  }

  return `${prefix}${digits}`
}

// ─── scoring ─────────────────────────────────────────────────────────

interface ScoreContext {
  /** Lower-cased name normalizado del query. */
  name?: string
  /** Handle normalizado (sin @, lowercase). */
  handle?: string
  /** URL LinkedIn normalizada (lowercase, sin trailing /). */
  linkedinUrl?: string
  /** Telefono normalizado (+digits). */
  phone?: string
}

interface ScoredHit {
  score: number
  reason: string
  /** Si fue un match EXACTO en columna identificadora (handle/url/phone),
   *  es candidato a auto-link. */
  isExactStrong: boolean
}

function scoreRow(row: PeopleRow, ctx: ScoreContext): ScoredHit {
  const rowName = normalizeName(row.name ?? '').toLowerCase()
  const rowAlias = normalizeName(row.alias ?? '').toLowerCase()
  const rowSlug = (row.slug ?? '').toLowerCase()
  const rowHandle = normalizeHandle(row.instagram_handle ?? '')
  const rowLinkedin = normalizeLinkedInUrl(row.linkedin_url ?? '')
  const rowPhone = normalizePhone(row.phone_number ?? '')

  // ─── 1. Señales EXACTAS fuertes (candidatas a auto-link) ──────────
  if (ctx.handle && rowHandle && rowHandle === ctx.handle) {
    return { score: 100, reason: 'exact_handle', isExactStrong: true }
  }
  if (ctx.linkedinUrl && rowLinkedin && rowLinkedin === ctx.linkedinUrl) {
    return { score: 100, reason: 'exact_linkedin_url', isExactStrong: true }
  }
  if (ctx.phone && rowPhone && rowPhone === ctx.phone) {
    return { score: 100, reason: 'exact_phone', isExactStrong: true }
  }

  // ─── 2. Señales por NOMBRE (token-based + BIDIRECCIONAL) ──────────
  //
  // BUG-002 raiz (validacion PR #87 v1): los checks unidireccionales
  // (rowName.startsWith(q) || rowName.includes(q)) NUNCA matchean cuando
  // el query es MAS LARGO que el guardado — un string corto no puede
  // startsWith/includes a uno mas largo. Caso real: rowName="diana carolina"
  // (guardado), q="diana carolina diaz sanchez" (extractor) -> 0 hits.
  //
  // Fix: tokenizar ambos, comparar bidireccional con sets/prefijo.
  if (ctx.name) {
    const qTokens = tokenizeName(ctx.name)

    if (qTokens.length > 0) {
      const nameTokens = tokenizeName(row.name ?? '')
      const aliasTokens = tokenizeName(row.alias ?? '')

      // 2a. exact_name: sets de tokens iguales (ignora orden + duplicados).
      const setQ = new Set(qTokens)
      const setName = new Set(nameTokens)
      const setAlias = new Set(aliasTokens)
      const setsEqual = (a: Set<string>, b: Set<string>) =>
        a.size === b.size && a.size > 0 && Array.from(a).every((t) => b.has(t))
      if (setsEqual(setQ, setName) || setsEqual(setQ, setAlias)) {
        return { score: 95, reason: 'exact_name', isExactStrong: false }
      }

      // 2b. exact_slug (sin tokens — slug es atomico).
      if (rowSlug && rowSlug === ctx.name) {
        return { score: 90, reason: 'exact_slug', isExactStrong: false }
      }

      // 2c. name_prefix: los tokens del MAS CORTO son prefijo ORDENADO
      // del mas largo. ej.: ["diana","carolina"] prefijo de
      // ["diana","carolina","diaz","sanchez"] -> match.
      const prefixHit = (a: string[], b: string[]) =>
        a.length > 0 &&
        b.length > 0 &&
        (a.length <= b.length ? isOrderedPrefix(a, b) : isOrderedPrefix(b, a))
      if (prefixHit(qTokens, nameTokens) || prefixHit(qTokens, aliasTokens)) {
        return { score: 70, reason: 'name_prefix', isExactStrong: false }
      }

      // 2d. name_subset: todos los tokens del MAS CORTO ⊆ tokens del
      // mas largo (orden libre). ej.: query "carolina diaz" contra
      // row "diana carolina diaz sanchez".
      const subsetHit = (a: string[], b: string[]) =>
        a.length > 0 &&
        b.length > 0 &&
        (a.length <= b.length ? isTokenSubset(a, b) : isTokenSubset(b, a))
      if (subsetHit(qTokens, nameTokens) || subsetHit(qTokens, aliasTokens)) {
        return { score: 60, reason: 'name_subset', isExactStrong: false }
      }

      // 2e. name_substring: fallback bidireccional sobre strings completos
      // (cubre casos sin espacios o con caracteres especiales).
      const q = ctx.name
      if (
        (rowName && (rowName.includes(q) || q.includes(rowName))) ||
        (rowAlias && (rowAlias.includes(q) || q.includes(rowAlias)))
      ) {
        return { score: 50, reason: 'name_substring', isExactStrong: false }
      }
    }
  }

  // ─── 3. Señales WEAK (prefijo/substring sobre handle/url/phone) ───
  if (ctx.handle && rowHandle) {
    if (rowHandle.startsWith(ctx.handle))
      return { score: 65, reason: 'handle_prefix', isExactStrong: false }
    if (rowHandle.includes(ctx.handle))
      return { score: 45, reason: 'handle_substring', isExactStrong: false }
  }
  if (ctx.linkedinUrl && rowLinkedin && rowLinkedin.includes(ctx.linkedinUrl) && ctx.linkedinUrl.length >= 6) {
    return { score: 75, reason: 'linkedin_substring', isExactStrong: false }
  }
  if (ctx.phone && rowPhone) {
    const qDigits = ctx.phone.replace(/[^\d]/g, '')
    const rowDigits = rowPhone.replace(/[^\d]/g, '')
    if (qDigits.length >= 7 && (rowDigits.includes(qDigits) || qDigits.includes(rowDigits))) {
      return { score: 75, reason: 'phone_partial', isExactStrong: false }
    }
  }

  return { score: 0, reason: 'no_match', isExactStrong: false }
}

// ─── API publica ─────────────────────────────────────────────────────

/**
 * Construye el ScoreContext desde señales crudas (las viene a normalizar
 * aca para que el caller no se preocupe).
 */
export function buildContext(signals: MatcherSignals): ScoreContext {
  const ctx: ScoreContext = {}
  if (signals.name) {
    const n = normalizeName(signals.name).toLowerCase()
    if (n.length >= 2) ctx.name = n
  }
  if (signals.handle) {
    const h = normalizeHandle(signals.handle)
    if (h.length >= 2) ctx.handle = h
  }
  if (signals.linkedinUrl) {
    const u = normalizeLinkedInUrl(signals.linkedinUrl)
    if (u.length >= 6) ctx.linkedinUrl = u
  }
  if (signals.phone) {
    const p = normalizePhone(signals.phone)
    if (p.length >= 6) ctx.phone = p
  }
  return ctx
}

/**
 * Lookup contra `people` (RLS-protected) y ranking sobre TODAS las
 * señales provistas. Devuelve top 10 + decision de auto-link.
 *
 * Volumen esperado <500 personas → fetch + filter en memoria es trivial.
 */
export async function findCandidates(
  supabase: SupabaseClient,
  userId: string,
  signals: MatcherSignals,
): Promise<MatcherResult> {
  const ctx = buildContext(signals)
  const hasSignal = Boolean(ctx.name || ctx.handle || ctx.linkedinUrl || ctx.phone)
  if (!hasSignal) {
    return { candidates: [], autoLink: null }
  }

  const { data, error } = await supabase
    .from('people')
    .select(
      'id, name, slug, alias, relationship, category, importance_score, instagram_handle, linkedin_url, phone_number',
    )
    .eq('user_id', userId)

  if (error || !data) {
    return { candidates: [], autoLink: null }
  }

  const rows = data as unknown as PeopleRow[]
  let autoLink: MatcherResult['autoLink'] = null
  const scored: ScoredCandidate[] = []

  for (const row of rows) {
    const hit = scoreRow(row, ctx)
    if (hit.score === 0) continue
    scored.push({
      id: row.id,
      name: row.name ?? '(sin nombre)',
      slug: row.slug,
      alias: row.alias,
      relationship: row.relationship,
      category: row.category,
      importance_score: row.importance_score,
      instagram_handle: row.instagram_handle,
      linkedin_url: row.linkedin_url,
      phone_number: row.phone_number,
      matchScore: hit.score,
      matchReason: hit.reason,
    })
    if (hit.isExactStrong && !autoLink) {
      autoLink = { personId: row.id, reason: hit.reason }
    }
  }

  scored.sort((a, b) => b.matchScore - a.matchScore)
  return { candidates: scored.slice(0, 10), autoLink }
}

// SIR V2 — Inferencia de TONO de una captura de conversación → calidad 1-5.
//
// Contexto: el extractor de DM/WhatsApp (single capture) devuelve
// `emotionalStates {user, otherPerson}` como TEXTO libre en español
// ("feliz", "agradecido", "molesto"…) + un `summary`, pero NO un número.
// La Reciprocidad del relationalScore se alimenta de person_logs
// kind='interaction' con value 1-5 (QUALITY_DELTA). Hasta ahora un DM solo
// subía last_contact (Fuerza por recencia) y NO movía la Reciprocidad.
//
// Este módulo deriva un value 1-5 con un léxico de sentimiento ES (sin LLM:
// cero latencia/costo, determinístico → testeable). Devuelve `null` cuando NO
// hay señal de sentimiento → en ese caso NO insertamos nada (no contaminamos
// la Reciprocidad con un neutro inventado). Decisión: ante la duda, no escribir.

/** Raíces positivas (match por inclusión, en minúsculas y sin tildes). */
const POSITIVE_ROOTS: readonly string[] = [
  'feliz', 'felicidad', 'content', 'alegr', 'agradec', 'gracias', 'carin',
  'afecto', 'amor', 'querid', 'emocion', 'entusias', 'orgull', 'tranquil',
  'paz', 'genial', 'excelente', 'buenisim', 'encant', 'apoy', 'celebr',
  'risas', 'divert', 'esperanz', 'optimis', 'motivad', 'conexion', 'cercan',
  'abrazo', 'calid', 'gust', 'disfrut', 'reconcili', 'reir',
]

/** Raíces negativas. */
const NEGATIVE_ROOTS: readonly string[] = [
  'triste', 'molest', 'enoj', 'enfad', 'frustr', 'decepcion', 'dolor',
  'herid', 'preocup', 'ansied', 'ansios', 'miedo', 'temor', 'conflicto',
  'pelea', 'discut', 'distante', 'frio', 'fria', 'ignor', 'rechaz', 'llor',
  'angusti', 'estres', 'tension', 'tens', 'incomod', 'soledad', 'abandon',
  'resentid', 'rencor', 'culpa', 'verguenza', 'cansad', 'hart',
  'indiferen', 'reclam', 'quej', 'reproch',
]

/** Quita tildes y baja a minúsculas para un match robusto. */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function countRoots(haystack: string, roots: readonly string[]): number {
  let n = 0
  for (const r of roots) if (haystack.includes(r)) n++
  return n
}

export interface ToneSignalInput {
  emotionalStates?: { user?: string | null; otherPerson?: string | null } | null
  summary?: string | null
  topics?: readonly string[] | null
}

export interface InferredTone {
  /** Calidad 1-5 para person_logs.value. */
  quality: number
  positive: number
  negative: number
  /** Resumen corto del estado emocional, para la nota del log. */
  emoLabel: string | null
}

/**
 * Deriva la calidad 1-5 desde el estado emocional + resumen.
 * `null` si no hay NINGUNA señal de sentimiento (no escribir en ese caso).
 * Las `emotionalStates` pesan doble; `summary`/`topics` refuerzan (peso 1).
 */
export function inferInteractionQuality(input: ToneSignalInput): InferredTone | null {
  const emoUser = input.emotionalStates?.user ?? ''
  const emoOther = input.emotionalStates?.otherPerson ?? ''
  const emoText = normalize(`${emoUser} ${emoOther}`)
  const ctxText = normalize(`${input.summary ?? ''} ${(input.topics ?? []).join(' ')}`)

  const pos = countRoots(emoText, POSITIVE_ROOTS) * 2 + countRoots(ctxText, POSITIVE_ROOTS)
  const neg = countRoots(emoText, NEGATIVE_ROOTS) * 2 + countRoots(ctxText, NEGATIVE_ROOTS)

  if (pos === 0 && neg === 0) return null // sin señal → no inventamos un neutro

  const net = pos - neg
  let quality: number
  if (net >= 3) quality = 5
  else if (net >= 1) quality = 4
  else if (net === 0) quality = 3 // señal mixta
  else if (net >= -2) quality = 2
  else quality = 1

  const emoParts = [String(emoUser).trim(), String(emoOther).trim()].filter(Boolean)
  const emoLabel = emoParts.length > 0 ? emoParts.join(' / ').slice(0, 80) : null

  return { quality, positive: pos, negative: neg, emoLabel }
}

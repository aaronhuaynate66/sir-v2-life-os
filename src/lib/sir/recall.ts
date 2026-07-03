// SIR V2 — C3: recall cross-session de conversaciones con SIR.
//
// Capa PURA sobre sir_conversations (mig 0121). Dos responsabilidades:
//   1. Decidir qué intercambios vale la pena PERSISTIR (no todos: un "hola" o una
//      respuesta de error no son memoria útil).
//   2. Renderizar los intercambios pasados recuperados como un bloque de contexto
//      para el prompt, marcando la antigüedad ("hace 3 días") sin fechas crudas.
//
// La red (embeddear, match_sir_conversations, insert) vive en /api/sir/ask y es
// toda fail-open: sin OPENAI_API_KEY o sin la tabla 0121, esto simplemente no
// aporta ni persiste, y la respuesta sale igual.

/** Un intercambio pasado recuperado por similitud. */
export interface RecallHit {
  question: string
  answer: string
  createdAt: string | null
  similarity: number
}

const MIN_Q_LEN = 8
const MIN_A_LEN = 20

/**
 * ¿Vale la pena guardar este intercambio como memoria recuperable?
 * Filtra saludos/monosílabos y respuestas de error o vacías. Conservador: ante
 * la duda NO guarda (mejor no contaminar el recall con ruido).
 */
export function shouldPersistExchange(question: string, answer: string): boolean {
  const q = question.trim()
  const a = answer.trim()
  if (q.length < MIN_Q_LEN || a.length < MIN_A_LEN) return false
  // Respuestas que son claramente un error/negativa de sistema no son memoria.
  const low = a.toLowerCase()
  if (low.startsWith('no pude') || low.startsWith('no tengo') || low.startsWith('error')) return false
  return true
}

/** Antigüedad legible en español a partir de días. */
export function agoLabel(days: number): string {
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 14) return 'la semana pasada'
  if (days < 31) return `hace ${Math.round(days / 7)} semanas`
  if (days < 60) return 'el mes pasado'
  return `hace ${Math.round(days / 30)} meses`
}

/** Días entre `createdAt` y `nowISO` (ambos ISO). 0 si no parsea. */
export function daysBetween(createdAt: string | null, nowISO: string): number {
  if (!createdAt) return 0
  const a = Date.parse(createdAt)
  const b = Date.parse(nowISO)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.floor((b - a) / 86_400_000))
}

/** Recorta un texto a `max` chars con elipsis. */
function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Renderiza el bloque de recall para el prompt. Devuelve '' si no hay hits
 * (así el caller lo concatena sin condicionales). Ordena por más reciente.
 */
export function renderRecallBlock(hits: RecallHit[], nowISO: string): string {
  const usable = hits.filter((h) => h.question.trim() && h.answer.trim())
  if (usable.length === 0) return ''
  const lines = usable
    .slice(0, 5)
    .map((h) => {
      const when = agoLabel(daysBetween(h.createdAt, nowISO))
      return `- (${when}) Preguntaste: "${clip(h.question, 140)}" → le dijiste: "${clip(h.answer, 220)}"`
    })
  return [
    'DE CONVERSACIONES ANTERIORES (para dar continuidad; citalas solo si vienen al caso, no las repitas porque sí):',
    ...lines,
  ].join('\n')
}

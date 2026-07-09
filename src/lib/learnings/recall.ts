// SIR V2 — Fase 3d: recall de lecciones durables para el contexto de consejo. PURO.
//
// Las lecciones (tabla learnings, mig 0140) son pocas y siempre relevantes: son
// lo que SIR aprendió de Aaron y debe tener presente al aconsejar. Este módulo
// las renderiza como un bloque de contexto para inyectar en el prompt de
// /api/sir/ask (y afines). Todo fail-open: sin lecciones → '' (el caller concatena
// sin condicionales).

export interface Learning {
  text: string
  kind: 'preference' | 'pattern' | 'principle' | 'fact'
  confidence: 'high' | 'medium' | 'low'
  reinforcedCount: number
}

/** Fila cruda de learnings (snake_case). */
export interface LearningRow {
  text: string
  kind: string | null
  confidence: string | null
  reinforced_count: number | null
}

const VALID_KIND = new Set(['preference', 'pattern', 'principle', 'fact'])
const VALID_CONF = new Set(['high', 'medium', 'low'])

export function rowToLearning(row: LearningRow): Learning {
  return {
    text: (row.text ?? '').trim(),
    kind: (VALID_KIND.has(row.kind ?? '') ? row.kind : 'pattern') as Learning['kind'],
    confidence: (VALID_CONF.has(row.confidence ?? '') ? row.confidence : 'medium') as Learning['confidence'],
    reinforcedCount: Math.max(1, row.reinforced_count ?? 1),
  }
}

const KIND_LABEL: Record<Learning['kind'], string> = {
  preference: 'preferencia',
  pattern: 'patrón',
  principle: 'principio',
  fact: 'hecho',
}

/**
 * Ordena las lecciones por relevancia para el consejo: primero los principios
 * (prioridades que Aaron sostiene), luego lo más reforzado / de mayor confianza.
 */
export function sortLearnings(ls: Learning[]): Learning[] {
  const kindRank: Record<Learning['kind'], number> = { principle: 0, pattern: 1, preference: 2, fact: 3 }
  const confRank: Record<Learning['confidence'], number> = { high: 0, medium: 1, low: 2 }
  return [...ls].sort((a, b) =>
    kindRank[a.kind] - kindRank[b.kind] ||
    b.reinforcedCount - a.reinforcedCount ||
    confRank[a.confidence] - confRank[b.confidence],
  )
}

/**
 * Renderiza el bloque de lecciones para el prompt. '' si no hay ninguna. Cap a
 * `limit` (default 20) — son pocas por diseño, pero no inflamos el prompt.
 */
export function renderLearningsBlock(learnings: Learning[], limit = 20): string {
  const usable = sortLearnings(learnings.filter((l) => l.text.trim())).slice(0, limit)
  if (usable.length === 0) return ''
  const lines = usable.map((l) => `- [${KIND_LABEL[l.kind]}] ${l.text}`)
  return [
    'LO QUE APRENDISTE DE AARON (tenelo presente al aconsejar; es memoria durable, no la repitas porque sí):',
    ...lines,
  ].join('\n')
}

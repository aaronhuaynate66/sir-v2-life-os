// SIR V2 — Ledger de sugerencias (suggestions, mig 0153). Tipos + normalizadores
// PUROS. La pieza fundacional del "cerebro que se retroalimenta": cada sugerencia
// que SIR emite y su ciclo de vida (estado + feedback 👍/👎 + outcome).

export type SuggestionSurface = 'chat' | 'momentos' | 'panel' | 'forecast'
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed' | 'done'
export type SuggestionFeedback = 'up' | 'down'
export type SuggestionOutcome = 'worked' | 'didnt' | 'unknown'

export interface Suggestion {
  id: string
  surface: SuggestionSurface
  kind: string
  title: string | null
  status: SuggestionStatus
  feedback: SuggestionFeedback | null
  outcome: SuggestionOutcome | null
  createdAt: string
  resolvedAt: string | null
}

const STATUSES: readonly SuggestionStatus[] = ['pending', 'accepted', 'dismissed', 'done']
const SURFACES: readonly SuggestionSurface[] = ['chat', 'momentos', 'panel', 'forecast']

/** ¿El estado marca la sugerencia como RESUELTA (para setear resolved_at)? */
export function isResolvedStatus(s: SuggestionStatus): boolean {
  return s === 'accepted' || s === 'dismissed' || s === 'done'
}

export function normalizeStatus(v: unknown): SuggestionStatus | null {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v) ? (v as SuggestionStatus) : null
}
export function normalizeSurface(v: unknown): SuggestionSurface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v) ? (v as SuggestionSurface) : 'chat'
}
export function normalizeFeedback(v: unknown): SuggestionFeedback | null {
  return v === 'up' || v === 'down' ? v : null
}
export function normalizeOutcome(v: unknown): SuggestionOutcome | null {
  return v === 'worked' || v === 'didnt' || v === 'unknown' ? v : null
}

/** Mapea una fila cruda de Supabase a Suggestion tipada (tolerante). */
export function rowToSuggestion(r: Record<string, unknown>): Suggestion {
  return {
    id: String(r.id ?? ''),
    surface: normalizeSurface(r.surface),
    kind: typeof r.kind === 'string' ? r.kind : 'answer',
    title: typeof r.title === 'string' ? r.title : null,
    status: normalizeStatus(r.status) ?? 'pending',
    feedback: normalizeFeedback(r.feedback),
    outcome: normalizeOutcome(r.outcome),
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : null,
  }
}

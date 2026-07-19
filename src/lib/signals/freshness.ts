// SIR V2 — Frescura de señales para el brief matutino. PURO, testeable.
//
// Bug real (jul-2026): una señal de FC del 1-jun quedó ABIERTA y el brief la
// resurgía como "Atención:" cada día por 7 semanas, aunque la data posterior la
// desmentía — y el cerebro Q&A la contradecía. Regla: el brief solo debe empujar
// señales que siguen siendo NOTICIA. Una señal no-crítica que lleva semanas
// abierta sin resolverse ya no es "atención de hoy"; se deja para el panel, no
// para el push. Las críticas SÍ persisten (esas querés verlas hasta resolverlas).

export interface RankableSignal {
  content: string
  urgency: string
  /** ISO de creación. */
  createdAt?: string | null
}

const RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
/** Días tras los cuales una señal NO-crítica deja de empujarse en el push. */
export const STALE_SIGNAL_DAYS = 21

/**
 * Elige la señal a empujar en el brief: la de mayor urgencia entre las que
 * siguen siendo NOTICIA. Descarta las rancias (más viejas que `staleDays`) salvo
 * las 'critical', que persisten. Devuelve el content, o null si no queda ninguna.
 * PURO.
 */
export function pickTopSignal(
  signals: RankableSignal[],
  nowMs: number,
  staleDays = STALE_SIGNAL_DAYS,
): string | null {
  const staleMs = staleDays * 86_400_000
  const fresh = signals.filter((s) => {
    if (s.urgency === 'critical') return true // crítico persiste hasta resolverse
    if (!s.createdAt) return true // sin fecha → no podemos juzgar antigüedad, se conserva
    const t = Date.parse(s.createdAt)
    if (!Number.isFinite(t)) return true
    return nowMs - t <= staleMs
  })
  if (fresh.length === 0) return null
  fresh.sort((a, b) => (RANK[b.urgency] ?? 0) - (RANK[a.urgency] ?? 0))
  return fresh[0].content || null
}

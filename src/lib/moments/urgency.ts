// SIR V2 — Cálculo puro de urgencia de un follow-up.
//
// Extraído de PendientesConPersona.tsx para poder testearse sin JSX. Reusable
// en otros consumidores (agenda, brief, panel de acciones del día).

export type Urgency = 'overdue' | 'dueSoon' | 'later' | 'sinFecha'

const DAY_MS = 86_400_000

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Compara `followUpOn` (YYYY-MM-DD o ISO) contra `todayYmd` (YYYY-MM-DD).
 *  overdue = ya pasó, dueSoon = 0..3 días, later = >3, sinFecha = null. */
export function urgencyOf(followUpOn: string | null, todayYmd: string): { urgency: Urgency; deltaDays: number | null } {
  if (!followUpOn) return { urgency: 'sinFecha', deltaDays: null }
  const [y1, m1, d1] = todayYmd.split('-').map(Number)
  const [y2, m2, d2] = followUpOn.slice(0, 10).split('-').map(Number)
  const t = new Date(y1, m1 - 1, d1).getTime()
  const f = new Date(y2, m2 - 1, d2).getTime()
  const delta = Math.round((f - t) / DAY_MS)
  if (delta < 0) return { urgency: 'overdue', deltaDays: delta }
  if (delta <= 3) return { urgency: 'dueSoon', deltaDays: delta }
  return { urgency: 'later', deltaDays: delta }
}

export function labelDelta(u: Urgency, delta: number | null): string {
  if (u === 'sinFecha' || delta == null) return 'sin fecha'
  if (delta < 0) return delta === -1 ? 'ayer' : `hace ${Math.abs(delta)} días`
  if (delta === 0) return 'hoy'
  if (delta === 1) return 'mañana'
  return `en ${delta} días`
}

export const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, dueSoon: 1, later: 2, sinFecha: 3 }

// SIR V2 — Aprendizaje / feedback loop (A8, "Capa 9"). PURO.
//
// Cierra el bucle de la base científica: hasta ahora SIR recomendaba pero no
// observaba el RESULTADO. Acá aprende qué TIPO de acción efectivamente te sube
// la paz. Cuando marcás una recomendación como hecha, se registra la paz de ese
// momento (peaceBefore); N días después miramos tu paz (peaceAfter, de la serie
// de snapshots) y computamos el delta por tipo. Es "la parte analítica que
// cierra el loop". Determinístico.

import type { PriorityDomain } from '../priority'

export interface FeedbackEvent {
  /** Tipo de acción: el RecommendationType ('rest'|'connect'|…) o 'decision'. */
  type: string
  domain: PriorityDomain
  /** Paz (0-10) al momento de actuar. */
  peaceBefore: number
  /** ISO del momento en que actuaste. */
  at: string
}

/** Punto de la serie de paz (peaceScore de los snapshots). */
export interface PeacePoint { date: string; value: number }

export interface Effectiveness {
  type: string
  /** Delta promedio de paz (after - before) tras actuar sobre este tipo. */
  avgDelta: number
  /** Eventos con outcome ya medible. */
  n: number
  confidence: 'low' | 'medium' | 'high'
  verdict: 'helps' | 'neutral' | 'hurts' | 'insufficient'
}

/** Cambios de paz menores a esto se consideran neutrales (ruido). */
export const EFFECT_DEADBAND = 0.3
/** Días que hay que esperar tras actuar para medir el outcome. */
export const OUTCOME_MIN_DAYS = 3

const DAY_MS = 86_400_000

/** Paz ~`minDays` después de `at` (el primer snapshot en/after esa fecha). null
 *  si el outcome aún no está (evento muy reciente). */
export function outcomePeace(at: string, peace: PeacePoint[], minDays = OUTCOME_MIN_DAYS): number | null {
  const t0 = Date.parse(at)
  if (!Number.isFinite(t0)) return null
  const cutoff = t0 + minDays * DAY_MS
  const after = peace
    .map((p) => ({ t: Date.parse(`${p.date.slice(0, 10)}T12:00:00Z`), v: p.value }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= cutoff)
    .sort((a, b) => a.t - b.t)
  return after.length ? after[0].v : null
}

/**
 * Efectividad por tipo de acción. Cada evento se empareja con la paz posterior
 * (outcomePeace); solo cuentan los que ya tienen outcome. Ordena de lo que MÁS
 * ayuda a lo que menos. PURO.
 */
export function computeEffectiveness(events: FeedbackEvent[], peace: PeacePoint[]): Effectiveness[] {
  const byType = new Map<string, number[]>()
  for (const e of events) {
    if (!Number.isFinite(e.peaceBefore)) continue
    const after = outcomePeace(e.at, peace)
    if (after == null) continue
    const arr = byType.get(e.type) ?? []
    arr.push(after - e.peaceBefore)
    byType.set(e.type, arr)
  }

  const out: Effectiveness[] = []
  for (const [type, deltas] of byType) {
    const n = deltas.length
    const avgDelta = Math.round((deltas.reduce((s, v) => s + v, 0) / n) * 100) / 100
    const confidence: Effectiveness['confidence'] = n >= 8 ? 'high' : n >= 3 ? 'medium' : 'low'
    const verdict: Effectiveness['verdict'] =
      n < 2 ? 'insufficient' : avgDelta > EFFECT_DEADBAND ? 'helps' : avgDelta < -EFFECT_DEADBAND ? 'hurts' : 'neutral'
    out.push({ type, avgDelta, n, confidence, verdict })
  }
  return out.sort((a, b) => b.avgDelta - a.avgDelta)
}

export interface WithTypeAndConfidence {
  type: string
  confidence: number
}

/**
 * Ajusta la confianza de recomendaciones según lo aprendido: sube las de tipos
 * que te AYUDAN, baja las que NO. Multiplicador suave, clamp 0..1. No muta.
 */
export function adjustByLearning<T extends WithTypeAndConfidence>(recs: T[], eff: Effectiveness[]): T[] {
  const byType = new Map(eff.map((e) => [e.type, e]))
  return recs.map((r) => {
    const e = byType.get(r.type)
    if (!e || e.verdict === 'insufficient') return r
    const factor = e.verdict === 'helps' ? 1.15 : e.verdict === 'hurts' ? 0.8 : 1
    return { ...r, confidence: Math.max(0, Math.min(1, Math.round(r.confidence * factor * 100) / 100)) }
  })
}

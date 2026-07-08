// SIR V2 — Recalibración del forecast conductual (Fase 2 del spec). PURO.
//
// Deriva la etiqueta (hit/partial/miss/noise) de lo que Aaron marcó que pasó, y
// computa el hit-rate por persona sobre el historial. Un EVENTO EXTERNO es ruido
// contextual — no cuenta como acierto ni error (§17). Con suficientes aciertos, el
// modelo pasa a "validado" (§13) → un pequeño boost de confianza.

export type FeedbackCategory =
  | 'periodo' | 'pms' | 'dolor' | 'medicacion' | 'conflicto' | 'distancia' | 'sensibilidad'
  | 'evento_externo' | 'no_paso_nada'

export type FeedbackLabel = 'hit' | 'partial' | 'miss' | 'noise'

// Categorías que confirman que APARECIÓ un patrón conductual/físico relevante.
const PATTERN_CATS: FeedbackCategory[] = ['periodo', 'pms', 'dolor', 'conflicto', 'distancia', 'sensibilidad']

/** Deriva la etiqueta desde las categorías marcadas. */
export function deriveLabel(categories: FeedbackCategory[]): FeedbackLabel {
  const set = new Set(categories)
  if (set.has('no_paso_nada') && !PATTERN_CATS.some((c) => set.has(c))) return 'miss'
  const patterns = PATTERN_CATS.filter((c) => set.has(c)).length
  if (patterns === 0 && set.has('evento_externo')) return 'noise' // ruido contextual
  if (patterns >= 2) return 'hit'
  if (patterns === 1) return set.has('evento_externo') ? 'partial' : 'hit'
  return 'miss'
}

export interface Recalibration {
  hits: number
  misses: number
  /** Aciertos / (aciertos + errores). Ruido excluido. null si no hay data válida. */
  hitRate: number | null
  /** Ventanas validadas (evaluadas, sin contar ruido). */
  evaluated: number
  /** ≥3 evaluadas con hitRate ≥0.6 → el forecast puede mostrarse como "validado". */
  validated: boolean
  /** Ajuste de confianza [-0.15, +0.15] para el próximo forecast. */
  confidenceDelta: number
}

/**
 * Aprende un multiplicador de peso por MODELO (§17): un modelo que fue dominante
 * en ventanas que acertaron sube; el que dominó en las que fallaron, baja. Necesita
 * ≥2 observaciones por modelo para ajustar (si no, queda en 1 = neutro). PURO.
 */
export function modelWeights(fb: { label: FeedbackLabel; models: string[] }[]): Record<string, number> {
  const stat: Record<string, { hit: number; n: number }> = {}
  for (const f of fb) {
    if (f.label === 'noise') continue // ruido no enseña
    for (const m of f.models ?? []) {
      stat[m] ??= { hit: 0, n: 0 }
      stat[m].n += 1
      if (f.label === 'hit') stat[m].hit += 1
      else if (f.label === 'partial') stat[m].hit += 0.5
    }
  }
  const out: Record<string, number> = {}
  for (const [m, s] of Object.entries(stat)) {
    if (s.n < 2) continue
    const rate = s.hit / s.n // 0..1
    out[m] = Math.round((0.75 + rate * 0.75) * 100) / 100 // 0→0.75, 0.5→1.13, 1→1.5
  }
  return out
}

/** Computa el estado de recalibración desde el historial de feedback. PURO. */
export function recalibrate(labels: FeedbackLabel[]): Recalibration {
  const hits = labels.filter((l) => l === 'hit').length
  const partials = labels.filter((l) => l === 'partial').length
  const misses = labels.filter((l) => l === 'miss').length
  const evaluated = hits + partials + misses // el ruido NO cuenta
  if (evaluated === 0) return { hits, misses, hitRate: null, evaluated: 0, validated: false, confidenceDelta: 0 }
  const hitRate = (hits + 0.5 * partials) / evaluated
  const validated = evaluated >= 3 && hitRate >= 0.6
  // Boost/penalización suave y acotada por el rendimiento observado.
  const confidenceDelta = Math.max(-0.15, Math.min(0.15, (hitRate - 0.5) * 0.3 * Math.min(1, evaluated / 4)))
  return { hits, misses, hitRate: Math.round(hitRate * 100) / 100, evaluated, validated, confidenceDelta }
}

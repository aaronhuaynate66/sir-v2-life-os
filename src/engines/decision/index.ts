// SIR V2 — Evaluador de decisiones en 7 dimensiones (A4). PURO.
//
// docs/01_COGNITIVE_ARCHITECTURE.md: "SIR evalúa cada decisión importante en
// función de" 7 dimensiones. Existían piezas sueltas (alignment, stakeholderImpact,
// conflictFriction) pero NO un scorer único, y "reversibilidad" no estaba en el
// código. Acá está el scorer: puntúa las 7, pondera por la jerarquía de dominio
// (A3, peace/salud pesan más) y da un veredicto. La reversibilidad NO pondera:
// es un GATE (una decisión irreversible exige más confianza para un 'go').

import { PRIORITY_LEVEL, type PriorityDomain } from '../priority'

export type DecisionDimension =
  | 'peace' | 'values' | 'biological' | 'financial' | 'alignment' | 'relational' | 'timing' | 'reversibility'

/** Orden canónico (paz primero, reversibilidad al final como gate). */
export const DECISION_DIMENSIONS: DecisionDimension[] = [
  'peace', 'values', 'biological', 'financial', 'alignment', 'relational', 'timing', 'reversibility',
]

export const DIMENSION_LABEL: Record<DecisionDimension, string> = {
  peace: 'Paz mental',
  values: 'Alineación con tus valores',
  biological: 'Costo biológico',
  financial: 'Impacto financiero',
  alignment: 'Alineación con objetivos',
  relational: 'Impacto en relaciones',
  timing: 'Timing',
  reversibility: 'Reversibilidad',
}

/** Dimensiones que mapean a un dominio de la jerarquía (para ponderar). */
const DIMENSION_DOMAIN: Partial<Record<DecisionDimension, PriorityDomain>> = {
  peace: 'peace',
  biological: 'health',
  financial: 'finance',
  alignment: 'personal',
  relational: 'relational',
}

/** Peso de cada dimensión. values = alto (identidad como ancla, docs/01);
 *  timing = medio; reversibility = 0 (es gate). */
function weightOf(d: DecisionDimension): number {
  if (d === 'reversibility') return 0
  if (d === 'timing') return 2
  if (d === 'values') return 5 // pesa como salud: quién quieres ser es ancla
  const dom = DIMENSION_DOMAIN[d]
  return dom ? 6 - PRIORITY_LEVEL[dom] : 1 // peace=6 … relational=2
}

export interface DimensionScore {
  dimension: DecisionDimension
  /** -2 (muy en contra) … +2 (muy a favor). Para reversibility: -2 irreversible, +2 totalmente reversible. */
  score: number
  note?: string
  /** true si la dimensión fue evaluada (vino en el input). */
  evaluated: boolean
}

export interface DecisionInput {
  title: string
  scores: Partial<Record<DecisionDimension, { score: number; note?: string }>>
}

export interface DecisionAssessment {
  title: string
  dimensions: DimensionScore[]
  /** Puntaje ponderado por la jerarquía de dominio, -2..+2. */
  weighted: number
  verdict: 'go' | 'caution' | 'hold'
  /** La dimensión ponderable más en contra (el mayor riesgo). null si ninguna. */
  topRisk: DimensionScore | null
}

const clamp2 = (n: number) => Math.max(-2, Math.min(2, n))

/**
 * Evalúa una decisión. `input.scores` trae las dimensiones puntuadas (las que
 * falten cuentan como no-evaluadas, no como 0 neutral en el promedio). PURO.
 */
export function evaluateDecision(input: DecisionInput): DecisionAssessment {
  const dimensions: DimensionScore[] = DECISION_DIMENSIONS.map((d) => {
    const provided = input.scores[d]
    return { dimension: d, score: provided ? clamp2(provided.score) : 0, note: provided?.note, evaluated: !!provided }
  })

  // Ponderado sobre las dimensiones ponderables EVALUADAS.
  let wsum = 0, w = 0
  for (const ds of dimensions) {
    const weight = weightOf(ds.dimension)
    if (weight === 0 || !ds.evaluated) continue
    wsum += ds.score * weight
    w += weight
  }
  const weighted = w > 0 ? Math.round((wsum / w) * 100) / 100 : 0

  // Gate de reversibilidad: irreversible (<= -1) exige un ponderado claramente
  // positivo para arriesgarse; si no, frená.
  const rev = input.scores.reversibility?.score ?? 0
  const irreversible = rev <= -1

  let verdict: DecisionAssessment['verdict']
  if (weighted <= -0.5) verdict = 'hold'
  else if (weighted >= 0.7 && !(irreversible && weighted < 1.2)) verdict = 'go'
  else verdict = 'caution'
  if (irreversible && weighted < 0.7) verdict = 'hold'

  const risks = dimensions
    .filter((d) => weightOf(d.dimension) > 0 && d.evaluated)
    .sort((a, b) => a.score - b.score)
  const topRisk = risks.length > 0 && risks[0].score < 0 ? risks[0] : null

  return { title: input.title, dimensions, weighted, verdict, topRisk }
}

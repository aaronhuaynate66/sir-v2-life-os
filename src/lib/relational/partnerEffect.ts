// SIR V2 — C2·R1: efecto partner con SHRINKAGE (partial pooling). PURO, sin API.
//
// "¿Quién te energiza y quién te drena?" estimado desde los ratings REALES de
// interacción (person_logs kind='interaction', value 1-5; 5=pleno, 1=roto) — no
// desde el flag manual energy_impact (eso es 15·4, casi inerte). El problema:
// muchas personas con POCOS registros cada una → juzgar por 1-2 datos sobreajusta.
//
// Solución (base científica del plan, Capa 2): empirical Bayes / James-Stein —
// cada persona se "encoge" hacia la media general en proporción a cuán pocos datos
// tiene. Con 2 registros, el estimado queda casi en la media (escéptico); con
// muchos, se acerca a su promedio real. Así lo escaso no dispara falsos.
//
// LÍNEA ÉTICA (doc 15): nombrar el patrón para MANEJARLO (cuidar tu estado,
// espaciar, apoyarte), NUNCA para descartar gente. `now` inyectable.

import { linreg } from '@/lib/stats/regression'

export interface InteractionLog {
  personId: string
  personName: string
  /** 1-5 (5 = mejor). */
  value: number
  /** epoch ms. */
  at: number
}

export type EffectLabel = 'energiza' | 'drena' | 'neutral'
export type Confidence = 'baja' | 'media' | 'alta'

export interface PartnerEffect {
  personId: string
  personName: string
  n: number
  rawMean: number
  /** Estimado encogido hacia la media general (empirical Bayes). */
  estimate: number
  /** estimate − media general (positivo = te energiza). */
  vsBaseline: number
  label: EffectLabel
  confidence: Confidence
  /** Tendencia del vínculo en el tiempo, o null si pocos puntos. */
  trend: 'sube' | 'baja' | 'estable' | null
}

export interface PartnerEffectResult {
  grandMean: number
  /** Varianza entre-personas estimada (0 ≈ nadie se distingue). */
  betweenVar: number
  perPerson: PartnerEffect[]
  insufficient: boolean
}

const MIN_LOGS_PERSON = 2
const MIN_PEOPLE = 3
const THRESHOLD = 0.35 // |vsBaseline| para dejar de ser 'neutral'

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }
function variance(xs: number[], m: number): number {
  if (xs.length < 2) return 0
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1)
}

export function computePartnerEffects(logs: InteractionLog[], now: number): PartnerEffectResult {
  const valid = logs.filter((l) => Number.isFinite(l.value) && l.value >= 1 && l.value <= 5 && Number.isFinite(l.at))
  const grand = valid.length ? mean(valid.map((l) => l.value)) : 0

  const byPerson = new Map<string, InteractionLog[]>()
  for (const l of valid) {
    const arr = byPerson.get(l.personId) ?? []
    arr.push(l); byPerson.set(l.personId, arr)
  }

  const eligible = [...byPerson.entries()].filter(([, ls]) => ls.length >= MIN_LOGS_PERSON)
  if (eligible.length < MIN_PEOPLE) {
    return { grandMean: Math.round(grand * 100) / 100, betweenVar: 0, perPerson: [], insufficient: true }
  }

  // Componentes de varianza (método de momentos).
  const personMeans = eligible.map(([, ls]) => mean(ls.map((l) => l.value)))
  const withinVars = eligible.map(([, ls]) => variance(ls.map((l) => l.value), mean(ls.map((l) => l.value))))
  const sigma2 = Math.max(0.05, mean(withinVars)) // varianza intra-persona (piso para no dividir por ~0)
  const meanOfMeans = mean(personMeans)
  const avgSamplingVar = mean(eligible.map(([, ls]) => sigma2 / ls.length))
  const tau2 = Math.max(0, variance(personMeans, meanOfMeans) - avgSamplingVar) // entre-personas

  const perPerson: PartnerEffect[] = eligible.map(([personId, ls]) => {
    const n = ls.length
    const rawMean = mean(ls.map((l) => l.value))
    // Peso de shrinkage: cuánto confiamos en el promedio de ESTA persona.
    const B = tau2 <= 0 ? 0 : tau2 / (tau2 + sigma2 / n)
    const estimate = grand + B * (rawMean - grand)
    const vsBaseline = estimate - grand

    let label: EffectLabel = 'neutral'
    if (vsBaseline > THRESHOLD) label = 'energiza'
    else if (vsBaseline < -THRESHOLD) label = 'drena'

    // Confianza por n + fuerza de la señal.
    let confidence: Confidence = 'baja'
    if (n >= 6 && Math.abs(vsBaseline) > 0.5) confidence = 'alta'
    else if (n >= 3) confidence = 'media'

    // Tendencia en el tiempo.
    let trend: PartnerEffect['trend'] = null
    if (n >= 4) {
      const sorted = [...ls].sort((a, b) => a.at - b.at)
      const reg = linreg(sorted.map((_, i) => i), sorted.map((l) => l.value))
      if (reg) trend = reg.slope > 0.15 ? 'sube' : reg.slope < -0.15 ? 'baja' : 'estable'
    }

    return {
      personId, personName: ls[0].personName, n,
      rawMean: Math.round(rawMean * 100) / 100,
      estimate: Math.round(estimate * 100) / 100,
      vsBaseline: Math.round(vsBaseline * 100) / 100,
      label, confidence, trend,
    }
  }).sort((a, b) => b.vsBaseline - a.vsBaseline)

  void now
  return { grandMean: Math.round(grand * 100) / 100, betweenVar: Math.round(tau2 * 1000) / 1000, perPerson, insufficient: false }
}

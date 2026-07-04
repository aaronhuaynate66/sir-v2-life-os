// SIR V2 — Vínculos que drenan vs. energizan → qué hacer (15·4).
//
// people.energy_impact (energizing/draining/neutral) HOY está inerte: se carga y
// no decide nada. Esto lo vuelve accionable y, cuando hay datos, lo CORROBORA con
// self_metrics: ¿el estrés de Aaron sube en los días DESPUÉS de ver a alguien
// draining? ¿el ánimo mejora tras un energizing? Honesto: correlación ≠ causa, y
// con n chico solo damos la guía del dato declarado sin afirmar el cruce.
//
// LÍNEA ÉTICA (doc 15): NO es para "cortar gente". Es para NOMBRAR el patrón y
// sugerir manejo (espaciar, poner límite, o cuidar tu estado antes de ver a
// alguien draining pero importante — la familia difícil no se descarta). Para
// energizing: recordar apoyarte en ellos cuando estás bajo.
//
// PURO y determinístico (`now` inyectable).

import type { EnergyImpact } from '@/types'

const DAY_MS = 86_400_000
/** Ventana (días) después de una interacción donde miramos el estado de Aaron. */
const AFTER_WINDOW_DAYS = 2
/** Muestras mínimas en la ventana para arriesgar una corroboración. */
const MIN_SAMPLES = 3

export interface SelfMetricPoint {
  /** 'stress' | 'mood' | 'energy' | … (self_metrics.category). */
  category: string
  value: number
  /** ISO (self_metrics.timestamp). */
  timestamp: string
}

export interface RelationalEnergyInput {
  energyImpact: EnergyImpact
  personName?: string
  /** ISO de las interacciones con esta persona (person_logs kind='interaction'). */
  interactionDates: string[]
  /** self_metrics de Aaron (globales; los cruzamos por fecha). */
  selfMetrics: SelfMetricPoint[]
}

export interface RelationalEnergyRead {
  impact: EnergyImpact
  /** Δ estrés (ventana tras interacciones − baseline), o null si datos insuf. */
  stressDelta: number | null
  /** Δ ánimo, o null. */
  moodDelta: number | null
  /** true si self_metrics respaldan la dirección del impacto declarado. */
  corroborated: boolean
  /** Guía de manejo. null si impacto neutral (nada que sugerir). */
  guidance: string | null
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Δ (ventana-tras-interacción − baseline) de una categoría, o null si n insuf. */
function categoryDelta(
  category: string,
  interactionMs: number[],
  metrics: SelfMetricPoint[],
): number | null {
  const cat = metrics
    .filter((m) => m.category === category)
    .map((m) => ({ v: m.value, t: new Date(m.timestamp).getTime() }))
    .filter((m) => Number.isFinite(m.t))
  if (cat.length < MIN_SAMPLES) return null

  const baseline = avg(cat.map((m) => m.v))
  const after = cat.filter((m) =>
    interactionMs.some((it) => m.t >= it && m.t <= it + AFTER_WINDOW_DAYS * DAY_MS),
  )
  if (after.length < MIN_SAMPLES) return null
  return round1(avg(after.map((m) => m.v)) - baseline)
}

function firstName(name?: string): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  return n || 'esta persona'
}

/**
 * Lee el impacto energético del vínculo y sugiere manejo, corroborando con
 * self_metrics cuando hay datos.
 */
export function readRelationalEnergy(
  input: RelationalEnergyInput,
  now: Date = new Date(),
): RelationalEnergyRead {
  void now // el cruce es histórico; `now` se mantiene por consistencia de firma
  const impact = input.energyImpact
  if (impact === 'neutral') {
    return { impact, stressDelta: null, moodDelta: null, corroborated: false, guidance: null }
  }

  const interactionMs = input.interactionDates
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t))

  const stressDelta = categoryDelta('stress', interactionMs, input.selfMetrics)
  const moodDelta = categoryDelta('mood', interactionMs, input.selfMetrics)

  const first = firstName(input.personName)
  let corroborated = false
  let guidance: string

  if (impact === 'draining') {
    corroborated = stressDelta !== null && stressDelta >= 0.5
    guidance = corroborated
      ? `Ver a ${first} tiende a dejarte con más estrés los días siguientes (tus registros lo respaldan). No es para alejarte — es para cuidar tu estado antes y espaciar cuando puedas.`
      : `Marcaste que ${first} te drena. Cuidá tu estado antes de verlo/a y date permiso de espaciar o poner un límite — sin culpa, aunque el vínculo importe.`
  } else {
    // energizing
    corroborated = moodDelta !== null && moodDelta >= 0.5
    guidance = corroborated
      ? `${first} te sube el ánimo (se nota en tus registros tras verlo/a). Cuando andes bajo, buscarlo/a es una buena jugada.`
      : `${first} te energiza. Apoyarte en ese vínculo cuando estás bajo suele valer más que aguantar solo.`
  }

  return { impact, stressDelta, moodDelta, corroborated, guidance }
}

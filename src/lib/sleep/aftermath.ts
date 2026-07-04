// SIR V2 — "El día después" (SF·F3): cruce sueño → día siguiente.
//
// Lo que Aaron pidió desde el principio: "mejor cruce de información, mejores
// predicciones". Con la calidad de sueño ya legible (F2), comparamos cómo te va
// el DÍA SIGUIENTE — estrés, energía, ánimo, FC de reposo — tras noches buenas
// vs. malas. Si emerge un patrón ("tras noches fragmentadas tu FC de reposo sube
// y tu energía baja"), lo decimos; si no hay datos suficientes, lo decimos también.
//
// HONESTO: solo afirma con un mínimo de noches a cada lado (no lee patrones de 2
// puntos). PURO y determinístico. `nowMs` no se usa: el cruce es histórico.

import type { SleepRecord, SelfMetric, HealthMetric } from '@/types'
import { readSleepQuality } from './quality'
import { limaDayKey } from '@/lib/dates/limaDay'

/** Noches mínimas a CADA lado (buena/mala) para afirmar un patrón. */
const MIN_PER_GROUP = 3

export type AftermathMetric = 'stress' | 'energy' | 'mood' | 'resting_hr'

const METRIC_LABEL: Record<AftermathMetric, string> = {
  stress: 'estrés',
  energy: 'energía',
  mood: 'ánimo',
  resting_hr: 'FC de reposo',
}

/** Para estas métricas, un valor MÁS ALTO el día después de una mala noche es lo
 *  esperable/preocupante. Para energía/ánimo es al revés (más bajo = peor). */
const HIGHER_IS_WORSE: Record<AftermathMetric, boolean> = {
  stress: true,
  resting_hr: true,
  energy: false,
  mood: false,
}

export interface AftermathFinding {
  metric: AftermathMetric
  goodNights: number
  poorNights: number
  /** Promedio de la métrica el día después de una noche buena. */
  goodAvg: number
  /** Promedio el día después de una noche mala. */
  poorAvg: number
  /** poorAvg − goodAvg. */
  delta: number
  /** true si la diferencia va en la dirección "peor tras mala noche". */
  worseAfterPoor: boolean
  message: string
}

export interface AftermathResult {
  findings: AftermathFinding[]
  /** Noches con veredicto claro (reparador o fragmentado) usadas en el cruce. */
  nightsClassified: number
  goodNights: number
  poorNights: number
  sufficient: boolean
}

const PAD = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' del día siguiente a un date-key. */
function nextDayKey(dateKey: string): string | null {
  const t = Date.parse(`${dateKey}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  const d = new Date(t + 86_400_000)
  return `${d.getUTCFullYear()}-${PAD(d.getUTCMonth() + 1)}-${PAD(d.getUTCDate())}`
}

function mean(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Cruza la calidad de cada noche con las métricas del día siguiente y devuelve
 * los patrones que tienen soporte suficiente.
 */
export function analyzeSleepAftermath(
  sleep: SleepRecord[],
  selfMetrics: SelfMetric[],
  healthMetrics: HealthMetric[],
): AftermathResult {
  // 1) Clasificar cada noche en buena/mala por el veredicto de F2. 'aceptable' y
  //    'sin_datos' se descartan (ambiguos): no metemos ruido al cruce.
  const nightClass = new Map<string, 'good' | 'poor'>() // nextDayKey → clase de la noche
  let goodNights = 0
  let poorNights = 0
  for (const r of sleep) {
    const v = readSleepQuality(r).label
    if (v !== 'reparador' && v !== 'fragmentado') continue
    const nd = nextDayKey(r.date)
    if (!nd) continue
    nightClass.set(nd, v === 'reparador' ? 'good' : 'poor')
    if (v === 'reparador') goodNights++
    else poorNights++
  }

  // 2) Promedio por día-Lima de cada métrica.
  const selfByDay = new Map<string, Map<string, number[]>>() // day → category → values
  for (const m of selfMetrics) {
    const day = limaDayKey(m.timestamp)
    if (!day) continue
    const cats = selfByDay.get(day) ?? new Map<string, number[]>()
    const arr = cats.get(m.category) ?? []
    arr.push(m.value)
    cats.set(m.category, arr)
    selfByDay.set(day, cats)
  }
  const hrByDay = new Map<string, number[]>() // day → resting HR values
  for (const h of healthMetrics) {
    if (h.type !== 'heart_rate') continue // 'heart_rate' = reposo (la verdad)
    const day = limaDayKey(h.timestamp)
    if (!day) continue
    const arr = hrByDay.get(day) ?? []
    arr.push(h.value)
    hrByDay.set(day, arr)
  }

  function valueForDay(metric: AftermathMetric, day: string): number | null {
    if (metric === 'resting_hr') {
      const v = hrByDay.get(day)
      return v && v.length ? mean(v) : null
    }
    const cats = selfByDay.get(day)
    const v = cats?.get(metric)
    return v && v.length ? mean(v) : null
  }

  // 3) Para cada métrica, juntar los valores del día-después por clase de noche.
  const findings: AftermathFinding[] = []
  const metrics: AftermathMetric[] = ['stress', 'energy', 'mood', 'resting_hr']
  for (const metric of metrics) {
    const good: number[] = []
    const poor: number[] = []
    for (const [day, cls] of nightClass) {
      const v = valueForDay(metric, day)
      if (v === null) continue
      ;(cls === 'good' ? good : poor).push(v)
    }
    if (good.length < MIN_PER_GROUP || poor.length < MIN_PER_GROUP) continue

    const goodAvg = round1(mean(good))
    const poorAvg = round1(mean(poor))
    const delta = round1(poorAvg - goodAvg)
    const worseAfterPoor = HIGHER_IS_WORSE[metric] ? delta > 0 : delta < 0
    const label = METRIC_LABEL[metric]
    const unit = metric === 'resting_hr' ? ' lpm' : '/10'
    const dir = worseAfterPoor ? 'peor' : 'mejor'
    findings.push({
      metric,
      goodNights: good.length,
      poorNights: poor.length,
      goodAvg,
      poorAvg,
      delta,
      worseAfterPoor,
      message:
        `Tras noches malas tu ${label} del día siguiente promedia ${poorAvg}${unit}, ` +
        `vs ${goodAvg}${unit} tras noches buenas (${dir} tras dormir mal). ` +
        `${good.length} buenas · ${poor.length} malas.`,
    })
  }

  // Ordenar por magnitud del efecto (los patrones más marcados primero).
  findings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    findings,
    nightsClassified: goodNights + poorNights,
    goodNights,
    poorNights,
    sufficient: findings.length > 0,
  }
}

// SIR V2 — Estado físico/energía del día (/horario, vista Día), lógica pura.
//
// Resume el ÚLTIMO dato biológico disponible para mostrar "cómo venís hoy"
// junto al timeline: peso (báscula), frecuencia cardíaca, sueño y energía. Lee
// la misma data que el grounding de objetivos (health_metrics, sleep_records,
// self_metrics) pero la enmarca como estado actual, no como contexto de prompt.
//
// PURO + determinístico. Devuelve el último valor de cada señal con su fecha
// (para que la UI muestre recencia y no pretenda que un peso de hace 3 meses
// es "de hoy"). `empty` cuando no hay NADA que mostrar.
//
// PRIVACIDAD: sólo números/labels que el usuario ya ve en /yo. No toca el
// diagnóstico personal (self_diagnosis), que no sale de /yo.

import type { HealthMetric, SelfMetric, SleepRecord } from '@/types'

export interface PhysicalState {
  weightKg?: number
  /** ISO del último pesaje. */
  weightAt?: string
  heartRate?: number
  /** ISO de la última FC. */
  heartRateAt?: string
  /** Horas de la última noche registrada. */
  sleepHours?: number
  /** Calidad 1-10 de la última noche. */
  sleepQuality?: number
  /** 'YYYY-MM-DD' de la última noche. */
  sleepDate?: string
  /** Última energía registrada (1-10). */
  energy?: number
  /** true si no hay ningún dato → la UI omite la tarjeta. */
  empty: boolean
}

export interface PhysicalInput {
  healthMetrics?: HealthMetric[]
  sleepRecords?: SleepRecord[]
  selfMetrics?: SelfMetric[]
}

/** Último HealthMetric de un tipo (por timestamp ISO comparable lexicográfico). */
function latestHealth(metrics: HealthMetric[], type: HealthMetric['type']): HealthMetric | undefined {
  let best: HealthMetric | undefined
  for (const m of metrics) {
    if (m.type !== type) continue
    if (!best || m.timestamp > best.timestamp) best = m
  }
  return best
}

/** Último registro de sueño por fecha ('YYYY-MM-DD', comparable lexicográfico). */
function latestSleep(records: SleepRecord[]): SleepRecord | undefined {
  let best: SleepRecord | undefined
  for (const r of records) {
    if (!best || r.date > best.date) best = r
  }
  return best
}

/** Última energía (SelfMetric category='energy') por timestamp. */
function latestEnergy(metrics: SelfMetric[]): SelfMetric | undefined {
  let best: SelfMetric | undefined
  for (const m of metrics) {
    if (m.category !== 'energy') continue
    if (!best || m.timestamp > best.timestamp) best = m
  }
  return best
}

/** Construye el estado físico actual desde los stores (todo opcional). */
export function buildPhysicalState(input: PhysicalInput): PhysicalState {
  const health = input.healthMetrics ?? []
  const weight = latestHealth(health, 'weight')
  const hr = latestHealth(health, 'heart_rate')
  const sleep = latestSleep(input.sleepRecords ?? [])
  const energy = latestEnergy(input.selfMetrics ?? [])

  const state: PhysicalState = {
    weightKg: weight?.value,
    weightAt: weight?.timestamp,
    heartRate: hr?.value,
    heartRateAt: hr?.timestamp,
    sleepHours: sleep?.duration,
    sleepQuality: sleep?.quality,
    sleepDate: sleep?.date,
    energy: energy?.value,
    empty: !weight && !hr && !sleep && !energy,
  }
  return state
}

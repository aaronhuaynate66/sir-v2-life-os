// SIR V2 — Lectura de calidad y continuidad del sueño (SF·F2).
//
// F1 dejó la data rica ESTRUCTURADA en cada SleepRecord (score, despertares,
// fases). Este motor la CONVIERTE en lecturas con sentido — no "7.5h promedio"
// sino "dormiste 7h pero con 4 despertares y 8% profundo → fragmentado, poco
// reparador". Todo honesto: cada métrica solo aparece si la noche trae el dato,
// y si la noche no tiene nada rico lo dice en vez de inventar.
//
// PURO y determinístico. No toca el motor biológico ni la deuda (eso es F3).

import type { SleepRecord } from '@/types'

export type SleepQualityLabel =
  | 'reparador'
  | 'aceptable'
  | 'fragmentado'
  | 'sin_datos'

export interface SleepQualityReading {
  /** Eficiencia = horas dormidas ÷ horas en cama (0-1), o null sin horario. */
  efficiency: number | null
  /** Horas en cama (span bedtime→wakeTime), o null. */
  timeInBedHours: number | null
  /** Despertares por hora de sueño, o null. */
  fragmentation: number | null
  /** Cantidad de despertares (crudo), o null. */
  awakenings: number | null
  /** Minutos de vigilia durante la noche (crudo), o null. */
  awakeMin: number | null
  /** Fracción reparadora = (profundo+REM) ÷ (profundo+liviano+REM), o null. */
  restorativePct: number | null
  /** % profundo sobre el sueño con fases, o null. */
  deepPct: number | null
  /** % REM sobre el sueño con fases, o null. */
  remPct: number | null
  /** Puntuación 0-100 cruda de la app, o null. */
  score: number | null
  /** true si la noche trae al menos una señal de calidad (score/despertares/fases). */
  hasRichData: boolean
  /** Veredicto honesto combinando lo disponible. */
  label: SleepQualityLabel
  /** Observaciones legibles, una por métrica disponible. */
  notes: string[]
}

const HM = /^(\d{2}):(\d{2})$/

/** Minutos desde medianoche de una hora 'HH:MM', o null si inválida. */
function hmToMinutes(hm: string | undefined): number | null {
  const m = HM.exec(hm ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function pct(n: number): number {
  return Math.round(n * 100)
}

/** Horas en cama a partir del horario, manejando cruce de medianoche.
 *  null si falta el horario o es el fallback '00:00'→'00:00'. */
function timeInBed(record: SleepRecord): number | null {
  const bed = hmToMinutes(record.bedtime)
  const wake = hmToMinutes(record.wakeTime)
  if (bed === null || wake === null) return null
  if (bed === 0 && wake === 0) return null // fallback sin horario real
  const span = (wake - bed + 1440) % 1440
  if (span <= 0) return null
  return span / 60
}

/**
 * Lee la calidad y continuidad de UNA noche. Cada métrica es null si la noche
 * no trae el dato crudo; el label es 'sin_datos' si no hay ninguna señal rica.
 */
export function readSleepQuality(record: SleepRecord): SleepQualityReading {
  const notes: string[] = []

  // ── Eficiencia (dormido ÷ en cama) ──────────────────────────────
  const tib = timeInBed(record)
  let efficiency: number | null = null
  if (tib !== null && record.duration > 0) {
    // Si dormido supera el tiempo en cama por >5% la data es inconsistente → null.
    if (record.duration <= tib * 1.05) {
      efficiency = clamp(record.duration / tib, 0, 1)
      notes.push(`Eficiencia ${pct(efficiency)}% (${record.duration}h dormido en ${Math.round(tib * 10) / 10}h de cama)`)
    }
  }

  // ── Fragmentación (despertares por hora) ────────────────────────
  const awakenings = record.awakenings ?? null
  let fragmentation: number | null = null
  if (awakenings !== null && record.duration > 0) {
    fragmentation = Math.round((awakenings / record.duration) * 100) / 100
    notes.push(`${awakenings} despertar${awakenings === 1 ? '' : 'es'} (${fragmentation}/h)`)
  }

  // ── Fases: % reparador (profundo+REM) ───────────────────────────
  const deep = record.deepMin ?? null
  const light = record.lightMin ?? null
  const rem = record.remMin ?? null
  const awakeMin = record.awakeMin ?? null
  let restorativePct: number | null = null
  let deepPct: number | null = null
  let remPct: number | null = null
  if (deep !== null && light !== null && rem !== null) {
    const asleep = deep + light + rem
    if (asleep > 0) {
      restorativePct = (deep + rem) / asleep
      deepPct = deep / asleep
      remPct = rem / asleep
      notes.push(`${pct(restorativePct)}% reparador (profundo ${pct(deepPct)}% · REM ${pct(remPct)}%)`)

      // Rescate DD: si no hubo eficiencia por horario, la calculamos por FASES
      // (dormido ÷ tiempo en cama = dormido + vigilia). Más fiable que el span
      // bedtime→waketime, que arrastra la latencia previa al sueño.
      if (efficiency === null && awakeMin !== null && asleep + awakeMin > 0) {
        efficiency = clamp(asleep / (asleep + awakeMin), 0, 1)
        notes.push(`Eficiencia ${pct(efficiency)}% (por fases: ${awakeMin} min de vigilia)`)
      }
    }
  }

  // ── Score crudo ─────────────────────────────────────────────────
  const score = record.score ?? null
  if (score !== null) notes.push(`Score ${score}/100`)

  const hasRichData =
    score !== null || awakenings !== null || restorativePct !== null

  return {
    efficiency,
    timeInBedHours: tib,
    fragmentation,
    awakenings,
    awakeMin,
    restorativePct,
    deepPct,
    remPct,
    score,
    hasRichData,
    label: verdict({ score, efficiency, fragmentation, restorativePct }),
    notes,
  }
}

type Vote = 'good' | 'mid' | 'poor'

/** Combina las señales disponibles en un veredicto honesto. */
function verdict(m: {
  score: number | null
  efficiency: number | null
  fragmentation: number | null
  restorativePct: number | null
}): SleepQualityLabel {
  const votes: Vote[] = []
  if (m.score !== null) votes.push(m.score >= 80 ? 'good' : m.score >= 60 ? 'mid' : 'poor')
  if (m.efficiency !== null) votes.push(m.efficiency >= 0.85 ? 'good' : m.efficiency >= 0.75 ? 'mid' : 'poor')
  if (m.fragmentation !== null) votes.push(m.fragmentation <= 1 ? 'good' : m.fragmentation <= 2 ? 'mid' : 'poor')
  if (m.restorativePct !== null) votes.push(m.restorativePct >= 0.4 ? 'good' : m.restorativePct >= 0.3 ? 'mid' : 'poor')

  if (votes.length === 0) return 'sin_datos'
  const good = votes.filter((v) => v === 'good').length
  const poor = votes.filter((v) => v === 'poor').length
  const net = good - poor
  if (net > 0) return 'reparador'
  if (net < 0) return 'fragmentado'
  return 'aceptable'
}

export interface SleepQualitySummary {
  /** Noches (dentro de la ventana) con al menos una señal rica. */
  nightsWithData: number
  avgEfficiency: number | null
  avgFragmentation: number | null
  avgRestorativePct: number | null
  avgScore: number | null
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

const DAY_MS = 86_400_000

/**
 * Promedia las métricas de calidad sobre la ventana reciente, ignorando las
 * noches que no tienen cada dato (cada promedio se calcula solo sobre las que
 * lo traen). Sirve para la tendencia "últimas 2 semanas" en la card.
 */
export function recentQualitySummary(
  records: SleepRecord[],
  nowMs: number,
  windowDays = 14,
): SleepQualitySummary {
  const start = nowMs - windowDays * DAY_MS
  const readings = records
    .filter((r) => {
      const t = Date.parse(`${r.date}T12:00:00`)
      return Number.isFinite(t) && t >= start
    })
    .map(readSleepQuality)
    .filter((r) => r.hasRichData)

  const effs = readings.map((r) => r.efficiency).filter((n): n is number => n !== null)
  const frags = readings.map((r) => r.fragmentation).filter((n): n is number => n !== null)
  const rests = readings.map((r) => r.restorativePct).filter((n): n is number => n !== null)
  const scores = readings.map((r) => r.score).filter((n): n is number => n !== null)

  return {
    nightsWithData: readings.length,
    avgEfficiency: avg(effs),
    avgFragmentation: frags.length ? Math.round((avg(frags) as number) * 100) / 100 : null,
    avgRestorativePct: avg(rests),
    avgScore: scores.length ? Math.round(avg(scores) as number) : null,
  }
}

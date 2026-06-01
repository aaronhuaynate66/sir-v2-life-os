// SIR V2 — Weekly Score Engine (P2)
//
// Un score SEMANAL compuesto (0-100) con tier S/A/B/C/D, combinando las
// señales que YA existen sobre una ventana de 7 días. NO inventa fuentes:
//   - Sueño   → analyzeSleepTrend (duración + calidad de la semana).
//   - Energía → self_metrics category='energy' (1-10), promedio de la ventana.
//   - Calma   → self_metrics category='stress' (1-10) INVERTIDO (menos estrés
//               = mejor semana).
//   - Finanzas→ analyzeFinancialStability (estabilidad 0-10).
//   - Objetivos→ progreso promedio de objetivos activos (0-100).
//
// Reusa los engines existentes (biological, financial); no los duplica. Cada
// componente aporta solo si tiene datos: los pesos se renormalizan sobre lo
// disponible, así una semana sin registro financiero no te hunde el score.
//
// Determinístico y sin red. `now` es inyectable para tests.

import type { SelfMetric, SleepRecord, FinancialMovement, Goal } from '@/types'
import { analyzeSleepTrend } from '@/engines/biological'
import { analyzeFinancialStability } from '@/engines/financial'

export type WeeklyTier = 'S' | 'A' | 'B' | 'C' | 'D'

export type WeeklyComponentKey = 'sleep' | 'energy' | 'calm' | 'finance' | 'goals'

export interface WeeklyComponent {
  key: WeeklyComponentKey
  label: string
  /** 0-100. 0 si no hay datos (available=false). */
  score: number
  /** Peso base relativo (se renormaliza sobre los disponibles). */
  weight: number
  available: boolean
  /** Texto corto legible ("6.8 h prom.", "estrés 3.2/10", …). */
  detail: string
}

export interface WeeklyScore {
  /**
   * 'scored'      → hay señal de bienestar suficiente: score/tier son válidos.
   * 'calibrating' → faltan datos reales: NO interpretar score/tier como malos,
   *                 es ausencia de datos (la UI muestra "calibrando").
   */
  status: 'scored' | 'calibrating'
  /** 0-100 sobre los componentes disponibles. Solo significativo si status='scored'. */
  score: number
  /** Tier del score. Solo significativo si status='scored'. */
  tier: WeeklyTier
  components: WeeklyComponent[]
  /** Días distintos de la ventana con AL MENOS un dato (sueño o métrica). */
  daysWithData: number
  windowDays: number
  /** true si daysWithData >= 3 (suficiente para confiar en el número). */
  confident: boolean
}

// Mínimo de días con señal de bienestar para emitir un tier (vs "calibrando").
// La ausencia de registros NO es una semana mala: es falta de datos.
const MIN_DAYS_FOR_SCORE = 2
// Dimensiones de "bienestar": al menos una debe tener datos para puntuar.
// Finanzas/objetivos enriquecen pero no producen un tier por sí solas (evita
// el falso "39/D" cuando solo hay movimientos financieros cargados).
const WELLBEING_KEYS: WeeklyComponentKey[] = ['sleep', 'energy', 'calm']

export interface WeeklyConfig {
  windowDays?: number
  /** Meses de liquidez asumidos para la estabilidad financiera (igual que /panel). */
  liquidityMonths?: number
  now?: Date
}

// Pesos base (suman 1). Espejo aproximado del Peace Engine.
const BASE_WEIGHTS: Record<WeeklyComponentKey, number> = {
  sleep: 0.25,
  energy: 0.2,
  calm: 0.2,
  finance: 0.2,
  goals: 0.15,
}

const LABELS: Record<WeeklyComponentKey, string> = {
  sleep: 'Sueño',
  energy: 'Energía',
  calm: 'Calma (estrés)',
  finance: 'Finanzas',
  goals: 'Objetivos',
}

// Umbrales de tier (sobre 0-100). Documentados y testeados.
//   S ≥ 90 · A ≥ 78 · B ≥ 64 · C ≥ 50 · D < 50
export function scoreToTier(score: number): WeeklyTier {
  if (score >= 90) return 'S'
  if (score >= 78) return 'A'
  if (score >= 64) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, n))
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0
}
function dayKey(iso: string): string | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Duración → score: 100 a ≥7.5h, baja lineal hasta 0 a ≤4h. */
function sleepDurationScore(hours: number): number {
  return clamp100(((hours - 4) / (7.5 - 4)) * 100)
}

/** Filtra métricas (por timestamp) y sueño (por date) a la ventana [now-N, now]. */
function inWindow(
  selfMetrics: SelfMetric[],
  sleepRecords: SleepRecord[],
  now: Date,
  windowDays: number,
): { winMetrics: SelfMetric[]; winSleep: SleepRecord[]; days: Set<string> } {
  const cutoffMs = now.getTime() - windowDays * 86_400_000
  const winMetrics = selfMetrics.filter((m) => {
    const t = new Date(m.timestamp).getTime()
    return Number.isFinite(t) && t >= cutoffMs && t <= now.getTime()
  })
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10)
  const nowDate = now.toISOString().slice(0, 10)
  const winSleep = sleepRecords.filter((r) => r.date >= cutoffDate && r.date <= nowDate)
  const days = new Set<string>()
  for (const m of winMetrics) { const k = dayKey(m.timestamp); if (k) days.add(k) }
  for (const r of winSleep) days.add(r.date)
  return { winMetrics, winSleep, days }
}

export interface WindowAverages {
  /** Promedio de energía 1-10 en la ventana. null si no hay registros. */
  avgEnergy: number | null
  /** Promedio de estrés 1-10. null si no hay registros. */
  avgStress: number | null
  /** Duración de sueño promedio (h). null si no hay registros. */
  avgSleepHours: number | null
  daysWithData: number
}

/**
 * Promedios de la ventana, reutilizables fuera del score (ej. Recovery Mode).
 * Devuelve null por métrica sin datos para no confundir "0" con "ausente".
 */
export function windowAverages(
  selfMetrics: SelfMetric[],
  sleepRecords: SleepRecord[],
  config: WeeklyConfig = {},
): WindowAverages {
  const windowDays = config.windowDays ?? 7
  const now = config.now ?? new Date()
  const { winMetrics, winSleep, days } = inWindow(selfMetrics, sleepRecords, now, windowDays)
  const energyVals = winMetrics.filter((m) => m.category === 'energy').map((m) => m.value)
  const stressVals = winMetrics.filter((m) => m.category === 'stress').map((m) => m.value)
  const sleepVals = winSleep.map((r) => r.duration)
  return {
    avgEnergy: energyVals.length ? round1(avg(energyVals)) : null,
    avgStress: stressVals.length ? round1(avg(stressVals)) : null,
    avgSleepHours: sleepVals.length ? round1(avg(sleepVals)) : null,
    daysWithData: days.size,
  }
}

export function computeWeeklyScore(
  input: { selfMetrics: SelfMetric[]; sleepRecords: SleepRecord[]; financialMovements: FinancialMovement[]; goals: Goal[] },
  config: WeeklyConfig = {},
): WeeklyScore {
  const windowDays = config.windowDays ?? 7
  const liquidityMonths = config.liquidityMonths ?? 2.5
  const now = config.now ?? new Date()

  // ── Ventana de métricas (por timestamp) y sueño (por date) ──
  const { winMetrics, winSleep, days } = inWindow(input.selfMetrics, input.sleepRecords, now, windowDays)

  // ── Sub-scores ──
  const energyVals = winMetrics.filter((m) => m.category === 'energy').map((m) => m.value)
  const stressVals = winMetrics.filter((m) => m.category === 'stress').map((m) => m.value)
  const sleepTrend = analyzeSleepTrend(winSleep)
  const fin = analyzeFinancialStability(input.financialMovements, liquidityMonths)
  const activeGoals = input.goals.filter((g) => g.status === 'active')

  const components: WeeklyComponent[] = []

  // Sueño: 60% duración + 40% calidad.
  if (winSleep.length > 0) {
    const durScore = sleepDurationScore(sleepTrend.averageDuration)
    const qualScore = clamp100(sleepTrend.averageQuality * 10)
    components.push({
      key: 'sleep', label: LABELS.sleep, weight: BASE_WEIGHTS.sleep, available: true,
      score: round1(durScore * 0.6 + qualScore * 0.4),
      detail: `${sleepTrend.averageDuration.toFixed(1)} h · calidad ${sleepTrend.averageQuality.toFixed(1)}/10`,
    })
  } else {
    components.push({ key: 'sleep', label: LABELS.sleep, weight: BASE_WEIGHTS.sleep, available: false, score: 0, detail: 'sin registros' })
  }

  // Energía.
  if (energyVals.length > 0) {
    const e = avg(energyVals)
    components.push({ key: 'energy', label: LABELS.energy, weight: BASE_WEIGHTS.energy, available: true, score: round1(clamp100(e * 10)), detail: `${e.toFixed(1)}/10` })
  } else {
    components.push({ key: 'energy', label: LABELS.energy, weight: BASE_WEIGHTS.energy, available: false, score: 0, detail: 'sin registros' })
  }

  // Calma (estrés invertido): stress 1 → 100, stress 10 → 0.
  if (stressVals.length > 0) {
    const s = avg(stressVals)
    components.push({ key: 'calm', label: LABELS.calm, weight: BASE_WEIGHTS.calm, available: true, score: round1(clamp100(((10 - s) / 9) * 100)), detail: `estrés ${s.toFixed(1)}/10` })
  } else {
    components.push({ key: 'calm', label: LABELS.calm, weight: BASE_WEIGHTS.calm, available: false, score: 0, detail: 'sin registros' })
  }

  // Finanzas: estabilidad 0-10 → 0-100.
  if (input.financialMovements.length > 0) {
    components.push({ key: 'finance', label: LABELS.finance, weight: BASE_WEIGHTS.finance, available: true, score: round1(clamp100(fin.stability * 10)), detail: `estabilidad ${fin.stability.toFixed(1)}/10` })
  } else {
    components.push({ key: 'finance', label: LABELS.finance, weight: BASE_WEIGHTS.finance, available: false, score: 0, detail: 'sin movimientos' })
  }

  // Objetivos: progreso promedio de activos (0-100).
  if (activeGoals.length > 0) {
    const p = avg(activeGoals.map((g) => g.progress))
    components.push({ key: 'goals', label: LABELS.goals, weight: BASE_WEIGHTS.goals, available: true, score: round1(clamp100(p)), detail: `${Math.round(p)}% prom. (${activeGoals.length})` })
  } else {
    components.push({ key: 'goals', label: LABELS.goals, weight: BASE_WEIGHTS.goals, available: false, score: 0, detail: 'sin objetivos activos' })
  }

  // ── Combinación: promedio ponderado SOLO sobre disponibles ──
  const avail = components.filter((c) => c.available)
  const totalWeight = avail.reduce((s, c) => s + c.weight, 0)
  const score = totalWeight > 0 ? round1(avail.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : 0

  // ── Estado: ¿hay señal de bienestar suficiente para puntuar? ──
  // Ausencia de datos NO es una semana mala. Sin ≥1 dimensión de bienestar
  // y ≥MIN_DAYS_FOR_SCORE días de registro → 'calibrating' (neutro).
  const hasWellbeing = components.some((c) => c.available && WELLBEING_KEYS.includes(c.key))
  const status: WeeklyScore['status'] =
    hasWellbeing && days.size >= MIN_DAYS_FOR_SCORE ? 'scored' : 'calibrating'

  return {
    status,
    score,
    tier: scoreToTier(score),
    components,
    daysWithData: days.size,
    windowDays,
    confident: days.size >= 3,
  }
}

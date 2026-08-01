// SIR V2 — Ventana de tolerancia + estrategia de regulación (13·M1 + 13·M2). PURO.
//
// M1: detecta si Aaron está SALIENDO de su ventana de tolerancia — activación
// alta / capacidad de regular angosta — con una regla compuesta sobre baseline
// PERSONAL Y MÓVIL (no umbrales absolutos): estrés elevado + HRV en caída + sueño
// bajo, cada uno vs. sus propios últimos ~30 días. Si no hay datos suficientes,
// `insufficient` — nunca inventa el estado.
//
// M2: elige la CLASE de estrategia por estado (Gross), no un consejo genérico:
//   - fuera de la ventana (arousal alto) → MODULACIÓN DE RESPUESTA (bajar
//     activación primero: respirar, moverse, cortar estímulo). NO reevaluar acá.
//   - tensionado pero dentro → REEVALUACIÓN COGNITIVA (reencuadre / preguntas).
//
// 13·M5 (frontera clínica): este motor SOLO consume estrés/HRV/sueño. NUNCA la
// data sensible aislada de /yo. Un test de fuente garantiza cero referencia.

const DAY_MS = 86_400_000
const RECENT_DAYS = 3
const BASELINE_DAYS = 30
/** Observaciones mínimas de baseline para arriesgar una lectura. */
const MIN_BASELINE = 5

export interface Sample {
  value: number
  /** ISO o 'YYYY-MM-DD'. */
  at: string
}

export interface EmotionWindowInput {
  /** self_metrics category='stress' (1-10). */
  stress: Sample[]
  /** health_metrics type='hrv_avg'. */
  hrv?: Sample[]
  /** Duración de sueño en horas (sleep_records). */
  sleepHours?: Sample[]
}

export type WindowState = 'open' | 'watch' | 'narrow' | 'insufficient'
export type RegStrategy = 'response_modulation' | 'reappraisal' | 'steady'

export interface EmotionWindow {
  state: WindowState
  stressElevated: boolean
  hrvDown: boolean
  sleepLow: boolean
  strategy: RegStrategy | null
  /** Guía de regulación (null si estado 'open'/'insufficient' — nada que sugerir). */
  guidance: string | null
}

function ms(at: string): number {
  return Date.parse(at.length <= 10 ? `${at}T12:00:00Z` : at)
}
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Parte una serie en reciente (≤3d) y baseline (3–30d). */
function split(samples: Sample[] | undefined, nowMs: number): { recent: number[]; baseline: number[] } {
  const recent: number[] = []
  const baseline: number[] = []
  for (const s of samples ?? []) {
    const t = ms(s.at)
    if (!Number.isFinite(t) || !Number.isFinite(s.value)) continue
    const age = (nowMs - t) / DAY_MS
    if (age < 0) continue
    if (age <= RECENT_DAYS) recent.push(s.value)
    else if (age <= BASELINE_DAYS) baseline.push(s.value)
  }
  return { recent, baseline }
}

/**
 * Detecta el estado de la ventana de tolerancia y sugiere la estrategia (Gross).
 */
export function assessEmotionWindow(input: EmotionWindowInput, nowMs: number): EmotionWindow {
  const s = split(input.stress, nowMs)
  // Sin baseline personal de estrés no arriesgamos una lectura.
  if (s.baseline.length < MIN_BASELINE || s.recent.length === 0) {
    return { state: 'insufficient', stressElevated: false, hrvDown: false, sleepLow: false, strategy: null, guidance: null }
  }

  const stressBase = median(s.baseline)
  const stressRecent = avg(s.recent)
  const stressElevated = stressRecent >= stressBase + 1.5 || stressRecent >= 7

  const h = split(input.hrv, nowMs)
  const hrvDown =
    h.baseline.length >= MIN_BASELINE && h.recent.length > 0 && avg(h.recent) <= median(h.baseline) * 0.9

  const sl = split(input.sleepHours, nowMs)
  const sleepLow =
    sl.recent.length > 0 &&
    (avg(sl.recent) < 6 || (sl.baseline.length >= 3 && avg(sl.recent) <= median(sl.baseline) - 1))

  const narrow = stressElevated && (hrvDown || sleepLow)
  const watch = !narrow && (stressElevated || (hrvDown && sleepLow))
  const state: WindowState = narrow ? 'narrow' : watch ? 'watch' : 'open'

  const strategy: RegStrategy = narrow ? 'response_modulation' : watch ? 'reappraisal' : 'steady'
  const guidance = buildGuidance(strategy)

  return { state, stressElevated, hrvDown, sleepLow, strategy, guidance }
}

function buildGuidance(strategy: RegStrategy): string | null {
  if (strategy === 'response_modulation') {
    return 'Activación alta y ventana angosta. Primero baja el arousal: respiración lenta, moverte, cortar el estímulo. No es momento de razonar el problema — eso rinde después, no ahora.'
  }
  if (strategy === 'reappraisal') {
    return 'Tensionado pero dentro de la ventana. Acá un reencuadre ayuda más que aguantar: ¿qué otra lectura tiene esto? ¿qué le dirías a un amigo en tu lugar?'
  }
  return null // 'steady' → nada que sugerir
}

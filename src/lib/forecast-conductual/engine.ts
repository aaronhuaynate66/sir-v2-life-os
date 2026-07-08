// SIR V2 — Motor de forecast conductual (§10-12 del spec). PURO, testeable.
//
// Toma la serie de señales diarias (+ anclas confirmadas opcionales) y corre un
// ENSAMBLE de modelos simples (grid periódico, intervalos entre picos,
// autocorrelación, regresión armónica, Bayes-con-anclas), los combina y proyecta
// UNA ventana conductual candidata de 5 días (±2) / 7 (±3). Con anclas → modo
// calibrado; sin anclas → exploratorio. NO dice "período/ovulación": ventana de
// patrón. Ético (doc 17): tendencia, no certeza; cuidado, no ventaja.

import type { BehaviorForecast, CycleAnchor, DailySignal, ModelOutput } from './types'

const DAY_MS = 86_400_000
const P_MIN = 24
const P_MAX = 35

// ─── utilidades de fecha (índice de día desde el inicio de la serie, en UTC) ──
function toT(iso: string): number { return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) }
function isoAt(startT: number, index: number): string {
  const d = new Date(startT + index * DAY_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 }
function std(xs: number[]): number { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) }

/** Proyecta un índice-base hacia adelante sumando P hasta alcanzar minIndex. */
function projectForward(baseIndex: number, period: number, minIndex: number): number {
  let i = baseIndex
  if (period <= 0) return i
  while (i < minIndex) i += period
  // si base ya estaba muy adelante, retrocedé al primero >= min
  while (i - period >= minIndex) i -= period
  return i
}

// ─── modelos ──────────────────────────────────────────────────────────────
/** Grid periódico (§10.2): busca (P, fase) que mejor concentra los picos. */
function gridModel(peaks: number[], todayIndex: number): ModelOutput {
  if (peaks.length < 2) return { name: 'grid', periodDays: null, centerIndex: null, score: 0 }
  let best = { period: 0, phase: 0, conc: -1 }
  for (let P = P_MIN; P <= P_MAX; P++) {
    for (let phase = 0; phase < P; phase++) {
      let conc = 0
      for (const pk of peaks) {
        const off = ((pk - phase) % P + P) % P
        const dist = Math.min(off, P - off) // distancia circular a la fase
        conc += Math.max(0, 1 - dist / 3) // kernel triangular ±3 días
      }
      if (conc > best.conc) best = { period: P, phase, conc }
    }
  }
  const center = projectForward(best.phase, best.period, todayIndex)
  const score = Math.max(0, Math.min(1, best.conc / peaks.length))
  return { name: 'grid', periodDays: best.period, centerIndex: center, score }
}

/** Intervalos entre picos (§10.4): mediana de los gaps que caen en [P_MIN,P_MAX]. */
function interpeakModel(peaks: number[], todayIndex: number): ModelOutput {
  if (peaks.length < 2) return { name: 'interpeak', periodDays: null, centerIndex: null, score: 0 }
  const diffs: number[] = []
  for (let i = 1; i < peaks.length; i++) diffs.push(peaks[i] - peaks[i - 1])
  const inband = diffs.filter((d) => d >= P_MIN - 3 && d <= P_MAX + 3)
  if (inband.length === 0) return { name: 'interpeak', periodDays: null, centerIndex: null, score: 0 }
  const sorted = [...inband].sort((a, b) => a - b)
  const period = Math.round(sorted[Math.floor(sorted.length / 2)])
  const center = projectForward(peaks[peaks.length - 1], period, todayIndex)
  const tight = 1 - Math.min(1, std(inband) / 6) // menos dispersión → más score
  const score = Math.max(0, Math.min(1, (inband.length / diffs.length) * tight))
  return { name: 'interpeak', periodDays: period, centerIndex: center, score }
}

/** Autocorrelación (§10.1): mejor lag en [P_MIN,P_MAX] de la serie densa. */
function autocorrModel(series: number[], peaks: number[], todayIndex: number): ModelOutput {
  if (series.length < P_MAX + 5 || peaks.length === 0) return { name: 'autocorr', periodDays: null, centerIndex: null, score: 0 }
  const m = mean(series)
  const denom = series.reduce((s, x) => s + (x - m) ** 2, 0) || 1
  let best = { lag: 0, r: -1 }
  for (let L = P_MIN; L <= P_MAX; L++) {
    let num = 0
    for (let t = L; t < series.length; t++) num += (series[t] - m) * (series[t - L] - m)
    const r = num / denom
    if (r > best.r) best = { lag: L, r }
  }
  if (best.r <= 0) return { name: 'autocorr', periodDays: null, centerIndex: null, score: 0 }
  const center = projectForward(peaks[peaks.length - 1], best.lag, todayIndex)
  return { name: 'autocorr', periodDays: best.lag, centerIndex: center, score: Math.max(0, Math.min(1, best.r)) }
}

/** Regresión armónica (§10.3): fase de la onda que mejor ajusta al mejor P del grid. */
function harmonicModel(series: number[], periodHint: number | null, todayIndex: number): ModelOutput {
  const P = periodHint ?? 28
  if (series.length < P) return { name: 'harmonic', periodDays: null, centerIndex: null, score: 0 }
  const w = (2 * Math.PI) / P
  const m = mean(series)
  let A = 0, B = 0
  for (let t = 0; t < series.length; t++) { const y = series[t] - m; A += y * Math.sin(w * t); B += y * Math.cos(w * t) }
  A = (2 / series.length) * A; B = (2 / series.length) * B
  const R = Math.sqrt(A * A + B * B)
  if (R < 1e-4) return { name: 'harmonic', periodDays: null, centerIndex: null, score: 0 }
  // pico de R·sin(wt+δ) con δ=atan2(B,A) → wt+δ=π/2
  const delta = Math.atan2(B, A)
  let tPeak = ((Math.PI / 2 - delta) / w) % P
  if (tPeak < 0) tPeak += P
  const center = projectForward(Math.round(tPeak), P, todayIndex)
  const score = Math.max(0, Math.min(1, R / (std(series) || 1)))
  return { name: 'harmonic', periodDays: P, centerIndex: center, score }
}

/** Bayes con anclas (§10.5): si hay period_start confirmados, mandan ellos. */
function bayesModel(anchors: CycleAnchor[], startT: number, todayIndex: number): ModelOutput {
  const starts = anchors.filter((a) => a.type === 'period_start').map((a) => Math.round((toT(a.date) - startT) / DAY_MS)).sort((a, b) => a - b)
  if (starts.length === 0) return { name: 'bayes', periodDays: null, centerIndex: null, score: 0 }
  let period = 28
  if (starts.length >= 2) {
    const diffs: number[] = []
    for (let i = 1; i < starts.length; i++) diffs.push(starts[i] - starts[i - 1])
    const inband = diffs.filter((d) => d >= 20 && d <= 40)
    if (inband.length) period = Math.round(mean(inband))
  }
  const center = projectForward(starts[starts.length - 1], period, todayIndex)
  const score = starts.length >= 2 ? 0.95 : 0.7
  return { name: 'bayes', periodDays: period, centerIndex: center, score }
}

// ─── ensamble ───────────────────────────────────────────────────────────────
const W_ANCHORED: Record<ModelOutput['name'], number> = { bayes: 0.45, grid: 0.2, interpeak: 0.15, autocorr: 0.1, harmonic: 0.1 }
const W_EXPLORATORY: Record<ModelOutput['name'], number> = { grid: 0.34, interpeak: 0.28, autocorr: 0.22, harmonic: 0.16, bayes: 0 }

function confidenceLabel(score: number): BehaviorForecast['confidence']['label'] {
  if (score >= 0.75) return 'alta'
  if (score >= 0.6) return 'media-alta'
  if (score >= 0.45) return 'media'
  if (score >= 0.3) return 'baja-media'
  return 'baja'
}

export interface RunForecastInput {
  signals: DailySignal[]
  anchors?: CycleAnchor[]
  now?: Date
  /** Multiplicador por modelo aprendido del feedback (§17). Default 1 c/u. */
  weightBoost?: Partial<Record<ModelOutput['name'], number>>
}

/** Corre el ensamble y proyecta la ventana conductual. PURO. null si no hay data. */
export function runForecast(input: RunForecastInput): BehaviorForecast | null {
  const signals = input.signals
  if (!signals || signals.length < 8) return null
  const anchors = input.anchors ?? []
  const now = input.now ?? new Date()

  const startT = toT(signals[0].date)
  const lastT = toT(signals[signals.length - 1].date)
  const spanDays = Math.round((lastT - startT) / DAY_MS) + 1

  // Serie densa diaria del compuesto (0 en días sin actividad).
  const composite = new Array(spanDays).fill(0)
  const byDate = new Map(signals.map((s) => [s.date, s]))
  for (const s of signals) composite[Math.round((toT(s.date) - startT) / DAY_MS)] = s.composite

  // Picos: días con compuesto notablemente alto.
  const m = mean(composite)
  const sd = std(composite)
  const thr = Math.max(0.08, m + sd)
  const peaks: number[] = []
  for (let i = 0; i < composite.length; i++) if (composite[i] > thr) peaks.push(i)

  const nowIndex = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startT) / DAY_MS)
  const minFuture = Math.max(nowIndex, 0)

  const hasAnchors = anchors.some((a) => a.type === 'period_start')
  const grid = gridModel(peaks, minFuture)
  const models: ModelOutput[] = [
    grid,
    interpeakModel(peaks, minFuture),
    autocorrModel(composite, peaks, minFuture),
    harmonicModel(composite, grid.periodDays, minFuture),
    bayesModel(anchors, startT, minFuture),
  ]

  const boost = input.weightBoost ?? {}
  const baseW = hasAnchors ? W_ANCHORED : W_EXPLORATORY
  const W = Object.fromEntries((Object.keys(baseW) as ModelOutput['name'][]).map((k) => [k, baseW[k] * (boost[k] ?? 1)])) as Record<ModelOutput['name'], number>
  const valid = models.filter((mo) => mo.centerIndex != null && mo.score > 0 && W[mo.name] > 0)
  if (valid.length === 0) {
    return baseResult(hasAnchors, signals, peaks, anchors, spanDays, composite, byDate, startT, 'Sin patrón cíclico claro todavía — hace falta más historial.')
  }

  // Centro ponderado (peso base × score del modelo).
  let wsum = 0, cAcc = 0, pAcc = 0, pw = 0
  for (const mo of valid) {
    const w = W[mo.name] * mo.score
    wsum += w
    cAcc += w * (mo.centerIndex as number)
    if (mo.periodDays) { pAcc += w * mo.periodDays; pw += w }
  }
  const centerIndex = Math.round(cAcc / (wsum || 1))
  const periodDays = pw > 0 ? Math.round(pAcc / pw) : null
  const centerDate = isoAt(startT, centerIndex)

  // Confianza: acuerdo entre modelos + cobertura + anclas.
  const centers = valid.map((mo) => mo.centerIndex as number)
  const agreement = 1 - Math.min(1, std(centers) / 7)
  const cycles = periodDays ? spanDays / periodDays : 0
  const coverageScore = Math.max(0, Math.min(1, cycles / 4))
  const anchorScore = hasAnchors ? (anchors.filter((a) => a.type === 'period_start').length >= 2 ? 1 : 0.6) : 0.3
  const peakScore = Math.max(0, Math.min(1, peaks.length / 4))
  const confScore = Math.max(0, Math.min(1, 0.35 * agreement + 0.25 * coverageScore + 0.2 * anchorScore + 0.2 * peakScore))

  const dominant = [...valid].sort((a, b) => W[b.name] * b.score - W[a.name] * a.score).slice(0, 3).map((mo) => mo.name)

  return {
    mode: hasAnchors ? 'calibrated' : 'exploratory',
    centerDate,
    mainWindow: { start: isoAt(startT, centerIndex - 2), end: isoAt(startT, centerIndex + 2) },
    extendedWindow: { start: isoAt(startT, centerIndex - 3), end: isoAt(startT, centerIndex + 3) },
    periodDays,
    confidence: { label: confidenceLabel(confScore), score: Math.round(confScore * 100) / 100 },
    dominantModels: dominant,
    models,
    usualPattern: usualPattern(peaks, byDate, startT, composite.length),
    interpretation: hasAnchors
      ? 'Ventana conductual asociada a tu registro de ciclo. Orientativa, no un diagnóstico.'
      : 'Ventana conductual candidata (exploratoria). No es período confirmado — registrá qué pasa para calibrar.',
    coverage: { days: composite.length, activeDays: signals.length, spanDays, peaks: peaks.length, anchors: anchors.length },
  }
}

/** Δ de cada señal en los picos vs el baseline (fracción; UI lo muestra como %). */
function usualPattern(peaks: number[], byDate: Map<string, DailySignal>, startT: number, len: number): BehaviorForecast['usualPattern'] {
  const all = [...byDate.values()]
  const base = {
    friction: mean(all.map((s) => s.friction)), withdrawal: mean(all.map((s) => s.withdrawal)),
    sensitivity: mean(all.map((s) => s.sensitivity)), somatic: mean(all.map((s) => s.somatic)),
  }
  const peakSignals: DailySignal[] = []
  for (const pk of peaks) {
    for (let d = -1; d <= 1; d++) {
      const s = byDate.get(isoAt(startT, pk + d))
      if (s) peakSignals.push(s)
    }
  }
  const pk = {
    friction: mean(peakSignals.map((s) => s.friction)), withdrawal: mean(peakSignals.map((s) => s.withdrawal)),
    sensitivity: mean(peakSignals.map((s) => s.sensitivity)), somatic: mean(peakSignals.map((s) => s.somatic)),
  }
  const delta = (b: number, p: number) => (peakSignals.length === 0 ? 0 : b > 0.001 ? Math.round(((p - b) / b) * 100) / 100 : p > 0 ? 1 : 0)
  return {
    friction: delta(base.friction, pk.friction), withdrawal: delta(base.withdrawal, pk.withdrawal),
    sensitivity: delta(base.sensitivity, pk.sensitivity), somatic: delta(base.somatic, pk.somatic),
  }
}

function baseResult(
  hasAnchors: boolean, signals: DailySignal[], peaks: number[], anchors: CycleAnchor[],
  spanDays: number, composite: number[], byDate: Map<string, DailySignal>, startT: number, interpretation: string,
): BehaviorForecast {
  return {
    mode: hasAnchors ? 'calibrated' : 'exploratory',
    centerDate: null, mainWindow: null, extendedWindow: null, periodDays: null,
    confidence: { label: 'baja', score: 0.2 },
    dominantModels: [], models: [],
    usualPattern: usualPattern(peaks, byDate, startT, composite.length),
    interpretation,
    coverage: { days: composite.length, activeDays: signals.length, spanDays, peaks: peaks.length, anchors: anchors.length },
  }
}

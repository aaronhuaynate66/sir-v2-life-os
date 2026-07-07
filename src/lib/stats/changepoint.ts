// SIR V2 — Detección de un punto de cambio (change-point) en una serie. PURO.
//
// Encuentra el corte que mejor parte la serie en dos niveles distintos (máxima
// diferencia de medias, ponderada por el tamaño del segmento menor para no
// dispararse en los bordes). Devuelve null si el salto no supera el ruido. Base
// del "¿cuándo cambió esto?" — se enfrió/calentó una relación, un hábito, etc.

export interface ChangePoint {
  /** Índice del primer punto del segmento POSTERIOR (el corte cae antes de él). */
  index: number
  beforeAvg: number
  afterAvg: number
  /** afterAvg − beforeAvg (negativo = bajó). */
  delta: number
}

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }
function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1))
}

export interface ChangePointOpts {
  /** Puntos mínimos a cada lado del corte. */
  minSeg?: number
  /** El salto debe superar `kStd` desvíos de la serie para contar. */
  kStd?: number
}

export function detectChangePoint(series: number[], opts: ChangePointOpts = {}): ChangePoint | null {
  const minSeg = opts.minSeg ?? 2
  const kStd = opts.kStd ?? 0.9
  const n = series.length
  if (n < 2 * minSeg) return null

  const s = std(series)
  if (s === 0) return null // serie plana → sin cambio

  let best: ChangePoint | null = null
  let bestScore = 0
  for (let k = minSeg; k <= n - minSeg; k++) {
    const before = series.slice(0, k)
    const after = series.slice(k)
    const mb = mean(before), ma = mean(after)
    // Ponderar por el tamaño del segmento menor → cortes de borde valen menos.
    const score = Math.abs(ma - mb) * Math.sqrt((k * (n - k)) / n)
    if (score > bestScore) {
      bestScore = score
      best = { index: k, beforeAvg: Math.round(mb * 100) / 100, afterAvg: Math.round(ma * 100) / 100, delta: Math.round((ma - mb) * 100) / 100 }
    }
  }

  if (!best || Math.abs(best.delta) < kStd * s) return null // el salto no supera el ruido
  return best
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

export interface MultiChangePointOpts extends ChangePointOpts {
  /** Máximo de puntos a devolver (los más fuertes si sobran). */
  maxPoints?: number
}

/**
 * Detecta VARIOS puntos de cambio por segmentación binaria: encuentra el mejor
 * corte de la serie; si supera el ruido, parte y recurre sobre cada lado. El
 * umbral de significancia se mide contra el desvío GLOBAL de la serie (no el
 * del sub-segmento), así segmentos ya homogéneos no generan cortes espurios.
 * Devuelve los cortes ordenados por posición, con before/after recalculados
 * como el promedio de los segmentos ADYACENTES (entre cortes vecinos). []
 * cuando no hay ningún cambio real. PURO.
 */
export function detectChangePoints(series: number[], opts: MultiChangePointOpts = {}): ChangePoint[] {
  const minSeg = opts.minSeg ?? 3
  const kStd = opts.kStd ?? 0.9
  const maxPoints = opts.maxPoints ?? 6
  const n = series.length
  if (n < 2 * minSeg) return []
  const s = std(series)
  if (s === 0) return []
  const threshold = kStd * s

  // Segmentación binaria: pila de segmentos [lo,hi) a evaluar.
  const indices: number[] = []
  const stack: Array<[number, number]> = [[0, n]]
  while (stack.length > 0 && indices.length < maxPoints * 3) {
    const seg = stack.pop()
    if (!seg) break
    const [lo, hi] = seg
    const len = hi - lo
    if (len < 2 * minSeg) continue
    let bestK = -1, bestScore = 0, bestDelta = 0
    for (let k = minSeg; k <= len - minSeg; k++) {
      const mb = mean(series.slice(lo, lo + k))
      const ma = mean(series.slice(lo + k, hi))
      const score = Math.abs(ma - mb) * Math.sqrt((k * (len - k)) / len)
      if (score > bestScore) { bestScore = score; bestK = lo + k; bestDelta = ma - mb }
    }
    if (bestK < 0 || Math.abs(bestDelta) < threshold) continue
    indices.push(bestK)
    stack.push([lo, bestK])
    stack.push([bestK, hi])
  }
  if (indices.length === 0) return []
  indices.sort((a, b) => a - b)

  // Recalcular before/after de cada corte con el promedio de sus segmentos
  // adyacentes (entre cortes vecinos), y descartar los que ya no superan el ruido.
  const bounds = [0, ...indices, n]
  const segMeans = bounds.slice(0, -1).map((b, i) => mean(series.slice(b, bounds[i + 1])))
  const out: ChangePoint[] = []
  for (let i = 0; i < indices.length; i++) {
    const mb = segMeans[i], ma = segMeans[i + 1]
    if (Math.abs(ma - mb) < threshold) continue
    out.push({ index: indices[i], beforeAvg: round2(mb), afterAvg: round2(ma), delta: round2(ma - mb) })
  }
  if (out.length > maxPoints) {
    return [...out]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, maxPoints)
      .sort((a, b) => a.index - b.index)
  }
  return out
}

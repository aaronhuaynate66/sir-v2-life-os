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

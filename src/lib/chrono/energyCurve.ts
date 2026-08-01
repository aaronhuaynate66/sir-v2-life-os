// SIR V2 — Curva de energía por hora del día (11·M3). PURO.
//
// Agrupa self_metrics (energy/focus) por HORA local de Lima (UTC-5) y arma un
// perfil promedio: dónde está el pico matinal y dónde el bajón. Puramente
// observacional. Honesto: una hora con <3 muestras NO se dibuja (queda hueco, no
// se interpola). Si sólo registras de noche, lo dice en vez de inventar la mañana.

const LIMA_OFFSET_MS = 5 * 3_600_000
const MIN_SAMPLES_PER_HOUR = 3
const MIN_HOURS_COVERED = 4

export interface HourSample {
  value: number
  /** ISO timestamp (self_metrics.timestamp). */
  timestamp: string
}

export interface HourBucket {
  /** Hora local de Lima (0-23). */
  hour: number
  avg: number
  samples: number
}

export interface EnergyCurve {
  /** Sólo las horas con ≥3 muestras, ordenadas por hora. */
  buckets: HourBucket[]
  /** Hora del pico (mayor promedio) entre las cubiertas, o null. */
  peakHour: number | null
  /** Hora del bajón (menor promedio), o null. */
  troughHour: number | null
  sufficient: boolean
}

/** Hora local de Lima (0-23) de un instante ISO. */
function limaHour(iso: string): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return new Date(t - LIMA_OFFSET_MS).getUTCHours()
}

/**
 * Perfil de energía por hora. `samples` = self_metrics de una categoría con su
 * timestamp. PURO.
 */
export function computeEnergyCurve(samples: HourSample[]): EnergyCurve {
  const byHour = new Map<number, number[]>()
  for (const s of samples) {
    const h = limaHour(s.timestamp)
    if (h === null || !Number.isFinite(s.value)) continue
    const arr = byHour.get(h) ?? []
    arr.push(s.value)
    byHour.set(h, arr)
  }

  const buckets: HourBucket[] = [...byHour.entries()]
    .filter(([, vals]) => vals.length >= MIN_SAMPLES_PER_HOUR)
    .map(([hour, vals]) => ({ hour, avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, samples: vals.length }))
    .sort((a, b) => a.hour - b.hour)

  const sufficient = buckets.length >= MIN_HOURS_COVERED

  let peakHour: number | null = null
  let troughHour: number | null = null
  if (sufficient) {
    peakHour = buckets.reduce((best, b) => (b.avg > best.avg ? b : best)).hour
    troughHour = buckets.reduce((worst, b) => (b.avg < worst.avg ? b : worst)).hour
  }

  return { buckets, peakHour, troughHour, sufficient }
}

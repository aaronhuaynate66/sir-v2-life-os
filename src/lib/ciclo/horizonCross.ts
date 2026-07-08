// SIR V2 — Cruce de los dos horizontes (real ↔ conductual). PURO.
//
// El horizonte REAL (fechas del ciclo) predice el próximo período. El horizonte
// CONDUCTUAL (patrón del chat) predice una VENTANA donde suele aparecer fricción/
// retiro/sensibilidad/somático. Ese patrón NO cae en el día 1 del período: suele
// picar en la ventana SPM (lútea tardía, ~5 días ANTES del período). Por eso
// comparar el centro conductual contra el INICIO del período (lo que hacíamos)
// marca "difieren ~4-5d" incluso cuando en realidad coinciden.
//
// Este helper cruza HONESTAMENTE: arma la ventana SPM→período del ciclo real y
// mide si SE SOLAPA con la ventana conductual. Rango vs rango, no punto vs punto.
//
// LÍNEA ÉTICA (doc 17): coincidencia, no causa. Dos estimaciones que apuntan a lo
// mismo dan más confianza para CUIDAR mejor, nunca para diagnosticar ni gestionar.

const DAY_MS = 86_400_000

/** Parse de 'YYYY-MM-DD' a ms UTC (mediodía evita bordes de zona). null si inválido. */
function dayMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? t : null
}

function isoOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export interface HorizonCross {
  /** ¿Se solapan la ventana conductual y la ventana SPM→período? */
  overlap: boolean
  /** 0 si solapan; si no, días enteros entre los bordes más cercanos. */
  gapDays: number
  /** Ventana SPM→período del ciclo real (para mostrarla). */
  pmsFrom: string
  pmsTo: string
  /** Ventana conductual efectiva usada en el cruce. */
  behaviorFrom: string
  behaviorTo: string
}

export interface CrossHorizonsInput {
  /** Ventana conductual (de la forecast). Si falta, se deriva del centro ±halfWidth. */
  behaviorStart?: string | null
  behaviorEnd?: string | null
  behaviorCenter?: string | null
  /** Próximo período estimado por el ciclo real (cyclePhase.nextPeriodIso). */
  nextPeriodIso?: string | null
  /** Días de SPM antes del período (default 5, = PMS_DAYS de phase.ts). */
  pmsLeadDays?: number
  /** Medio ancho si solo hay centro conductual (default 2 → ventana de 5 días). */
  halfWidthDays?: number
}

/**
 * Cruza el horizonte conductual con la ventana SPM→período del ciclo real.
 * Devuelve null si falta cualquiera de los dos horizontes (no hay nada que cruzar).
 */
export function crossHorizons(input: CrossHorizonsInput): HorizonCross | null {
  const nextPeriod = dayMs(input.nextPeriodIso)
  if (nextPeriod == null) return null

  // Ventana conductual: usa [start, end] si vienen; si no, centro ± halfWidth.
  const halfWidth = Math.max(0, input.halfWidthDays ?? 2)
  let bFrom = dayMs(input.behaviorStart)
  let bTo = dayMs(input.behaviorEnd)
  if (bFrom == null || bTo == null) {
    const center = dayMs(input.behaviorCenter)
    if (center == null) return null
    bFrom = center - halfWidth * DAY_MS
    bTo = center + halfWidth * DAY_MS
  }
  if (bFrom > bTo) [bFrom, bTo] = [bTo, bFrom]

  // Ventana SPM→período del ciclo: [período - pmsLead, período + 1] (el patrón
  // suele preceder al período; +1 día tolera que se extienda al día 1).
  const pmsLead = Math.max(0, input.pmsLeadDays ?? 5)
  const pFrom = nextPeriod - pmsLead * DAY_MS
  const pTo = nextPeriod + 1 * DAY_MS

  // Solape de rangos [bFrom,bTo] vs [pFrom,pTo].
  const overlap = bFrom <= pTo && pFrom <= bTo
  // Gap = distancia entre los bordes más cercanos (0 si solapan).
  const gapMs = overlap ? 0 : Math.min(Math.abs(bFrom - pTo), Math.abs(pFrom - bTo))
  const gapDays = Math.round(gapMs / DAY_MS)

  return {
    overlap,
    gapDays,
    pmsFrom: isoOf(pFrom),
    pmsTo: isoOf(pTo),
    behaviorFrom: isoOf(bFrom),
    behaviorTo: isoOf(bTo),
  }
}

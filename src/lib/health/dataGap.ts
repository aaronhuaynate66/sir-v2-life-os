// SIR V2 — Aviso de data de salud faltante.
//
// La salud entra a SIR por carga MANUAL de capturas (báscula, sueño, FC). Si
// Aaron deja de cargar unos días, SIR se queda ciego y no puede monitorear ni
// detectar anomalías (justo lo que pasó: estuvo mal y no cargó nada). Esto lo
// cierra: si la última métrica es de hace ≥ N días, el brief se lo recuerda.
//
// Filosofía (igual que bodySignal/vitalsAnomaly): calma, sin culpa, sin
// alarmismo. Un recordatorio amable, no un reproche. Sin emoji.

/** Umbral por defecto: a los 3 días sin cargar, vale recordar. */
export const DEFAULT_GAP_DAYS = 3

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Días enteros entre dos fechas 'YYYY-MM-DD' (b - a). null si alguna es inválida. */
function daysBetween(aIso: string, bIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aIso) || !/^\d{4}-\d{2}-\d{2}$/.test(bIso)) return null
  const a = Date.parse(aIso + 'T00:00:00Z')
  const b = Date.parse(bIso + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  const mi = Number(m) - 1
  return `${Number(d)} ${MESES[mi] ?? m}`
}

/**
 * Devuelve un recordatorio si la última carga de salud es de hace ≥ thresholdDays,
 * o null si está al día (o si nunca hubo data → no molestamos con esto).
 *
 * @param lastLoadIso  fecha más reciente con data de salud ('YYYY-MM-DD') o null.
 * @param todayIso     hoy ('YYYY-MM-DD').
 */
export function healthDataGap(
  lastLoadIso: string | null,
  todayIso: string,
  thresholdDays: number = DEFAULT_GAP_DAYS,
): string | null {
  if (!lastLoadIso) return null // sin historial no arrancamos a molestar
  const gap = daysBetween(lastLoadIso, todayIso)
  if (gap === null || gap < thresholdDays) return null
  return `Hace ${gap} días que no cargás datos de salud (última vez: ${fechaCorta(lastLoadIso)}). Cuando puedas, mandame las capturas de la báscula y el sueño para seguir monitoreándote.`
}

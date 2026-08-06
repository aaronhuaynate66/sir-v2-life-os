// SIR V2 — ⚠️ SUPERADA · NO USAR · el aviso bueno es `lib/health/missingData.ts`.
//
// (Antes este encabezado decía "Aviso de data de salud faltante", así que ganaba el
// grep contra el módulo que sí hay que usar: quien buscara el aviso de data de salud
// caía primero acá. El título ahora dice a dónde ir.)
//
// ⚠️ SUPERADA el 4-ago-2026. NO volver a cablearla al brief.
//
// Este detector mira la data de salud MÁS RECIENTE DE CUALQUIER TIPO, y ese
// agregado tapa lo que importa. El caso que lo jubiló: Aaron reclamó que llevaba
// días sin pesarse y SIR no le decía nada; esa misma tarde mandó capturas de sueño y
// de FC/VFC, así que el gap agregado bajó a 1 día y el aviso siguió sin sonar —
// mientras su PESO llevaba 5 días sin actualizarse.
//
// "No cargas datos de salud" y "no te pesas" son preguntas distintas. Usar
// `computeMissingHealthData` + `dataFaltanteLine` de `lib/health/missingData.ts`,
// que ya razonan por GRUPO (báscula / sueño / FC-VFC del día) y solo sobre lo que él
// sube habitualmente — y son las mismas que usa la tarjeta de `/salud`, así que no
// hay dos fuentes de verdad que puedan contradecirse.
//
// Se deja el archivo y sus tests porque documentan el criterio de umbral; el que la
// use para un aviso nuevo va a repetir el mismo agujero.
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
  return `Hace ${gap} días que no cargas datos de salud (última vez: ${fechaCorta(lastLoadIso)}). Cuando puedas, mándame las capturas de la báscula y el sueño para seguir monitoreándote.`
}

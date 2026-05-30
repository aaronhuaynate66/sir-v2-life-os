// SIR V2 — Fase lunar (util puro determinístico).
//
// Computa la fase lunar de UNA fecha cualquiera (no solo "hoy"), sin
// dependencias externas. Usado por:
//   - Dashboard (/panel) para mostrar la fase actual.
//   - Cualquier evento/memoria fechado (compute-on-read) para overlay
//     futuro de correlación lunar (Fase 3c).
//
// MODELO:
//   - Mes sinódico medio: 29.53058867 dias.
//   - Luna nueva de referencia: 2000-01-06 18:14:00 UTC (epoch JDN
//     2451550.26041667). Fuente: Astronomical Algorithms (Meeus) §49.
//   - ageDays = (JDfecha - JDref) mod sinódico, en [0, 29.53).
//   - illumination ≈ (1 - cos(2π·age/sinódico)) / 2, en [0, 1].
//
// Precisión: ±0.5 dias respecto del valor real (la luna nueva varia
// ±~6 horas por excentricidad orbital). Suficiente para UI de fase
// nombrada y discreta.

export type LunarPhaseId =
  | 'new'
  | 'waxing_crescent'
  | 'first_quarter'
  | 'waxing_gibbous'
  | 'full'
  | 'waning_gibbous'
  | 'last_quarter'
  | 'waning_crescent'

export interface LunarPhase {
  /** Identificador discreto. */
  phase: LunarPhaseId
  /** Nombre en español, listo para UI ("Luna llena"). */
  label: string
  /** Símbolo Unicode de la fase ("🌑", "🌒", ...). Útil para chips. */
  symbol: string
  /** Iluminación 0-1 (0 = nueva, 1 = llena). */
  illumination: number
  /** Días desde la última luna nueva, [0, 29.53). */
  ageDays: number
  /** True si la luna esta creciendo (waxing), false si menguando (waning). */
  waxing: boolean
}

const SYNODIC_MONTH = 29.53058867
// Luna nueva de referencia: 2000-01-06 18:14 UTC = JDN 2451550.26041667.
const REF_NEW_MOON_JD = 2451550.26041667

/** Convierte un Date JS a Julian Day Number (UTC). */
function toJulianDay(date: Date): number {
  // ms desde Unix epoch (1970-01-01 UTC) = JDN 2440587.5
  return date.getTime() / 86_400_000 + 2440587.5
}

/** Modulo positivo: % nativo de JS puede dar negativo con dividendos
 *  negativos; aca queremos siempre [0, divisor). */
function mod(a: number, b: number): number {
  return ((a % b) + b) % b
}

// Boundaries = midpoints entre los 8 centros equispaciados (SYNODIC/8).
// La fase 'new' STRADDLES la frontera del mes sinódico: vive en
// [0, 1.84566) Y en [27.68493, SYNODIC]. Lo manejamos con una check
// extra en lookupPhase() para no romper la convención del lookup
// estrictamente creciente.
const NEW_WRAPAROUND_START = 27.68493

const PHASE_TABLE: Array<{
  id: LunarPhaseId
  label: string
  symbol: string
  /** Inicio del rango en ageDays (inclusive). */
  start: number
  /** Fin del rango en ageDays (exclusive). */
  end: number
}> = [
  { id: 'new', label: 'Luna nueva', symbol: '🌑', start: 0, end: 1.84566 },
  { id: 'waxing_crescent', label: 'Creciente iluminante', symbol: '🌒', start: 1.84566, end: 5.53699 },
  { id: 'first_quarter', label: 'Cuarto creciente', symbol: '🌓', start: 5.53699, end: 9.22831 },
  { id: 'waxing_gibbous', label: 'Gibosa creciente', symbol: '🌔', start: 9.22831, end: 12.91963 },
  { id: 'full', label: 'Luna llena', symbol: '🌕', start: 12.91963, end: 16.61096 },
  { id: 'waning_gibbous', label: 'Gibosa menguante', symbol: '🌖', start: 16.61096, end: 20.30228 },
  { id: 'last_quarter', label: 'Cuarto menguante', symbol: '🌗', start: 20.30228, end: 23.99361 },
  { id: 'waning_crescent', label: 'Menguante final', symbol: '🌘', start: 23.99361, end: NEW_WRAPAROUND_START },
]

// La propiedad waxing/waning es geometrica (creciendo vs decreciendo),
// derivada de ageDays — NO del phase id. El phase 'new' straddles la
// frontera del mes sinódico (ver NEW_WRAPAROUND_START), entonces:
//   - 'new' con ageDays en [0, 1.85)         -> waxing (justo despues de
//     la luna nueva geometrica, iluminacion creciendo).
//   - 'new' con ageDays en [27.69, 29.53]    -> waning (a horas de la
//     proxima nueva, iluminacion aun decreciendo a 0).
// Convencion: waxing = primera mitad del mes sinódico [0, SYNODIC/2).
const HALF_SYNODIC = SYNODIC_MONTH / 2

function lookupPhase(ageDays: number): { id: LunarPhaseId; label: string; symbol: string } {
  // 'new' phase wrap-around: [27.685, SYNODIC] cae aca antes de revisar
  // la tabla. La luna que esta a 1 dia de ser nueva debe etiquetarse
  // 'new', no 'waning_crescent'.
  if (ageDays >= NEW_WRAPAROUND_START) return PHASE_TABLE[0]
  for (const row of PHASE_TABLE) {
    if (ageDays >= row.start && ageDays < row.end) return row
  }
  // Defensivo: si ageDays cae justo en SYNODIC_MONTH por flotantes.
  return PHASE_TABLE[0]
}

/**
 * Fase lunar de una fecha. La fecha se interpreta en UTC (la posicion de
 * la luna no depende de TZ local — un evento a las 21:00 Lima es el
 * mismo instante UTC para todo el planeta).
 *
 * @param date Date JS. Default: Date.now() (fase actual).
 */
export function moonPhase(date: Date = new Date()): LunarPhase {
  const jd = toJulianDay(date)
  const ageDays = mod(jd - REF_NEW_MOON_JD, SYNODIC_MONTH)

  const phaseAngle = (ageDays / SYNODIC_MONTH) * 2 * Math.PI
  const illumination = (1 - Math.cos(phaseAngle)) / 2

  const meta = lookupPhase(ageDays)
  return {
    phase: meta.id,
    label: meta.label,
    symbol: meta.symbol,
    illumination,
    ageDays,
    waxing: ageDays < HALF_SYNODIC,
  }
}

/**
 * Helper liviano cuando solo querés el id de fase. Equivalente a
 * `moonPhase(date).phase` pero evita construir el objeto completo si
 * solo lo necesitás para etiquetar al vuelo (ej. en una lista grande).
 */
export function moonPhaseId(date: Date): LunarPhaseId {
  const jd = toJulianDay(date)
  const ageDays = mod(jd - REF_NEW_MOON_JD, SYNODIC_MONTH)
  return lookupPhase(ageDays).id
}

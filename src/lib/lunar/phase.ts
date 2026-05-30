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

// Bucketing NO equiespaciado: las 4 fases cardinales (nueva, cuarto
// creciente, llena, cuarto menguante) ocupan ventanas ANGOSTAS (1 día
// ≈ half-width 0.5 días) alrededor de su centro exacto. Las 4 fases
// intermedias llenan el resto.
//
// Razon del cambio (Sesion 7 fix): el bucketing equiespaciado previo
// metia age=13.77 (2026-05-30, llena REAL al 100% recien el 31)
// dentro de 'full' a 99% — etiqueta visualmente equivocada vs la app
// de referencia. Una ventana angosta para llena ([14.27, 15.27])
// coloca al 30/05 en 'waxing_gibbous' (correcto) y reserva 'full'
// para el dia del pico real.
//
// Centros (SYNODIC * k/4):
//   new=0, first_quarter=7.38265, full=14.76529, last_quarter=22.14794
//
// La fase 'new' STRADDLES el mes sinódico: vive en [SYNODIC-0.5, SYNODIC]
// (wrap) Y en [0, 0.5). Lo maneja lookupPhase() con un check explicito
// antes de la tabla.
const CARDINAL_HALF_WIDTH = 0.5
const NEW_END = CARDINAL_HALF_WIDTH // 0.5
const NEW_WRAPAROUND_START = SYNODIC_MONTH - CARDINAL_HALF_WIDTH // 29.03058867
const FIRST_QUARTER_CENTER = SYNODIC_MONTH * 0.25 // 7.38264717
const FULL_CENTER = SYNODIC_MONTH * 0.5 // 14.76529434
const LAST_QUARTER_CENTER = SYNODIC_MONTH * 0.75 // 22.14794150

const PHASE_TABLE: Array<{
  id: LunarPhaseId
  label: string
  symbol: string
  /** Inicio del rango en ageDays (inclusive). */
  start: number
  /** Fin del rango en ageDays (exclusive). */
  end: number
}> = [
  // 'new' está en index 0 SOLO para la mitad [0, 0.5). La mitad de wrap
  // se resuelve en lookupPhase() antes de iterar la tabla.
  { id: 'new', label: 'Luna nueva', symbol: '🌑', start: 0, end: NEW_END },
  {
    id: 'waxing_crescent',
    label: 'Luna creciente',
    symbol: '🌒',
    start: NEW_END,
    end: FIRST_QUARTER_CENTER - CARDINAL_HALF_WIDTH,
  },
  {
    id: 'first_quarter',
    label: 'Cuarto creciente',
    symbol: '🌓',
    start: FIRST_QUARTER_CENTER - CARDINAL_HALF_WIDTH,
    end: FIRST_QUARTER_CENTER + CARDINAL_HALF_WIDTH,
  },
  {
    id: 'waxing_gibbous',
    label: 'Creciente gibosa',
    symbol: '🌔',
    start: FIRST_QUARTER_CENTER + CARDINAL_HALF_WIDTH,
    end: FULL_CENTER - CARDINAL_HALF_WIDTH,
  },
  {
    id: 'full',
    label: 'Luna llena',
    symbol: '🌕',
    start: FULL_CENTER - CARDINAL_HALF_WIDTH,
    end: FULL_CENTER + CARDINAL_HALF_WIDTH,
  },
  {
    id: 'waning_gibbous',
    label: 'Menguante gibosa',
    symbol: '🌖',
    start: FULL_CENTER + CARDINAL_HALF_WIDTH,
    end: LAST_QUARTER_CENTER - CARDINAL_HALF_WIDTH,
  },
  {
    id: 'last_quarter',
    label: 'Cuarto menguante',
    symbol: '🌗',
    start: LAST_QUARTER_CENTER - CARDINAL_HALF_WIDTH,
    end: LAST_QUARTER_CENTER + CARDINAL_HALF_WIDTH,
  },
  {
    id: 'waning_crescent',
    label: 'Luna menguante',
    symbol: '🌘',
    start: LAST_QUARTER_CENTER + CARDINAL_HALF_WIDTH,
    end: NEW_WRAPAROUND_START,
  },
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

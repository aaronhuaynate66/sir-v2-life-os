// SIR V2 — Resolución del input de cumpleaños (puro).
//
// Cuando SIR pregunta "¿cuándo cumple X?" el usuario puede saber el día/mes pero
// NO el año de nacimiento. Forzar un año (como hacía el date-picker) es malo: el
// año de `people.birth_date` se usa para MOSTRAR la edad → un año inventado le
// pone una edad falsa a la persona. Solución honesta, coherente con el resto del
// sistema (ver birthdayDetect.ts / BirthdayCountdown DetectedBody):
//   - con año  → va a birth_date (afirma edad, porque la sabes).
//   - sin año  → va a special_dates como "Cumpleaños de X" recurrente. El
//     countdown usa solo día/mes; nunca inventa la edad. El año-relleno es un
//     placeholder para tener un YYYY-MM-DD parseable; NUNCA se muestra.

/** Año-relleno para el YYYY-MM-DD de un cumple sin año. Bisiesto → acepta 29-feb.
 *  Nunca se muestra (los cumples se renderizan solo día/mes). */
export const BIRTHDAY_FILLER_YEAR = 2000

export type BirthdayResolve =
  | { ok: true; mode: 'birthDate' | 'special'; iso: string }
  | { ok: false; error: string }

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Nombres de los 12 meses (para poblar el select). */
export function monthLabels(): string[] {
  return MONTHS_ES.slice()
}

const pad = (n: number) => String(n).padStart(2, '0')

function toInt(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : null
}

/** Fecha real (evita 31-feb): construye local y verifica round-trip. */
function isRealDate(y: number, month1: number, day: number): boolean {
  const d = new Date(y, month1 - 1, day)
  return d.getFullYear() === y && d.getMonth() === month1 - 1 && d.getDate() === day
}

export interface ResolveOpts {
  /** Año máximo aceptable (default 2100). El caller suele pasar el año actual
   *  para que un año futuro no genere una edad negativa. */
  maxYear?: number
  /** Año mínimo aceptable (default 1900; birth_date < 1900 no se grafica). */
  minYear?: number
}

/**
 * Resuelve día + mes (+ año opcional) a un plan de guardado.
 * `month` es 1-12. `year` vacío/null → modo 'special' (sin año, año-relleno).
 */
export function resolveBirthdayInput(
  dayRaw: string | number,
  monthRaw: string | number,
  yearRaw?: string | number | null,
  opts: ResolveOpts = {},
): BirthdayResolve {
  const day = toInt(dayRaw)
  const month = toInt(monthRaw)
  if (day === null || month === null) return { ok: false, error: 'Elige día y mes.' }
  if (month < 1 || month > 12) return { ok: false, error: 'Mes inválido.' }
  if (day < 1 || day > 31) return { ok: false, error: 'Día inválido.' }

  const year = toInt(yearRaw)
  if (year !== null) {
    const minY = opts.minYear ?? 1900
    const maxY = opts.maxYear ?? 2100
    if (year < minY || year > maxY) return { ok: false, error: `Año fuera de rango (${minY}–${maxY}).` }
    if (!isRealDate(year, month, day)) return { ok: false, error: 'Esa fecha no existe.' }
    return { ok: true, mode: 'birthDate', iso: `${year}-${pad(month)}-${pad(day)}` }
  }

  // Sin año: validamos día/mes contra el año-relleno (bisiesto → 29-feb OK).
  if (!isRealDate(BIRTHDAY_FILLER_YEAR, month, day)) return { ok: false, error: 'Ese día no existe en ese mes.' }
  return { ok: true, mode: 'special', iso: `${BIRTHDAY_FILLER_YEAR}-${pad(month)}-${pad(day)}` }
}

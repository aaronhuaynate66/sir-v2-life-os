// SIR V2 — Parsing/formatting de fechas date-only en TZ LOCAL.
//
// PROBLEMA QUE RESUELVE (bug de clase off-by-one):
//   `new Date('2026-05-30')` interpreta el string como medianoche UTC.
//   Al formatearlo en una TZ con offset negativo (Lima, UTC-5) retrocede
//   al 29 may. Cualquier campo date-only (`YYYY-MM-DD`) renderizado vía
//   `new Date(str)` + Intl sufre este shift.
//
// SOLUCIÓN:
//   Parsear los componentes Y-M-D y construir con `new Date(y, m-1, d)`,
//   que interpreta en TZ LOCAL. El Date resultante representa medianoche
//   local del día correcto y formatea sin correrse.
//
// IMPORTANTE — NO usar esto para timestamps completos (timestamptz con
// hora, ej. observations.observed_at / person_logs.logged_at). Esos sí
// llevan zona horaria y `new Date(iso)` los parsea bien. Este helper es
// SOLO para fechas date-only sin componente horario:
//   - people.birth_date
//   - people.cycle_start_date
//   - person.lastContact (fecha de contacto manual)
//
// Promovido desde src/lib/ciclo/phase.ts (Sesión detail-page) para
// reusarse en todos los renderers date-only y evitar reincidencia.

/**
 * Parsea una fecha date-only (`YYYY-MM-DD`, o el prefijo de un timestamp)
 * como medianoche en TZ LOCAL. Devuelve null si el string no contiene una
 * fecha válida (incluye validación por round-trip: rechaza 2026-02-30,
 * 1990-02-29 en año no bisiesto, etc.).
 */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  const dt = new Date(y, mo, d)
  // Round-trip: si JS desbordó el mes (ej. feb-30 → mar-02) la fecha era
  // inválida. Comparar los componentes locales lo detecta.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

/**
 * Serializa un Date a `YYYY-MM-DD` usando sus componentes LOCALES (no
 * toISOString, que volvería a UTC y podría correr el día).
 */
export function toIsoLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

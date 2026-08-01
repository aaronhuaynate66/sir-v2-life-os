// SIR V2 — ¿Este error es "la columna no existe"? PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Varias lecturas del repo son PRE-MIGRATION-SAFE: aplican un filtro y, si rompe,
// reintentan sin él, para no acoplar el deploy a las migraciones. La idea es
// buena. El problema es CÓMO estaba escrito el reintento:
//
//     let { data, error } = await build(true, true)
//     if (error) ({ data, error } = await build(true, false))   // ← cualquier error
//     if (error) ({ data, error } = await build(false, false))  // ← cualquier error
//
// `if (error)` no distingue "la columna no existe todavía" de un timeout, un corte
// de red o un 500 de PostgREST. Y en `memories/fetch.ts` el filtro que se cae
// primero es **`is_private`**, cuya docstring promete que *"filtrar acá garantiza
// por construcción que una memoria privada NO viaje a ningún prompt"*.
//
// O sea: una garantía de privacidad que **se degrada abriéndose** ante cualquier
// error transitorio. Es el patrón contrario al que hay que tener — lo que protege
// datos falla CERRADO.
//
// Medido el 1-ago-2026: las dos columnas (`is_private` 0064, `is_obsolete` 0045)
// **ya existen en producción**, así que el fallback no protege de nada y solo
// deja la puerta abierta. Hoy hay 0 memorias privadas —no hay exposición real—,
// pero el botón de marcarlas existe y basta una.
//
// PURO: no toca red. Solo clasifica un error ya recibido.

/** Error tal como lo devuelve PostgREST/supabase-js. */
export interface ErrorPostgrest {
  code?: string | null
  message?: string | null
}

/** `42703` = undefined_column en Postgres. */
export const CODIGO_COLUMNA_INEXISTENTE = '42703'

/**
 * ¿El error dice que una columna no existe? PURA.
 *
 * Mira el código primero, que es lo estable. El texto es el respaldo porque
 * PostgREST no siempre propaga el `code` (el mensaje que sí manda es
 * `column x.y does not exist`, o su forma de schema cache).
 *
 * Ante la duda devuelve **false**: quien la usa reintenta sin un filtro de
 * seguridad, así que el default tiene que ser el que NO abre la puerta.
 */
export function esColumnaInexistente(error: ErrorPostgrest | null | undefined): boolean {
  if (!error) return false
  if (error.code === CODIGO_COLUMNA_INEXISTENTE) return true
  const m = (error.message ?? '').toLowerCase()
  if (!m) return false
  return (
    /column .+ does not exist/.test(m) ||
    /could not find the '.+' column/.test(m) ||
    /column .+ of relation .+ does not exist/.test(m)
  )
}

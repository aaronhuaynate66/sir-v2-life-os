// SIR V2 — Serializador CSV client-side (Export / data ownership).
//
// Genera CSV bien formado sin librerías: escape RFC 4180 (comas, comillas
// dobles, saltos de línea), null/undefined → vacío, unicode preservado.
// La lógica de serialización es pura y testeable; downloadCsv (browser-only,
// Blob + <a download>) queda aislada para no contaminar los tests.
//
// Convenciones:
//   - Separador de campo: coma.
//   - Separador de registro: CRLF (\r\n) — estándar RFC 4180, Excel-friendly.
//   - Un campo se entrecomilla SOLO si contiene coma, comilla doble, CR o LF.
//   - La comilla doble interna se duplica ("" ).
//   - BOM UTF-8 se agrega en downloadCsv (no en buildCsv) para que Excel
//     abra los acentos/unicode bien sin ensuciar el string puro.

const FIELD_SEP = ','
const RECORD_SEP = '\r\n'
const NEEDS_QUOTING = /[",\r\n]/

/**
 * Escapa un valor a un campo CSV. null/undefined → '' (no la cadena
 * "null"). Números/booleanos via String(). Entrecomilla y duplica comillas
 * sólo cuando hace falta.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : String(value)
  if (str === '') return ''
  if (NEEDS_QUOTING.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Una columna: encabezado + función que extrae el valor crudo de la fila. */
export interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

/**
 * Construye un CSV completo (header + filas) a partir de objetos tipados.
 * Devuelve sólo la línea de headers si `rows` está vacío (CSV válido, sin
 * datos). NO incluye BOM ni newline final.
 */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvValue(c.header)).join(FIELD_SEP)
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvValue(c.value(row))).join(FIELD_SEP),
  )
  return [headerLine, ...dataLines].join(RECORD_SEP)
}

/**
 * Dispara la descarga de un CSV en el browser. Agrega BOM UTF-8. No-op
 * fuera del browser (guard SSR). No se testea (efecto de DOM).
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const BOM = String.fromCharCode(0xfeff) // BOM UTF-8 para que Excel lea unicode.
  const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Nombre de archivo con fecha (YYYY-MM-DD) a partir de un prefijo. */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${prefix}_${y}-${m}-${d}.csv`
}

// SIR V2 — Extracción PURA de valor + fecha desde texto (trackers).
//
// La ingesta multi-pantallazo usa Vision (ver /api/trackers/extract), pero el
// tracker también tolera TEXTO PEGADO (ej. el cuerpo del mail de Google Flights
// "PEN 5,075 · ida y vuelta · sáb 6 jul"). Esta lógica es 100% pura y testeable:
// no llama a ningún modelo. Saca un número (el monto) y, si puede, una fecha.
//
// Reglas de número (separador de miles vs decimal, el dolor de siempre):
//   - Si aparecen ',' Y '.', el ÚLTIMO separador es el decimal
//     ("5,075.50" → 5075.5 ; "5.075,50" → 5075.5).
//   - Si aparece SOLO uno y le siguen exactamente 3 dígitos → es de MILES
//     ("5,075" → 5075 ; "5.075" → 5075).
//   - Si le siguen 1 o 2 dígitos → es DECIMAL ("5,5" → 5.5 ; "5.50" → 5.5).
//
// Si hay un símbolo/código de moneda, preferimos el número ADYACENTE a él (el
// precio), no el primer número del texto (que puede ser una hora, un nº de vuelo).

export interface ParsedTrackerValue {
  /** Monto numérico, o null si no se halló ninguno plausible. */
  value: number | null
  /** Fecha date-only ISO 'YYYY-MM-DD', o null si no se detectó. */
  date: string | null
  /** Unidad/moneda detectada (ej. 'PEN', 'USD'), o null. */
  unit: string | null
}

/** Tokens de moneda → código canónico. Orden: los más específicos primero. */
const CURRENCY_TOKENS: ReadonlyArray<{ re: RegExp; unit: string }> = [
  { re: /\bPEN\b/i, unit: 'PEN' },
  { re: /S\/\.?/, unit: 'PEN' },
  { re: /\bUSD\b/i, unit: 'USD' },
  { re: /US\$/, unit: 'USD' },
  { re: /\bEUR\b/i, unit: 'EUR' },
  { re: /€/, unit: 'EUR' },
  { re: /\$/, unit: 'USD' },
]

const MONTHS: Record<string, number> = {
  // español
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  // inglés
  jan: 1, apr: 4, aug: 8, dec: 12,
  // (mar/may/jun/jul/oct/nov/feb/sep coinciden con el español)
}

/** Convierte un literal numérico crudo (con separadores) a number. null si inválido. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned || !/\d/.test(cleaned)) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string

  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos presentes: el último es el decimal, el otro es separador de miles.
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const thousandSep = decimalSep === ',' ? '.' : ','
    normalized = cleaned.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const idx = lastComma >= 0 ? lastComma : lastDot
    const trailing = cleaned.length - idx - 1
    if (trailing === 3) {
      // 3 dígitos detrás → separador de MILES.
      normalized = cleaned.split(sep).join('')
    } else {
      // 1, 2 (o >3) dígitos → DECIMAL.
      normalized = cleaned.replace(sep, '.')
    }
  } else {
    normalized = cleaned
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

/** Detecta la primera moneda mencionada. */
export function detectUnit(text: string): string | null {
  for (const { re, unit } of CURRENCY_TOKENS) {
    if (re.test(text)) return unit
  }
  return null
}

/** Pad a 2 dígitos. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Extrae una fecha date-only del texto. Soporta:
 *   - ISO 'YYYY-MM-DD'
 *   - 'DD/MM/YYYY' o 'DD-MM-YYYY' (locale Perú: día primero)
 *   - 'DD mon[. ] [YYYY]' / 'mon DD[, YYYY]' con nombres de mes es/en
 * Si no hay año, usa `fallbackYear`. Devuelve 'YYYY-MM-DD' o null.
 */
export function extractDate(text: string, fallbackYear: number): string | null {
  // 1. ISO directo.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    const mo = Number(iso[2])
    const d = Number(iso[3])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  // 2. DD/MM/YYYY o DD-MM-YYYY (día primero).
  const dmy = text.match(/\b(\d{1,2})[/](\d{1,2})[/](\d{2,4})\b/)
  if (dmy) {
    const d = Number(dmy[1])
    const mo = Number(dmy[2])
    let y = Number(dmy[3])
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  // 3. Nombre de mes. 'DD mon YYYY?' o 'mon DD YYYY?'.
  const monthAlt = Object.keys(MONTHS).join('|')
  const dMonY = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${monthAlt})[a-z.]*\\.?(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'i')
  const monDY = new RegExp(`\\b(${monthAlt})[a-z.]*\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i')

  const m1 = text.match(dMonY)
  if (m1) {
    const d = Number(m1[1])
    const mo = MONTHS[m1[2].toLowerCase()]
    const y = m1[3] ? Number(m1[3]) : fallbackYear
    if (mo && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`
  }
  const m2 = text.match(monDY)
  if (m2) {
    const mo = MONTHS[m2[1].toLowerCase()]
    const d = Number(m2[2])
    const y = m2[3] ? Number(m2[3]) : fallbackYear
    if (mo && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`
  }

  return null
}


/**
 * Fecha de una LECTURA de tracker. Regla: una observación se fecha CUÁNDO la
 * capturás, no por una fecha escrita dentro del contenido. En una captura de
 * precio de vuelo, la fecha del texto es la del VUELO (futura), no la de cuándo
 * miraste el precio — usarla ensuciaba la serie (puntos en el futuro/pasado
 * equivocado). Por eso la lectura SIEMPRE se fecha con la fecha de captura.
 */
export function readingDate(captureDate: string): string {
  return captureDate
}

/**
 * Extrae { value, date, unit } de texto libre. `fallbackYear` se usa cuando la
 * fecha no trae año (default: 2026 si no se pasa — el caller debería pasar el
 * año actual). Si hay moneda, prioriza el número adyacente al símbolo.
 */
export function extractValueDateFromText(
  text: string,
  fallbackYear = 2026,
): ParsedTrackerValue {
  const unit = detectUnit(text)

  // Número adyacente a la moneda (precio), si hay moneda.
  let value: number | null = null
  if (unit) {
    // Busca "<moneda> <número>" o "<número> <moneda>" para cada token.
    for (const { re } of CURRENCY_TOKENS) {
      const src = re.source
      const after = new RegExp(`${src}\\s*([\\d][\\d.,]*)`, 'i')
      const before = new RegExp(`([\\d][\\d.,]*)\\s*${src}`, 'i')
      const ma = text.match(after)
      if (ma) { value = parseNumber(ma[1]); if (value != null) break }
      const mb = text.match(before)
      if (mb) { value = parseNumber(mb[1]); if (value != null) break }
    }
  }

  // Fallback: primer número "grande" plausible (≥ 2 dígitos enteros), evitando
  // capturar años sueltos como monto si ya tenemos moneda sin match.
  if (value == null) {
    const nums = text.match(/\d[\d.,]*\d|\d/g) ?? []
    for (const raw of nums) {
      const n = parseNumber(raw)
      if (n != null && n > 0) { value = n; break }
    }
  }

  const date = extractDate(text, fallbackYear)
  return { value, date, unit }
}

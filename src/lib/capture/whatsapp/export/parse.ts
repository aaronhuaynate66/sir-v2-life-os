// SIR V2 — Parser del export de WhatsApp (`_chat.txt`). PURO + testeable.
//
// WhatsApp exporta la conversación como texto plano con UNA línea por mensaje
// (más continuaciones multilínea). Hay dos familias de formato:
//
//   iOS:      [12/05/24, 21:03:11] Ana Pérez: hola              (corchetes)
//             [12/05/2024, 9:03:11 p. m.] Ana: hola             (12h + AM/PM)
//   Android:  12/05/24, 21:03 - Ana Pérez: hola                 (guion)
//             12/5/24, 9:03 p. m. - Ana: hola
//
// Las líneas que NO empiezan con un timestamp son CONTINUACIÓN del mensaje
// anterior (mensajes multilínea). Las líneas de "sistema" (cifrado E2E,
// cambios de grupo, llamadas, "Se eliminó este mensaje") no tienen
// "Autor: contenido" y se cuentan aparte. Los adjuntos/omitidos de media
// (`<adjunto: ...>`, `<Media omitted>`, `imagen omitida`, etc.) se reemplazan
// por "[media]" para que NO rompan el parseo ni contaminen la interpretación.

import type { ExportMessage, ParsedExport } from './types'

// Marcas Unicode que WhatsApp inyecta (bidi + narrow no-break space) y que
// ensucian el matching. Escapes Unicode a propósito (sin caracteres invisibles
// en el código + lint de irregular-whitespace contento).
//   200E LRM · 200F RLM · 202A-202E embeddings · 2066-2069 isolates.
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g
//   00A0 NBSP · 202F narrow NBSP.
const NBSP = /[  ]/g

/** Normaliza una línea: saca marcas bidi y unifica espacios raros. */
export function clean(line: string): string {
  return line.replace(BIDI_MARKS, '').replace(NBSP, ' ')
}

// Prefijo de timestamp iOS (con corchetes) y Android (con guion).
// Grupos: 1=fecha, 2=hora(+seg opc), 3=AM/PM opc, 4=resto (autor: contenido | texto sistema)
const IOS_PREFIX =
  /^\[(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?\s?m\.?)?\]\s*(.*)$/i
const ANDROID_PREFIX =
  /^(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?\s?m\.?)?\s*[-–]\s+(.*)$/i

interface PrefixMatch {
  date: string
  time: string
  ampm: string | null
  rest: string
  format: 'ios' | 'android'
}

/** Intenta reconocer el prefijo de timestamp de una línea ya limpia. */
export function matchPrefix(line: string): PrefixMatch | null {
  const ios = IOS_PREFIX.exec(line)
  if (ios) {
    return { date: ios[1], time: ios[2], ampm: ios[3] ?? null, rest: ios[4] ?? '', format: 'ios' }
  }
  const and = ANDROID_PREFIX.exec(line)
  if (and) {
    return { date: and[1], time: and[2], ampm: and[3] ?? null, rest: and[4] ?? '', format: 'android' }
  }
  return null
}

// Marcadores de media (es/en) — si el contenido los contiene, es un adjunto.
// Cubre el `<adjunto:/attached:>` de iOS y los "X omitido/omitted" de Android.
const MEDIA_PATTERNS: RegExp[] = [
  /<\s*(?:adjunto|attached)\s*:/i,
  /<\s*media\s+omitted\s*>/i,
  /<\s*multimedia\s+omitido\s*>/i,
  /\b(?:image|imagen|video|v[ií]deo|audio|sticker|gif|document|documento|contact card|tarjeta de contacto)\s+(?:omitted|omitido|omitida)\b/i,
  /\bse\s+omiti[oó]\b/i,
]

/** ¿El contenido del mensaje es un adjunto/omitido de media? */
function isMediaContent(content: string): boolean {
  return MEDIA_PATTERNS.some((re) => re.test(content))
}

// Patrones de líneas de sistema frecuentes (no tienen "Autor: contenido", o
// sí lo aparentan pero son del sistema). Sin "Autor:" → siempre sistema.
const SYSTEM_PATTERNS: RegExp[] = [
  /messages and calls are end-to-end encrypted/i,
  /los mensajes y las llamadas est[aá]n cifrados/i,
  /cifrado de extremo a extremo/i,
  /se elimin[oó] este mensaje|this message was deleted|you deleted this message/i,
  /missed (?:voice|video) call|llamada perdida|videollamada perdida/i,
  /changed (?:their|the) (?:phone number|group)/i,
  /created (?:this )?group|cre[oó] (?:este |el )?grupo/i,
  /added you|te a[nñ]adi[oó]|added/i,
  /left the group|sali[oó] del grupo/i,
]

/** Convierte fecha+hora del export a ISO 8601 (o null si no es resoluble).
 *
 * Ambigüedad DD/MM vs MM/DD: WhatsApp usa el locale del teléfono. Asumimos
 * DAY-FIRST (es-PE), salvo que el primer número sea > 12 (entonces es MM/DD).
 * Cuando ambos ≤ 12 no se puede saber con certeza → day-first es lo correcto
 * para el caso de uso (Perú). El año de 2 dígitos se asume 20YY. */
export function toISO(date: string, time: string, ampm: string | null): string | null {
  const dParts = date.split(/[/.]/).map((n) => parseInt(n, 10))
  if (dParts.length !== 3 || dParts.some((n) => Number.isNaN(n))) return null
  const [a, b, rawY] = dParts
  let y = rawY
  // Desambiguación de orden: si a>12 ⇒ a es día (DD/MM); si b>12 ⇒ b es día (MM/DD).
  let day: number
  let month: number
  if (a > 12 && b <= 12) {
    day = a
    month = b
  } else if (b > 12 && a <= 12) {
    month = a
    day = b
  } else {
    // Ambos ≤12 (o ambos inválidos): day-first (locale es-PE).
    day = a
    month = b
  }
  if (y < 100) y += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const tParts = time.split(':').map((n) => parseInt(n, 10))
  let hour = tParts[0] ?? 0
  const min = tParts[1] ?? 0
  const sec = tParts[2] ?? 0
  if (Number.isNaN(hour) || Number.isNaN(min)) return null
  if (ampm) {
    const isPM = /p/i.test(ampm)
    if (isPM && hour < 12) hour += 12
    if (!isPM && hour === 12) hour = 0
  }
  if (hour > 23 || min > 59) return null

  // Construir como UTC con los componentes locales (evita el corrimiento por
  // TZ del runtime). Es una marca de tiempo "de pared" — suficiente para
  // recencia/observed_at y para extraer fechas mencionadas.
  const d = new Date(Date.UTC(y, month - 1, day, hour, min, sec))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** "HH:mm" 24h a partir de hora + AM/PM (para rawMessages.timestamp). */
export function toHHmm(time: string, ampm: string | null): string {
  const tParts = time.split(':').map((n) => parseInt(n, 10))
  let hour = tParts[0] ?? 0
  const min = tParts[1] ?? 0
  if (ampm) {
    const isPM = /p/i.test(ampm)
    if (isPM && hour < 12) hour += 12
    if (!isPM && hour === 12) hour = 0
  }
  const hh = String(Math.min(Math.max(hour, 0), 23)).padStart(2, '0')
  const mm = String(Math.min(Math.max(min, 0), 59)).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Separa "Autor: contenido". null si no hay ": " (⇒ línea de sistema). El
 *  autor no puede ser absurdamente largo (evita partir un texto con ":"). */
export function splitAuthor(rest: string): { author: string; content: string } | null {
  const idx = rest.indexOf(': ')
  if (idx < 0) {
    // Caso "Autor:" sin espacio (contenido vacío) al final de la línea.
    const idx2 = rest.indexOf(':')
    if (idx2 > 0 && idx2 === rest.length - 1) {
      return { author: rest.slice(0, idx2).trim(), content: '' }
    }
    return null
  }
  const author = rest.slice(0, idx).trim()
  if (author.length === 0 || author.length > 80 || author.includes('\n')) return null
  return { author, content: rest.slice(idx + 2) }
}

function looksLikeSystem(rest: string): boolean {
  return SYSTEM_PATTERNS.some((re) => re.test(rest))
}

/**
 * Heurística barata: ¿este texto parece un export de WhatsApp? Pide ≥3 líneas
 * con prefijo de timestamp reconocible. Sirve para validar el archivo antes de
 * procesar y para el detector de tipo en /captura.
 */
export function isWhatsAppExport(text: string): boolean {
  if (!text) return false
  const lines = text.split(/\r?\n/)
  let hits = 0
  for (const raw of lines) {
    if (matchPrefix(clean(raw))) {
      hits++
      if (hits >= 3) return true
    }
  }
  return false
}

/**
 * Parsea el texto completo del export en mensajes normalizados. Maneja:
 *   - iOS (corchetes) y Android (guion), 12h/24h.
 *   - Continuaciones multilínea (se anexan al mensaje previo).
 *   - Líneas de media (→ "[media]", isMedia=true), sin romper.
 *   - Líneas de sistema (se cuentan en systemLineCount, no se interpretan).
 */
export function parseWhatsAppExport(text: string): ParsedExport {
  const messages: ExportMessage[] = []
  let systemLineCount = 0
  let mediaCount = 0
  let iosHits = 0
  let androidHits = 0
  const participants = new Set<string>()
  let firstISO: string | null = null
  let lastISO: string | null = null

  const lines = (text ?? '').split(/\r?\n/)

  for (const raw of lines) {
    const line = clean(raw)
    const pref = matchPrefix(line)

    if (!pref) {
      // Continuación del último mensaje (multilínea). Si no hay mensaje previo
      // o la línea está vacía, se ignora.
      const trimmed = raw.replace(/\r$/, '')
      if (messages.length > 0 && trimmed.length > 0) {
        const last = messages[messages.length - 1]
        if (!last.isMedia) {
          last.content = `${last.content}\n${clean(trimmed)}`.slice(0, 8000)
        }
      }
      continue
    }

    if (pref.format === 'ios') iosHits++
    else androidHits++

    const iso = toISO(pref.date, pref.time, pref.ampm)

    const split = splitAuthor(pref.rest)
    if (!split || looksLikeSystem(pref.rest)) {
      systemLineCount++
      continue
    }

    const media = isMediaContent(split.content)
    if (media) mediaCount++

    const msg: ExportMessage = {
      iso,
      time: toHHmm(pref.time, pref.ampm),
      author: split.author,
      content: media ? '[media]' : split.content.trim(),
      isMedia: media,
    }
    // Mensaje vacío no-media (raro): saltar.
    if (!media && msg.content.length === 0) {
      continue
    }
    messages.push(msg)
    participants.add(split.author)
    if (iso) {
      if (firstISO === null || iso < firstISO) firstISO = iso
      if (lastISO === null || iso > lastISO) lastISO = iso
    }
  }

  const format: ParsedExport['format'] =
    iosHits === 0 && androidHits === 0 ? 'unknown' : iosHits >= androidHits ? 'ios' : 'android'

  return {
    messages,
    systemLineCount,
    mediaCount,
    format,
    participants: [...participants],
    firstISO,
    lastISO,
  }
}

// SIR V2 — Correo scrapeado (Outlook Web) → shape de Graph. PURO, testeable.
//
// La Fase 2 del correo baja los mensajes por Microsoft Graph. Pero cuando NO hay
// acceso admin a Azure, leemos el mismo inbox scrapeando Outlook Web (OWA) desde
// la sesión logueada del navegador, con la MISMA arquitectura del SIR Reader.
//
// Este módulo normaliza un correo scrapeado `{ from, fromEmail?, subject,
// receivedAt, snippet?, body?, messageId? }` a la MISMA shape que produce
// `parseGraphMessage` (GraphMessage) ANTES de la ingesta-por-mensaje. Así el
// endpoint /api/email/ingest reusa TODO el backend de correo (agrupar por
// remitente → ingestReaderBatch → observación dm_conversation + dedup).
//
// PURO: sin red, sin crypto. `nowMs` se inyecta (default Date.now()) para poder
// resolver fechas relativas de OWA ("10:32", "ayer") de forma determinística en
// los tests. El dedup key es estable (djb2) → mismo correo colapsa siempre.

import type { GraphMessage } from './graph'

const MAX_BODY = 4000
const MAX_SUBJECT = 500
const MAX_NAME = 200

/** Correo tal como lo entrega el scraper de OWA (todo best-effort). */
export interface ScrapedEmail {
  /** Nombre visible del remitente. */
  from?: string | null
  /** Email del remitente si el DOM lo expone (reading pane). */
  fromEmail?: string | null
  subject?: string | null
  /** Fecha: ISO, o el string relativo/absoluto que muestra OWA. */
  receivedAt?: string | null
  /** Preview corto de la lista (cuando no hay cuerpo completo). */
  snippet?: string | null
  /** Cuerpo completo (solo cuando el correo está abierto). */
  body?: string | null
  /** Id estable del mensaje/conversación si el DOM lo expone. */
  messageId?: string | null
}

/** GraphMessage + la llave de dedup estable del correo scrapeado. */
export interface NormalizedEmail extends GraphMessage {
  /** messageId si vino; si no, hash estable de from+subject+receivedAt. */
  dedupKey: string
}

function clean(s: string | null | undefined, max: number): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Hash determinístico djb2 → hex de 8. Sin crypto (igual que readerHash). */
export function stableHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

/** Extrae un email de un string libre (ej. "Diana <diana@x.com>"). '' si no hay. */
export function extractEmail(s: string | null | undefined): string {
  if (!s) return ''
  const m = s.match(EMAIL_RE)
  return m ? m[0].trim().toLowerCase() : ''
}

const HHMM_RE = /^(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?$/i
const YESTERDAY_RE = /^(ayer|yesterday)$/i
const TODAY_RE = /^(hoy|today)$/i

/**
 * Normaliza el `receivedAt` de OWA a ISO cuando se puede (para la cronología del
 * reader). Resuelve ISO/fechas absolutas parseables, "HH:MM (a.m./p.m.)" y
 * hoy/ayer usando `nowMs`. Si no lo entiende, devuelve el string crudo limpio
 * (el pipeline lo tolera: sin fecha parseable, el mensaje se conserva igual).
 *
 * La hora relativa se interpreta en UTC (no en la TZ del runner) → determinístico
 * para CI. Es solo un ancla aproximado de cronología; el dedup real usa el string
 * crudo (emailDedupKey) y, cuando existe, el messageId.
 */
export function normalizeReceivedAt(raw: string | null | undefined, nowMs: number): string | null {
  const s = clean(raw, 80)
  if (!s) return null

  // 1) ISO / fecha absoluta que Date entiende.
  const direct = Date.parse(s)
  if (Number.isFinite(direct)) return new Date(direct).toISOString()

  const now = new Date(nowMs)

  // 2) "10:32", "10:32 a. m.", "3:05 pm" → hoy a esa hora (UTC).
  const hm = s.match(HHMM_RE)
  if (hm) {
    let hh = parseInt(hm[1], 10)
    const mm = parseInt(hm[2], 10)
    const mer = (hm[3] || '').toLowerCase().replace(/[.\s]/g, '')
    if (mer === 'pm' && hh < 12) hh += 12
    if (mer === 'am' && hh === 12) hh = 0
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      const d = new Date(now)
      d.setUTCHours(hh, mm, 0, 0)
      return d.toISOString()
    }
  }

  // 3) hoy / ayer (sin hora) → 12:00 UTC de ese día (medida neutra).
  if (TODAY_RE.test(s)) {
    const d = new Date(now); d.setUTCHours(12, 0, 0, 0); return d.toISOString()
  }
  if (YESTERDAY_RE.test(s)) {
    const d = new Date(now); d.setUTCDate(d.getUTCDate() - 1); d.setUTCHours(12, 0, 0, 0); return d.toISOString()
  }

  // 4) No lo entendemos: devolver el crudo (el dedup usa el crudo, así que el
  //    mismo render de OWA colapsa igual).
  return s
}

/**
 * Llave de dedup estable de un correo scrapeado: `messageId` si vino (lo más
 * robusto), si no un hash de remitente + asunto + fecha CRUDA. Usa la fecha
 * cruda (no la resuelta) para que el mismo renglón de OWA dé siempre la misma
 * llave dentro de su representación.
 */
export function emailDedupKey(e: ScrapedEmail): string {
  const mid = clean(e.messageId, 200)
  if (mid) return `mid:${mid}`
  const basis = [
    clean(e.fromEmail, MAX_NAME).toLowerCase() || clean(e.from, MAX_NAME).toLowerCase(),
    clean(e.subject, MAX_SUBJECT).toLowerCase(),
    clean(e.receivedAt, 80).toLowerCase(),
  ].join('|')
  return `h:${stableHash(basis)}`
}

/**
 * Normaliza UN correo scrapeado a NormalizedEmail (GraphMessage + dedupKey). null
 * si no tiene nada útil (ni remitente ni asunto ni texto). El cuerpo usa
 * `body` completo cuando está; si no, el `snippet` de la lista.
 */
export function normalizeScrapedEmail(raw: unknown, nowMs: number = Date.now()): NormalizedEmail | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as ScrapedEmail

  const fromEmail = extractEmail(o.fromEmail) || extractEmail(o.from)
  const fromName = clean(o.from, MAX_NAME).replace(/<[^>]*>/g, '').trim() || fromEmail
  const subject = clean(o.subject, MAX_SUBJECT)
  const body = clean(o.body, MAX_BODY) || clean(o.snippet, MAX_BODY)
  const receivedAt = normalizeReceivedAt(o.receivedAt, nowMs)

  if (!fromName && !fromEmail && !subject && !body) return null

  return {
    from: fromName,
    fromEmail,
    subject,
    body,
    receivedAt,
    dedupKey: emailDedupKey(o),
  }
}

/**
 * Normaliza una lista de correos scrapeados y colapsa los repetidos POR dedupKey
 * (los correos se re-scrapean al re-abrir el inbox). Preserva el orden y se queda
 * con la variante MÁS rica de cada llave (la que tiene cuerpo, si aparece).
 */
export function normalizeScrapedEmails(list: unknown, nowMs: number = Date.now()): NormalizedEmail[] {
  const arr = Array.isArray(list) ? list : []
  const byKey = new Map<string, NormalizedEmail>()
  for (const raw of arr) {
    const n = normalizeScrapedEmail(raw, nowMs)
    if (!n) continue
    const prev = byKey.get(n.dedupKey)
    if (!prev) { byKey.set(n.dedupKey, n); continue }
    // Conservar la variante con cuerpo más largo (lista→snippet vs abierto→body).
    if ((n.body?.length ?? 0) > (prev.body?.length ?? 0)) byKey.set(n.dedupKey, n)
  }
  return [...byKey.values()]
}

// SIR V2 — Lectura del feed de calendario (server-only).
//
// Lee la URL del feed .ics desde la env var OUTLOOK_ICS_URL. Esa URL trae un
// TOKEN PRIVADO del calendario de Outlook → NUNCA se hardcodea ni se expone al
// cliente: vive solo en el server (no es NEXT_PUBLIC_*). El cliente consume el
// JSON ya parseado vía /api/calendar; nunca ve la URL.
//
// Degrada limpio:
//   - env ausente   → { configured: false, events: [] }  (la UI muestra cómo activarlo)
//   - fetch falla   → { configured: true, error, events: [] }
//
// Cache simple en memoria por URL (TTL), para no golpear el feed en cada visita.

import { parseIcs } from './ics'
import type { CalendarEvent, CalendarFeedResult } from './types'

const FETCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min
const DEFAULT_HORIZON_DAYS = 60
const DEFAULT_LIMIT = 50

interface CacheEntry {
  fetchedAtMs: number
  events: CalendarEvent[]
}
// Cache por (url + ventana redondeada al día) — la ventana se mueve poco.
const cache = new Map<string, CacheEntry>()

export interface FetchCalendarOptions {
  /** Días hacia adelante a considerar. Default 60. */
  horizonDays?: number
  /** Máximo de eventos. Default 50. */
  limit?: number
  /** Fuerza recarga ignorando cache. */
  noCache?: boolean
  /** "ahora" inyectable (tests). Default Date.now(). */
  nowMs?: number
}

export async function fetchCalendarEvents(opts: FetchCalendarOptions = {}): Promise<CalendarFeedResult> {
  const url = process.env.OUTLOOK_ICS_URL?.trim()
  if (!url) {
    // No configurado: NO es un error, es el estado inicial esperado.
    return { configured: false, events: [] }
  }

  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const limit = opts.limit ?? DEFAULT_LIMIT
  const nowMs = opts.nowMs ?? Date.now()
  const fromMs = nowMs
  const toMs = nowMs + horizonDays * 86_400_000

  // Clave de cache estable por día (la ventana avanza de a poco).
  const dayBucket = Math.floor(nowMs / 86_400_000)
  const cacheKey = `${url}|${dayBucket}|${horizonDays}|${limit}`
  if (!opts.noCache) {
    const hit = cache.get(cacheKey)
    if (hit && nowMs - hit.fetchedAtMs < CACHE_TTL_MS) {
      return { configured: true, events: hit.events, fetchedAt: new Date(hit.fetchedAtMs).toISOString() }
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/calendar, text/plain, */*' },
      // El feed cambia poco; permitimos cache de fetch del runtime también.
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('La respuesta no parece un feed iCalendar (.ics).')
    const events = parseIcs(text, { fromMs, toMs, limit })
    cache.set(cacheKey, { fetchedAtMs: nowMs, events })
    return { configured: true, events, fetchedAt: new Date(nowMs).toISOString() }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido'
    // eslint-disable-next-line no-console
    console.warn('[calendar] no se pudo leer OUTLOOK_ICS_URL:', detail)
    // Si hay un cache viejo, devolverlo igual (mejor que nada).
    const stale = cache.get(cacheKey)
    if (stale) {
      return { configured: true, events: stale.events, error: detail, fetchedAt: new Date(stale.fetchedAtMs).toISOString() }
    }
    return { configured: true, events: [], error: detail }
  }
}

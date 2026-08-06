// SIR V2 — Lectura del/los feed(s) de calendario (server-only).
//
// Calendar v2 (Fase 1, multi-calendario): lee TODAS las conexiones habilitadas
// del usuario (tabla calendar_connections, RLS por user_id), fetchea cada feed
// .ics EN PARALELO (sin N+1), parsea con el parser existente, etiqueta cada
// evento con su label/color de origen y los devuelve unificados y ordenados.
//
// FALLBACK (no rompe lo actual): si NO hay conexiones (o la tabla aún no existe,
// migración 0046 sin correr) pero existe la env var OUTLOOK_ICS_URL, se sigue
// leyendo esa (etiquetada como "Outlook"). Si no hay ni conexiones ni env →
// { configured: false }.
//
// Las URLs .ics traen un TOKEN PRIVADO → viven solo en el server, NUNCA se
// loguean ni se exponen al cliente. El cliente consume el JSON parseado vía
// /api/calendar.
//
// Cache simple en memoria por URL (TTL), para no golpear cada feed en cada visita.

import { parseIcs } from './ics'
import { DEFAULT_CALENDAR_COLOR } from './types'
import type { CalendarEvent, CalendarFeedResult, CalendarSummary } from './types'
import type { createClient } from '@/lib/supabase/server'
import { fetchGoogleCalendarEvents, refreshAccessToken } from './oauth/google'
import { decryptToken, encryptToken } from './oauth/crypto'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

const FETCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 min
const DEFAULT_HORIZON_DAYS = 60
const DEFAULT_LIMIT = 50

const ENV_CALENDAR_ID = 'env'
const ENV_CALENDAR_LABEL = 'Outlook'

interface CacheEntry {
  fetchedAtMs: number
  events: CalendarEvent[]
}
// Cache por (url + ventana redondeada al día). La ventana se mueve poco.
const cache = new Map<string, CacheEntry>()

export interface FetchCalendarOptions {
  /** Cliente Supabase autenticado (server). Sin él se usa solo el fallback env. */
  supabase?: ServerSupabase
  /** Días hacia adelante a considerar. Default 60. */
  horizonDays?: number
  /** Días hacia ATRÁS a incluir (para ver qué se hizo). Default 0 = solo futuro. */
  pastDays?: number
  /** Máximo de eventos (tras mergear todos los calendarios). Default 50. */
  limit?: number
  /** Fuerza recarga ignorando cache. */
  noCache?: boolean
  /** "ahora" inyectable (tests). Default Date.now(). */
  nowMs?: number
  /**
   * Filtra las conexiones por tipo ('work'|'personal'). Sin filtro = todas
   * (comportamiento actual). La línea del ciclo pide ['personal'] para NUNCA
   * volcar el calendario laboral sobre el ciclo de una persona (Camino B).
   */
  kinds?: Array<'work' | 'personal'>
}

interface FeedWindow {
  fromMs: number
  toMs: number
  limit: number
  nowMs: number
  noCache: boolean
}

interface IcsFetchResult {
  events: CalendarEvent[]
  error?: string
  fetchedAtMs?: number
}

/** Una conexión habilitada, ya saneada (url presente). */
interface EnabledConnection {
  id: string
  label: string
  color?: string
  icsUrl: string
}

/** Conexión OAuth (Google) habilitada. */
interface EnabledOAuthConnection {
  id: string
  label: string
  color?: string
  provider: 'google'
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: string | null
}

// ─── Fetch + parse + cache de UN feed .ics ──────────────────────────

async function fetchIcsFeed(url: string, w: FeedWindow): Promise<IcsFetchResult> {
  const dayBucket = Math.floor(w.nowMs / 86_400_000)
  const cacheKey = `${url}|${dayBucket}|${w.fromMs}|${w.toMs}|${w.limit}`
  if (!w.noCache) {
    const hit = cache.get(cacheKey)
    if (hit && w.nowMs - hit.fetchedAtMs < CACHE_TTL_MS) {
      return { events: hit.events, fetchedAtMs: hit.fetchedAtMs }
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/calendar, text/plain, */*' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('La respuesta no parece un feed iCalendar (.ics).')
    const events = parseIcs(text, { fromMs: w.fromMs, toMs: w.toMs, limit: w.limit })
    cache.set(cacheKey, { fetchedAtMs: w.nowMs, events })
    return { events, fetchedAtMs: w.nowMs }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido'
    // NO logueamos la URL (token privado), solo el detalle del fallo.
    // eslint-disable-next-line no-console
    console.warn('[calendar] no se pudo leer un feed .ics:', detail)
    // Si hay cache viejo, devolverlo igual (mejor que nada).
    const stale = cache.get(cacheKey)
    if (stale) return { events: stale.events, error: detail, fetchedAtMs: stale.fetchedAtMs }
    return { events: [], error: detail }
  }
}

// ─── Carga de conexiones (tolerante a tabla ausente) ────────────────

async function loadConnections(
  supabase: ServerSupabase,
  kinds?: Array<'work' | 'personal'>,
): Promise<EnabledConnection[]> {
  try {
    // No leemos `kind` (EnabledConnection no lo usa): solo FILTRAMOS por él con
    // `.in`. Así el select queda literal (sin romper el typegen de Supabase) y, si
    // la migración 0137 aún no corrió, el `.in('kind',…)` falla → catch → [].
    let query = supabase
      .from('calendar_connections')
      .select('id, label, color, ics_url, enabled, provider')
      .eq('enabled', true)
      .eq('provider', 'ics')
    if (kinds && kinds.length > 0) query = query.in('kind', kinds)
    const { data, error } = await query
      .order('created_at', { ascending: true })
    if (error || !data) return []
    const out: EnabledConnection[] = []
    for (const row of data as Array<{ id: string; label: string | null; color: string | null; ics_url: string | null }>) {
      const icsUrl = (row.ics_url ?? '').trim()
      if (!icsUrl) continue
      out.push({
        id: row.id,
        label: (row.label ?? '').trim() || 'Calendario',
        color: row.color ?? undefined,
        icsUrl,
      })
    }
    return out
  } catch {
    // Tabla ausente (migración 0046 sin correr) o cualquier error → sin conexiones.
    return []
  }
}

async function loadOAuthConnections(supabase: ServerSupabase): Promise<EnabledOAuthConnection[]> {
  try {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select('id, label, color, provider, enabled, access_token, refresh_token, token_expires_at')
      .eq('enabled', true)
      .eq('provider', 'google')
      .order('created_at', { ascending: true })
    if (error || !data) return []
    const out: EnabledOAuthConnection[] = []
    for (const row of data as Array<{ id: string; label: string | null; color: string | null; provider: string; access_token: string | null; refresh_token: string | null; token_expires_at: string | null }>) {
      out.push({
        id: row.id,
        label: (row.label ?? '').trim() || 'Google',
        color: row.color ?? undefined,
        provider: 'google',
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
      })
    }
    return out
  } catch { return [] }
}

/** Devuelve un access_token vigente para la conexión, refrescándolo si expiró.
 *  Persiste el nuevo token cifrado en la DB. Devuelve null si no se puede
 *  obtener uno (ej. refresh_token revocado). */
async function ensureFreshAccessToken(
  supabase: ServerSupabase,
  conn: EnabledOAuthConnection,
  nowMs: number,
): Promise<string | null> {
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0
  const stillValid = expiresAt > nowMs + 30_000
  const currentPlain = decryptToken(conn.accessToken)
  if (stillValid && currentPlain) return currentPlain
  const refreshPlain = decryptToken(conn.refreshToken)
  if (!refreshPlain) return currentPlain // sin refresh: usa lo que hay y que Google diga si murió
  try {
    const tok = await refreshAccessToken(refreshPlain)
    const newExpiresAt = new Date(nowMs + Math.max(0, (tok.expires_in ?? 3600) - 30) * 1000).toISOString()
    await supabase.from('calendar_connections').update({
      access_token: encryptToken(tok.access_token),
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    }).eq('id', conn.id)
    return tok.access_token
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[calendar-oauth] refresh falló, uso token viejo:', e instanceof Error ? e.message : e)
    return currentPlain
  }
}

async function fetchGoogleFeed(
  supabase: ServerSupabase,
  conn: EnabledOAuthConnection,
  w: FeedWindow,
): Promise<IcsFetchResult> {
  return conGoogle(supabase, conn, w)
}

/**
 * Por qué no hay token utilizable. PURA.
 *
 * ═══ EL MENSAJE VIEJO MEZCLABA TRES COSAS ════════════════════════════════════
 *
 * Decía siempre *"sin token válido — reconecta el calendario"*, para tres causas con
 * acciones distintas — y **solo una se arregla reconectando**:
 *
 *   1. NUNCA se conectó (no hay refresh_token) → sí, hay que conectar.
 *   2. Google revocó el permiso → hay que reconectar.
 *   3. **El token está guardado pero no se pudo DESCIFRAR** → no se toca nada: es
 *      que `CALENDAR_TOKEN_ENCRYPTION_KEY` de este entorno no es la que lo cifró.
 *
 * El 5-ago-2026 el caso 3 me costó caro: leyendo desde local vi ese error, le dije a
 * Aaron que su calendario estaba roto y lo hice **reconectar el OAuth para nada**.
 * Su `/horario` mostraba todo perfecto, incluida la reunión que yo decía que no
 * existía. Le afirmé dos falsedades seguidas sobre su propia data.
 *
 * Un mensaje que manda a hacer algo tiene que estar seguro de que ese algo sirve.
 * [[no-puedo-leer-el-calendario-desde-local]]
 */
export function motivoSinToken(conn: { refreshToken?: string | null }): string {
  if (!conn.refreshToken) return 'nunca se completó la conexión — conéctalo desde /horario'
  // Hay refresh_token guardado y aun así no salió un access token usable. O no se
  // pudo descifrar (clave distinta) o Google lo revocó. No se puede distinguir sin
  // intentar el refresh, así que se dicen las DOS y no se ordena una sola cosa.
  return 'hay un token guardado que no se pudo usar: puede ser que Google revocara el permiso (reconéctalo) o que este entorno no tenga la clave con la que se cifró (entonces no hay nada que reconectar)'
}

async function conGoogle(
  supabase: ServerSupabase,
  conn: EnabledOAuthConnection,
  w: FeedWindow,
): Promise<IcsFetchResult> {
  const dayBucket = Math.floor(w.nowMs / 86_400_000)
  const cacheKey = `google:${conn.id}|${dayBucket}|${w.fromMs}|${w.toMs}|${w.limit}`
  if (!w.noCache) {
    const hit = cache.get(cacheKey)
    if (hit && w.nowMs - hit.fetchedAtMs < CACHE_TTL_MS) return { events: hit.events, fetchedAtMs: hit.fetchedAtMs }
  }
  try {
    const token = await ensureFreshAccessToken(supabase, conn, w.nowMs)
    if (!token) return { events: [], error: motivoSinToken(conn) }
    const events = await fetchGoogleCalendarEvents(
      token,
      new Date(w.fromMs).toISOString(),
      new Date(w.toMs).toISOString(),
      w.limit,
    )
    cache.set(cacheKey, { fetchedAtMs: w.nowMs, events })
    return { events, fetchedAtMs: w.nowMs }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'error desconocido'
    // eslint-disable-next-line no-console
    console.warn('[calendar] Google Calendar feed falló:', detail)
    const stale = cache.get(cacheKey)
    if (stale) return { events: stale.events, error: detail, fetchedAtMs: stale.fetchedAtMs }
    return { events: [], error: detail }
  }
}

// ─── Etiquetado de eventos por calendario ───────────────────────────

function tagEvent(ev: CalendarEvent, conn: { id: string; label: string; color?: string }): CalendarEvent {
  return {
    ...ev,
    // Prefijo con el id de la conexión → único entre feeds distintos.
    id: `${conn.id}::${ev.id}`,
    calendarId: conn.id,
    calendarLabel: conn.label,
    calendarColor: conn.color,
  }
}

// ─── Orquestador público ────────────────────────────────────────────

export async function fetchCalendarEvents(opts: FetchCalendarOptions = {}): Promise<CalendarFeedResult> {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS
  const pastDays = opts.pastDays ?? 0
  const limit = opts.limit ?? DEFAULT_LIMIT
  const nowMs = opts.nowMs ?? Date.now()
  const w: FeedWindow = {
    fromMs: nowMs - pastDays * 86_400_000,
    toMs: nowMs + horizonDays * 86_400_000,
    limit,
    nowMs,
    noCache: opts.noCache ?? false,
  }

  const connections = opts.supabase ? await loadConnections(opts.supabase, opts.kinds) : []
  // OAuth (Google) aún no distingue kind; si se pide un filtro personal-only, lo
  // omitimos para no leakear un calendario laboral de Google al ciclo.
  const oauthConns = opts.supabase && !opts.kinds ? await loadOAuthConnections(opts.supabase) : []

  // ── Camino multi-calendario ──
  if (connections.length > 0 || oauthConns.length > 0) {
    const icsResults = await Promise.all(
      connections.map((c) => fetchIcsFeed(c.icsUrl, w).then((r) => ({ conn: c, r }))),
    )
    const googleResults = opts.supabase
      ? await Promise.all(oauthConns.map((c) => fetchGoogleFeed(opts.supabase!, c, w).then((r) => ({ conn: c, r }))))
      : []

    const events: CalendarEvent[] = []
    const calendars: CalendarSummary[] = []
    let latestFetchedMs: number | undefined
    for (const { conn, r } of icsResults) {
      calendars.push({ id: conn.id, label: conn.label, color: conn.color, error: r.error })
      for (const ev of r.events) events.push(tagEvent(ev, conn))
      if (r.fetchedAtMs != null) latestFetchedMs = Math.max(latestFetchedMs ?? 0, r.fetchedAtMs)
    }
    for (const { conn, r } of googleResults) {
      calendars.push({ id: conn.id, label: conn.label, color: conn.color, error: r.error })
      for (const ev of r.events) events.push(tagEvent(ev, conn))
      if (r.fetchedAtMs != null) latestFetchedMs = Math.max(latestFetchedMs ?? 0, r.fetchedAtMs)
    }
    events.sort((a, b) => a.start.localeCompare(b.start))

    // Si no salió ningún evento pero algún feed falló, exponer el primer error
    // (la UI muestra "no pude refrescar / revisa la URL").
    const firstError = events.length === 0 ? calendars.find((c) => c.error)?.error : undefined

    return {
      configured: true,
      events: events.slice(0, limit),
      calendars,
      error: firstError,
      fetchedAt: latestFetchedMs != null ? new Date(latestFetchedMs).toISOString() : undefined,
    }
  }

  // ── Fallback: env var única (comportamiento legacy) ──
  // El feed env es un Outlook laboral: si se pidió personal-only, no cae a él.
  const envUrl = opts.kinds ? undefined : process.env.OUTLOOK_ICS_URL?.trim()
  if (!envUrl) {
    // Ni conexiones ni env: estado inicial esperado, NO es error.
    return { configured: false, events: [] }
  }

  const r = await fetchIcsFeed(envUrl, w)
  const envConn = { id: ENV_CALENDAR_ID, label: ENV_CALENDAR_LABEL, color: DEFAULT_CALENDAR_COLOR }
  const events = r.events.map((ev) => tagEvent(ev, envConn))
  return {
    configured: true,
    events,
    calendars: [{ id: envConn.id, label: envConn.label, color: envConn.color, error: r.error }],
    error: events.length === 0 ? r.error : undefined,
    fetchedAt: r.fetchedAtMs != null ? new Date(r.fetchedAtMs).toISOString() : undefined,
  }
}

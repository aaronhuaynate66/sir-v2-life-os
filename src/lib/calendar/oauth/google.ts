// SIR V2 — Google Calendar OAuth 2.0 client (server-only helpers).
//
// Flow:
//   1. /api/calendar/oauth/google/start   → GET, redirect a Google.
//   2. Google → callback con `code` + `state`.
//   3. /api/calendar/oauth/google/callback → exchange, save encrypted, redirect a /agenda.
//   4. Reader (feed.ts) usa access_token; si expiró (o falta), lo refresca.
//
// Env vars (secretos del backend, NO NEXT_PUBLIC_*):
//   - GOOGLE_OAUTH_CLIENT_ID
//   - GOOGLE_OAUTH_CLIENT_SECRET
// El redirect URI se DERIVA del request (host + protocol), no de env. Debe
// registrarse en Google Cloud Console tal cual.

import type { CalendarEvent } from '../types'

// `calendar.events` da lectura Y escritura de eventos (incluye lo que hacía
// `calendar.readonly` para el reader). Necesario para crear/editar eventos desde
// SIR (sync bidireccional). Al reconectar, Google re-pide consentimiento con el
// scope nuevo (prompt=consent). No pide metadata de calendarios, solo eventos.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_OAUTH_CLIENT_ID no configurado')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',   // ← indispensable para recibir refresh_token
    prompt: 'consent',        // ← indispensable para RE-emitir refresh_token si ya autorizó antes
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number      // seconds
  token_type: string
  scope: string
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('OAuth Google no configurado (falta CLIENT_ID/SECRET)')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`token exchange falló (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('OAuth Google no configurado')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`refresh falló (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as TokenResponse
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const j = (await res.json()) as { email?: string }
    return j.email ?? null
  } catch { return null }
}

interface GoogleEventItem {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

/** Trae eventos de calendars/primary en la ventana [fromIso, toIso]. Devuelve
 *  ya en el formato interno de SIR (CalendarEvent). */
export async function fetchGoogleCalendarEvents(accessToken: string, fromIso: string, toIso: string, limit: number): Promise<CalendarEvent[]> {
  const url = new URL(EVENTS_URL)
  url.searchParams.set('timeMin', fromIso)
  url.searchParams.set('timeMax', toIso)
  url.searchParams.set('singleEvents', 'true')      // expandir recurrencias
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', String(Math.min(Math.max(limit, 10), 250)))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as { items?: GoogleEventItem[] }
  const items = body.items ?? []
  const out: CalendarEvent[] = []
  for (const it of items) {
    if (it.status === 'cancelled') continue
    const startIso = it.start?.dateTime ?? it.start?.date
    const endIso = it.end?.dateTime ?? it.end?.date
    if (!startIso) continue
    const allDay = !it.start?.dateTime && !!it.start?.date
    out.push({
      id: it.id,
      uid: it.id,
      title: it.summary?.trim() || '(sin título)',
      start: startIso,
      end: endIso ?? startIso,
      allDay,
      location: it.location?.trim() || undefined,
      recurring: false,
    })
  }
  return out
}

// ─── Escritura (sync bidireccional) ─────────────────────────────────

const LIMA_TZ = 'America/Lima'

export interface NewGoogleEvent {
  /** Título del evento. Requerido. */
  title: string
  /** Inicio: 'YYYY-MM-DD' (día completo) o ISO con hora ('2026-07-20T15:00:00-05:00'). */
  start: string
  /** Fin (mismo formato). Si falta: +1h (cronometrado) o +1 día (all-day). */
  end?: string
  /** Fuerza día completo (usa el campo `date` de Google, no `dateTime`). */
  allDay?: boolean
  description?: string
  location?: string
  /** Zona horaria para eventos cronometrados. Default America/Lima. */
  timeZone?: string
  /** true → evento ANUAL recurrente (cumpleaños/aniversarios): RRULE FREQ=YEARLY. */
  recurring?: boolean
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function addOneDay(dateOnly: string): string {
  const t = Date.parse(`${dateOnly}T00:00:00Z`)
  const d = new Date(t + 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Un extremo (start/end) del evento. `null` es SIGNIFICATIVO en un PATCH: le dice a
 * Google que BORRE ese campo. Ver `buildGoogleEventPatchPayload`.
 */
export interface GoogleEventEnd {
  date?: string | null
  dateTime?: string | null
  timeZone?: string | null
}

export interface GoogleEventPayload {
  summary: string
  description?: string
  location?: string
  start: GoogleEventEnd
  end: GoogleEventEnd
  /** RRULE de recurrencia (ej. ['RRULE:FREQ=YEARLY']). Ausente = evento único. */
  recurrence?: string[]
}

/**
 * Arma el body para la API de Google desde un NewGoogleEvent. PURO (testeable).
 * - all-day → `start.date`/`end.date`, con end EXCLUSIVO (+1 día).
 * - cronometrado → `start.dateTime`/`end.dateTime` (+1h por defecto) con timeZone.
 * Lanza si falta el título.
 */
export function buildGoogleEventPayload(ev: NewGoogleEvent): GoogleEventPayload {
  const title = (ev.title || '').trim()
  if (!title) throw new Error('El evento necesita un título.')
  const allDay = ev.allDay || DATE_ONLY.test(ev.start)
  const tz = ev.timeZone || LIMA_TZ

  let start: GoogleEventPayload['start']
  let end: GoogleEventPayload['end']
  if (allDay) {
    const startDate = ev.start.slice(0, 10)
    // Google trata `end.date` como EXCLUSIVO → un evento de 1 día termina al día siguiente.
    const endDate = ev.end ? addOneDay(ev.end.slice(0, 10)) : addOneDay(startDate)
    start = { date: startDate }
    end = { date: endDate }
  } else {
    const startDt = ev.start
    const endDt = ev.end ?? new Date(Date.parse(startDt) + 3_600_000).toISOString()
    start = { dateTime: startDt, timeZone: tz }
    end = { dateTime: endDt, timeZone: tz }
  }
  return {
    summary: title,
    description: ev.description?.trim() || undefined,
    location: ev.location?.trim() || undefined,
    start,
    end,
    recurrence: ev.recurring ? ['RRULE:FREQ=YEARLY'] : undefined,
  }
}

/**
 * Igual que `buildGoogleEventPayload`, pero para PATCH: anula EXPLÍCITAMENTE el campo
 * contrario de `start` y `end`. PURO.
 *
 * ═══ POR QUÉ, con el caso real ════════════════════════════════════════════════
 *
 * Aaron, 3-ago-2026, con una captura de su Google Calendar: *"¿cómo es que en mi
 * calendario no me sale la cita del cirujano maxilofacial hoy a las 4?"*.
 *
 * SIR la calculaba BIEN — `rangoHorarioDeNota` saca las 16:00 de la nota y
 * `eventoParaGoogle` devuelve `allDay: false`. Lo que fallaba era el envío.
 *
 * Google hace un **patch semántico por objeto anidado**: los campos que no mandas
 * quedan como estaban. El evento ya existía en Google como "todo el día", o sea con
 * `start.date`. Al mandarle `start: { dateTime, timeZone }` **sin tocar `date`**, el
 * objeto terminaba con `date` Y `dateTime` a la vez — y son mutuamente excluyentes.
 * Google no convierte el evento: se queda de día completo **para siempre**.
 *
 * Por eso su examen del IPD del viernes SÍ aparecía a las 08:10 (ese se CREÓ nuevo,
 * y en un POST no hay `date` previo que estorbe) y la cirugía del lunes no. El mismo
 * código, dos resultados, según si el evento ya existía. El error subía a
 * `SyncResult.errores`, que nadie lee.
 *
 * La cura es la documentada por Google: mandar `null` para borrar el campo contrario.
 * Solo en PATCH — en un POST no hay nada que borrar.
 */
export function buildGoogleEventPatchPayload(ev: NewGoogleEvent): GoogleEventPayload {
  const p = buildGoogleEventPayload(ev)
  /** Si el extremo va con fecha, se anula la hora; si va con hora, se anula la fecha. */
  const excluyente = (e: GoogleEventEnd): GoogleEventEnd =>
    e.date !== undefined ? { date: e.date, dateTime: null, timeZone: null } : { ...e, date: null }
  return { ...p, start: excluyente(p.start), end: excluyente(p.end) }
}

/**
 * Crea un evento en el calendario `primary` del usuario. Devuelve el id + link
 * de Google. Requiere un access_token con scope `calendar.events`. Lanza si la
 * API responde con error (el caller lo mapea a un mensaje al usuario).
 */
export async function createGoogleEvent(
  accessToken: string,
  ev: NewGoogleEvent,
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGoogleEventPayload(ev)),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 200)}`)
  }
  const j = (await res.json()) as { id?: string; htmlLink?: string }
  if (!j.id) throw new Error('Google no devolvió un id de evento.')
  return { id: j.id, htmlLink: j.htmlLink }
}

/**
 * Actualiza un evento existente en `primary` (PATCH → reemplaza título/fecha/
 * descripción). Lanza si la API falla. Requiere scope `calendar.events`.
 *
 * Usa `buildGoogleEventPatchPayload`, **no** el de crear: sin los `null` explícitos un
 * evento de "todo el día" no se puede convertir a cronometrado. Ver ahí el caso real.
 */
export async function updateGoogleEvent(
  accessToken: string,
  eventId: string,
  ev: NewGoogleEvent,
): Promise<{ id: string; htmlLink?: string }> {
  const id = (eventId || '').trim()
  if (!id) throw new Error('Falta el id del evento de Google.')
  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildGoogleEventPatchPayload(ev)),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 200)}`)
  }
  const j = (await res.json()) as { id?: string; htmlLink?: string }
  return { id: j.id ?? id, htmlLink: j.htmlLink }
}

/**
 * Borra un evento del calendario `primary`. Si Google responde 404/410 (ya no
 * existe — lo borraste a mano allá), lo tratamos como éxito (idempotente). Lanza
 * en otros errores. Requiere scope `calendar.events`.
 */
export async function deleteGoogleEvent(accessToken: string, eventId: string): Promise<void> {
  const id = (eventId || '').trim()
  if (!id) return
  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // 204 = borrado; 404/410 = ya no está (idempotente, éxito).
  if (res.ok || res.status === 404 || res.status === 410) return
  const text = await res.text()
  throw new Error(`Google Calendar API ${res.status}: ${text.slice(0, 200)}`)
}

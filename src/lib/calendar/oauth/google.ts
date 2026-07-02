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

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
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

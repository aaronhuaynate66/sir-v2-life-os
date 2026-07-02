// SIR V2 — GET /api/calendar/oauth/google/start
//
// Redirige al usuario a Google para autorizar acceso al calendario.
// Guarda un `state` random en cookie httpOnly de 10 minutos (protección CSRF).
// El redirect URI se DERIVA del request (host + protocol) — DEBE registrarse
// tal cual en Google Cloud Console → OAuth client → Authorized redirect URIs:
//   https://<host>/api/calendar/oauth/google/callback

import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl, isGoogleOAuthConfigured } from '@/lib/calendar/oauth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_COOKIE = 'cal_oauth_state'
const STATE_TTL_S = 600

function buildRedirectUri(req: NextRequest): string {
  // Preferir X-Forwarded-* (Vercel/proxies); fallback a URL del request.
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  return `${proto}://${host}/api/calendar/oauth/google/callback`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json({
      error: 'OAuth Google no configurado',
      detail: 'Faltan GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET en el server. Ver docs/CALENDAR_V2_OAUTH.md',
    }, { status: 501 })
  }

  const state = randomBytes(24).toString('base64url')
  const redirectUri = buildRedirectUri(req)
  const url = buildAuthorizeUrl(redirectUri, state)

  const res = NextResponse.redirect(url, 302)
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/calendar/oauth/google',
    maxAge: STATE_TTL_S,
  })
  return res
}

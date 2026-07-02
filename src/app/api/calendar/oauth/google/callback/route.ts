// SIR V2 — GET /api/calendar/oauth/google/callback
//
// Callback del OAuth de Google. Valida `state` contra la cookie, hace el
// exchange del `code` por tokens, guarda una nueva `calendar_connections`
// (provider='google') con tokens CIFRADOS, y redirige a /horario con un flag.
//
// Errores humanos: si Google devolvió `error=access_denied`, redirect a
// /horario?calendar_error=denied. Otros errores → ?calendar_error=<msg-short>.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, fetchUserEmail } from '@/lib/calendar/oauth/google'
import { encryptToken } from '@/lib/calendar/oauth/crypto'
import { DEFAULT_CALENDAR_COLOR } from '@/lib/calendar/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const STATE_COOKIE = 'cal_oauth_state'

function returnUrl(req: NextRequest, params: Record<string, string>): string {
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  const url = new URL(`${proto}://${host}/horario`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

function buildRedirectUri(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host
  return `${proto}://${host}/api/calendar/oauth/google/callback`
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const gError = url.searchParams.get('error')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) {
    // Sesión expirada durante el flow: mandar a login y de ahí a /horario.
    return NextResponse.redirect(returnUrl(req, { calendar_error: 'session_expired' }), 302)
  }

  if (gError) {
    return NextResponse.redirect(returnUrl(req, { calendar_error: gError.slice(0, 40) }), 302)
  }

  const cookieState = req.cookies.get(STATE_COOKIE)?.value ?? null
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(returnUrl(req, { calendar_error: 'state_mismatch' }), 302)
  }

  const redirectUri = buildRedirectUri(req)
  try {
    const tok = await exchangeCodeForTokens(code, redirectUri)
    const email = await fetchUserEmail(tok.access_token)
    const now = Date.now()
    const expiresAt = new Date(now + Math.max(0, (tok.expires_in ?? 3600) - 30) * 1000).toISOString()

    // Idempotencia: si ya existe una conexión google del user con este email,
    // ACTUALIZAMOS los tokens en vez de crear una duplicada. Sin email, insert nuevo.
    let existingId: string | null = null
    if (email) {
      const { data: found } = await supabase
        .from('calendar_connections')
        .select('id')
        .eq('user_id', auth.user.id)
        .eq('provider', 'google')
        .eq('account_email', email)
        .limit(1)
      const hit = (found ?? [])[0] as { id?: string } | undefined
      existingId = hit?.id ?? null
    }

    if (existingId) {
      const patch: Record<string, unknown> = {
        access_token: encryptToken(tok.access_token),
        token_expires_at: expiresAt,
        enabled: true,
        updated_at: new Date().toISOString(),
      }
      // Solo pisamos refresh_token si Google mandó uno nuevo (con prompt=consent
      // debería, pero por seguridad).
      if (tok.refresh_token) patch.refresh_token = encryptToken(tok.refresh_token)
      await supabase.from('calendar_connections').update(patch).eq('user_id', auth.user.id).eq('id', existingId)
      return NextResponse.redirect(returnUrl(req, { calendar: 'reconnected' }), 302)
    }

    const label = email ? `Google · ${email}` : 'Google Calendar'
    const insertRow: Record<string, unknown> = {
      user_id: auth.user.id,
      label,
      provider: 'google',
      ics_url: null,
      color: DEFAULT_CALENDAR_COLOR,
      enabled: true,
      access_token: encryptToken(tok.access_token),
      refresh_token: tok.refresh_token ? encryptToken(tok.refresh_token) : null,
      account_email: email,
      token_expires_at: expiresAt,
    }
    const { error } = await supabase.from('calendar_connections').insert(insertRow)
    if (error) throw new Error(error.message)

    const res = NextResponse.redirect(returnUrl(req, { calendar: 'connected' }), 302)
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[calendar-oauth] callback error:', e instanceof Error ? e.message : e)
    return NextResponse.redirect(returnUrl(req, { calendar_error: 'exchange_failed' }), 302)
  }
}

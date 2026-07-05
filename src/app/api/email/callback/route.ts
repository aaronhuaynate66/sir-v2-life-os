// SIR V2 — GET /api/email/callback — Microsoft devuelve el `code` acá.
// Valida el state, canjea el code por tokens, lee el email de la cuenta y guarda
// (o actualiza) la conexión. Redirige a /yo con el resultado.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { GRAPH, tokenEndpoint, tokenBodyForCode, expiresAtFrom, type TokenResponse } from '@/lib/email/graph'
import { graphConfig, siteOrigin } from '@/lib/email/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req)
  const back = (q: string) => NextResponse.redirect(`${origin}/yo?email=${q}`)

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieState = req.cookies.get('ms_oauth_state')?.value
  if (!code || !state || !cookieState || state !== cookieState) return back('err_state')

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.redirect(`${origin}/`)

  const cfg = graphConfig(origin)
  if (!cfg) return back('notconfigured')

  try {
    const tokRes = await fetch(tokenEndpoint(cfg), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBodyForCode(cfg, code),
    })
    const tok = (await tokRes.json()) as TokenResponse & { error?: string }
    if (!tokRes.ok || !tok.access_token) return back('err_token')

    let email: string | null = null
    try {
      const me = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      }).then((r) => r.json())
      email = (me?.mail || me?.userPrincipalName || null) as string | null
    } catch { /* best-effort */ }

    const now = Date.now()
    const { error } = await supabase.from('email_connections').upsert(
      {
        user_id: auth.user.id,
        provider: 'microsoft',
        account_email: email,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        token_expires_at: expiresAtFrom(tok.expires_in, now),
        enabled: true,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    if (error) { reportApiError(error, { route: 'email/callback' }); return back('err_save') }

    const res = back('connected')
    res.cookies.delete('ms_oauth_state')
    return res
  } catch (e) {
    reportApiError(e, { route: 'email/callback' })
    return back('err')
  }
}

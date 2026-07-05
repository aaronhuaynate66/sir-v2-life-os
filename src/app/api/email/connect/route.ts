// SIR V2 — GET /api/email/connect — arranca el OAuth de Microsoft Graph.
// Manda a Aaron (logueado) al consentimiento de Microsoft. Guarda un `state`
// anti-CSRF en cookie httpOnly. El callback lo valida.

import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl } from '@/lib/email/graph'
import { graphConfig, siteOrigin } from '@/lib/email/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = siteOrigin(req)
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.redirect(`${origin}/`)

  const cfg = graphConfig(origin)
  if (!cfg) return NextResponse.redirect(`${origin}/yo?email=notconfigured`)

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(buildAuthUrl(cfg, state))
  res.cookies.set('ms_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}

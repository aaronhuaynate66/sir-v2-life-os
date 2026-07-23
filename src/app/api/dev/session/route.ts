// SIR V2 — POST /api/dev/session — ingreso del estado EN VIVO de Claude Code.
//
// Lo llama un hook LOCAL en la laptop de Aaron (scripts/dev-session-hook.mjs) en
// cada SessionStart / PostToolUse (throttle) / Stop. Guarda una fila por sesión en
// dev_session_status; el bot de dev la lee para contar "en qué anda Claude ahorita".
//
// Auth: header x-dev-session-secret == DEV_SESSION_SECRET (server). INERTE sin ese
// env (200 { inert:true }) para que no explote en entornos sin configurar.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function POST(req: NextRequest) {
  const secret = process.env.DEV_SESSION_SECRET
  if (!secret) return NextResponse.json({ ok: true, inert: true })
  if (req.headers.get('x-dev-session-secret') !== secret) {
    return new NextResponse('invalid secret', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'supabase envs missing' }, { status: 500 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const str = (v: unknown, max: number): string | null =>
    v != null && String(v).trim() ? String(v).slice(0, max) : null

  const row = {
    session_id: (str(body.sessionId, 200) ?? 'local'),
    event: str(body.event, 20) ?? 'progress',
    summary: str(body.summary, 4000),
    activity: str(body.activity, 300),
    branch: str(body.branch, 200),
    changed_files: str(body.changedFiles, 4000),
    last_commit: str(body.lastCommit, 300),
    cwd: str(body.cwd, 400),
    updated_at: new Date().toISOString(),
  }

  await supabase.from('dev_session_status').upsert(row, { onConflict: 'session_id' })
  // Limpieza: descarta sesiones de hace >2 días para no acumular.
  const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  await supabase.from('dev_session_status').delete().lt('updated_at', cutoff)

  return NextResponse.json({ ok: true })
}

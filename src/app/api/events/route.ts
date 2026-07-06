// SIR V2 — POST /api/events: tagging de interacciones desde el cliente.
//
// Permite que la UI registre eventos ("abrió X", "acción Y ok/falló") en la tabla
// `events` (mig 0130), scoped al usuario. Server-side complementa con logEvent
// directo. Fail-open: si algo falla, no molesta al cliente.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { logEvent } from '@/lib/observability/logEvent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  let body: { type?: unknown; ok?: unknown; route?: unknown; meta?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 })
  }

  const type = typeof body.type === 'string' ? body.type.trim() : ''
  if (!type) return NextResponse.json({ ok: false, error: 'type requerido' }, { status: 400 })

  await logEvent(supabase, auth.user.id, {
    type,
    ok: typeof body.ok === 'boolean' ? body.ok : undefined,
    route: typeof body.route === 'string' ? body.route : undefined,
    meta: body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, unknown>) : undefined,
  })

  return NextResponse.json({ ok: true })
}

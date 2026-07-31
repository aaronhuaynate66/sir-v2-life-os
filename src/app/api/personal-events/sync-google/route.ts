// SIR V2 — POST /api/personal-events/sync-google
//
// Sube A LA VEZ todos los planes de la agenda que aún no estén en Google Calendar.
// Auth por SESIÓN (es el dueño quien lo dispara desde la app), RLS por dueño.
//
// ═══ POR QUÉ EXISTE, ADEMÁS DEL CRON ═════════════════════════════════════════
//
// El cron (`/api/cron/gcal-sync`) lo hace solo cada mañana, pero Aaron necesitaba sus
// eventos en Google **hoy**, no mañana: *"empieza a hacer que funcione y de una vez
// para ayer"*. Y lo único que existía era `[id]/push-to-google`, uno por uno.
//
// Esto es el mismo trabajo para todos los pendientes, disparable por él en el momento.
// Idempotente: un evento con `gcal_event_id` no se vuelve a crear.
//
// Respuestas: 200 { ok, creados, yaEstaban, fallidos } · 409 si no hay Google
// conectado · 401 sin sesión.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { syncPendingPersonalEvents } from '@/lib/calendar/syncPersonalEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'No autenticado', detail: 'Inicia sesión y reinténtalo.' }, { status: 401 })
  }
  try {
    const r = await syncPendingPersonalEvents(supabase, auth.user.id)
    if (r.sinConexion) {
      return NextResponse.json(
        { error: 'No hay un Google Calendar conectado', detail: 'Conéctalo desde el hub de calendarios y reinténtalo.' },
        { status: 409 },
      )
    }
    // Los errores viajan al cliente a propósito: si Google devuelve 401 hay que
    // reconectar la cuenta, y esconderlo detrás de un "ok" es cómo se perdió la boda.
    return NextResponse.json({
      ok: r.fallidos === 0,
      creados: r.creados,
      yaEstaban: r.yaEstaban,
      fallidos: r.fallidos,
      errores: r.errores.slice(0, 5),
    })
  } catch (e) {
    reportApiError(e, { route: 'personal-events/sync-google' })
    return NextResponse.json({ error: 'No se pudo sincronizar con Google' }, { status: 500 })
  }
}

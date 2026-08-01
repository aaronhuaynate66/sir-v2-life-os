// SIR V2 — GET /api/cron/gcal-sync
//
// Sube a Google Calendar todo `personal_events` que aún no esté allá.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"me hiciste crear toda la integración con Google para tener
// dónde meter los eventos, así que empieza a hacer que funcione y de una vez para
// ayer"*. Tenía razón: la integración estaba conectada y funcionando, y lo único que
// existía era un endpoint MANUAL por evento que nadie llamaba nunca. Su boda del
// 1-ago llevaba desde el 28-jul con `gcal_event_id: null`.
//
// Corre temprano (05:05 Lima) para que lo que se cargue de un día quede en su
// calendario antes del brief de la mañana.
//
// Auth: CRON_SECRET (mismo patrón que los otros crons).

import { NextResponse, type NextRequest } from 'next/server'
import { filasOFalla } from '@/lib/cron/consulta'
import { createClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { syncPendingPersonalEvents } from '@/lib/calendar/syncPersonalEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    // Los usuarios con una conexión de Google: no hay nada que sincronizar sin ella.
    //
    // `filasOFalla` en vez de `data ?? []`: si esta consulta falla, PostgREST no
    // lanza y `uids` queda vacío, así que el cron respondía **200 con nota "sin
    // conexiones de Google"** teniendo la cuenta conectada. Ese mensaje es peor que
    // un error: manda a buscar el bug a la pantalla de conexión, que está bien.
    // Ahora revienta y cae en el catch de abajo → 500 visible.
    const uids = [...new Set(filasOFalla<{ user_id: string }>(
      await admin.from('calendar_connections')
        .select('user_id').eq('provider', 'google').eq('enabled', true).limit(50),
      'conexiones de Google',
    ).map((c) => c.user_id))]
    // Cero conexiones con la consulta OK sí es legítimo (nunca conectó la cuenta).
    if (uids.length === 0) return NextResponse.json({ usuarios: 0, creados: 0, nota: 'sin conexiones de Google' })

    let creados = 0, fallidos = 0
    const errores: string[] = []
    for (const uid of uids) {
      const r = await syncPendingPersonalEvents(admin, uid)
      creados += r.creados
      fallidos += r.fallidos
      for (const e of r.errores.slice(0, 3)) errores.push(`${uid.slice(0, 8)}: ${e}`)
    }
    // Los errores se REPORTAN, no se esconden: un 401 de Google acá significa que hay
    // que reconectar la cuenta, y si el cron falla en silencio nadie se enteraría —
    // que es exactamente cómo se perdió la boda.
    if (errores.length > 0) reportApiError(new Error(errores.join(' | ').slice(0, 400)), { route: 'cron/gcal-sync' })
    return NextResponse.json({ usuarios: uids.length, creados, fallidos, errores: errores.slice(0, 5) })
  } catch (e) {
    reportApiError(e, { route: 'cron/gcal-sync' })
    return NextResponse.json({ error: 'Fallo sincronizando con Google' }, { status: 500 })
  }
}

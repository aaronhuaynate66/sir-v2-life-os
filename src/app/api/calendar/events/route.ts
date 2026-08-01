// SIR V2 — POST /api/calendar/events (sync bidireccional · Google)
//
// Crea un evento en el Google Calendar `primary` del usuario. Auth-gated.
// Requiere una conexión google conectada (OAuth, scope calendar.events). Si no
// hay conexión → 409 con mensaje claro (la UI ofrece conectar). Los tokens
// viven cifrados server-side; nunca se exponen.
//
// Body JSON: { title, start, end?, allDay?, description?, location?, connectionId? }
//   - start/end: 'YYYY-MM-DD' (día completo) o ISO con hora.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { ensureFreshGoogleToken } from '@/lib/calendar/oauth/session'
import { createGoogleEvent, type NewGoogleEvent } from '@/lib/calendar/oauth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface Body {
  title?: unknown
  start?: unknown
  end?: unknown
  allDay?: unknown
  recurring?: unknown
  description?: unknown
  location?: unknown
  connectionId?: unknown
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return errorJson(400, 'Body inválido')
  }

  const title = str(body.title)
  const start = str(body.start)
  if (!title) return errorJson(400, 'Falta el título del evento.')
  if (!start) return errorJson(400, 'Falta la fecha/hora de inicio.')

  const fresh = await ensureFreshGoogleToken(supabase, auth.user.id, str(body.connectionId) ?? null)
  if (!fresh) {
    return errorJson(
      409,
      'No hay un Google Calendar conectado',
      'Conecta tu Google Calendar (con permiso de escritura) desde /horario o /agenda y reinténtalo.',
    )
  }

  const ev: NewGoogleEvent = {
    title,
    start,
    end: str(body.end),
    allDay: body.allDay === true,
    recurring: body.recurring === true,
    description: str(body.description),
    location: str(body.location),
  }

  try {
    const created = await createGoogleEvent(fresh.token, ev)
    return NextResponse.json(
      { ok: true, event: created, accountEmail: fresh.accountEmail },
      { status: 201 },
    )
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : 'error desconocido'
    // 403/insufficient scope → el usuario autorizó solo lectura (conexión vieja).
    if (/403|insufficient|scope|permission/i.test(msg)) {
      return errorJson(
        403,
        'Sin permiso de escritura en Google',
        'Reconecta tu Google Calendar para otorgar permiso de escritura (se pedirá de nuevo).',
      )
    }
    return errorJson(502, 'No se pudo crear el evento en Google', msg.slice(0, 160))
  }
}

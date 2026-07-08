// SIR V2 — POST /api/personal-events/[id]/push-to-google
//
// Empuja un plan de la agenda personal (personal_events) al Google Calendar
// conectado del usuario. Guarda el id del evento de Google (gcal_event_id) para
// marcarlo "ya agendado" y no duplicar. Auth-gated, RLS por dueño.
//
// Respuestas: 201 { ok, gcalEventId, htmlLink } · 200 { ok, alreadySynced } si ya
// estaba · 404 si no existe el plan · 409 si no hay Google conectado · 403 si la
// conexión es de solo lectura · 502 si la API de Google falla.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { ensureFreshGoogleToken } from '@/lib/calendar/oauth/session'
import { createGoogleEvent } from '@/lib/calendar/oauth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface PlanRow {
  title: string
  event_date: string
  end_date: string | null
  all_day: boolean | null
  note: string | null
  gcal_event_id?: string | null
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  if (!id) return errorJson(400, 'Falta el id del plan')

  // Cargar el plan (con fallback si la columna gcal_event_id aún no existe).
  const COLS = 'title, event_date, end_date, all_day, note, gcal_event_id'
  const COLS_LEGACY = 'title, event_date, end_date, all_day, note'
  let plan: PlanRow | null = null
  try {
    let { data, error } = await supabase
      .from('personal_events').select(COLS).eq('user_id', auth.user.id).eq('id', id).maybeSingle()
    if (error) ({ data, error } = await supabase
      .from('personal_events').select(COLS_LEGACY).eq('user_id', auth.user.id).eq('id', id).maybeSingle())
    if (error) return errorJson(500, 'No se pudo leer el plan', error.message.slice(0, 160))
    plan = (data as unknown as PlanRow) ?? null
  } catch (e) {
    reportApiError(e, { route: 'personal-events/[id]/push-to-google', stage: 'load' })
    return errorJson(500, 'No se pudo leer el plan')
  }
  if (!plan) return errorJson(404, 'No encontré ese plan')

  // Ya empujado → idempotente, no duplicar.
  if (plan.gcal_event_id) {
    return NextResponse.json({ ok: true, alreadySynced: true, gcalEventId: plan.gcal_event_id })
  }

  const fresh = await ensureFreshGoogleToken(supabase, auth.user.id)
  if (!fresh) {
    return errorJson(
      409,
      'No hay un Google Calendar conectado',
      'Conectá tu Google Calendar desde el hub de calendarios y reintentá.',
    )
  }

  let created: { id: string; htmlLink?: string }
  try {
    created = await createGoogleEvent(fresh.token, {
      title: plan.title,
      start: plan.event_date.slice(0, 10),
      end: plan.end_date ? plan.end_date.slice(0, 10) : undefined,
      allDay: plan.all_day !== false,
      description: plan.note ?? undefined,
    })
  } catch (e) {
    reportApiError(e, { route: 'personal-events/[id]/push-to-google', stage: 'create' })
    const msg = e instanceof Error ? e.message : 'error desconocido'
    if (/403|insufficient|scope|permission/i.test(msg)) {
      return errorJson(403, 'Sin permiso de escritura en Google', 'Reconectá tu Google Calendar para otorgar escritura.')
    }
    return errorJson(502, 'No se pudo crear el evento en Google', msg.slice(0, 160))
  }

  // Persistir el vínculo (best-effort: si la columna falta, el evento YA se creó).
  try {
    await supabase
      .from('personal_events')
      .update({ gcal_event_id: created.id, updated_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('id', id)
  } catch {
    // El evento está en Google; solo no quedó marcado. La UI lo re-detecta al recargar.
  }

  return NextResponse.json({ ok: true, gcalEventId: created.id, htmlLink: created.htmlLink }, { status: 201 })
}

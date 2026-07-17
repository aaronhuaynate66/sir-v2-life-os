// SIR V2 — POST /api/objective-steps/[id]/push-to-google
//
// Empuja una TAREA de objetivo (objective_steps con target_date) al Google
// Calendar del usuario. Con due_time → evento cronometrado; sin hora → día
// completo. Guarda gcal_event_id (0139) para marcar "agendada" y no duplicar.
// Auth-gated, RLS por dueño. Sin due_date → 400 (una tarea sin fecha no es evento).
//
// La escritura de gcal_event_id NO la pisa el sync del store: su `toRow` no manda
// esa columna, y el upsert de Postgres solo toca las columnas provistas.

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

interface StepRow {
  title: string
  description: string | null
  target_date: string | null
  due_time: string | null
  gcal_event_id?: string | null
}

const DUE_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  if (!id) return errorJson(400, 'Falta el id de la tarea')

  const COLS = 'title, description, target_date, due_time, gcal_event_id'
  const COLS_LEGACY = 'title, description, target_date, due_time'
  let step: StepRow | null = null
  try {
    let { data, error } = await supabase
      .from('objective_steps').select(COLS).eq('user_id', auth.user.id).eq('id', id).maybeSingle()
    if (error) ({ data, error } = await supabase
      .from('objective_steps').select(COLS_LEGACY).eq('user_id', auth.user.id).eq('id', id).maybeSingle())
    if (error) return errorJson(500, 'No se pudo leer la tarea', error.message.slice(0, 160))
    step = (data as unknown as StepRow) ?? null
  } catch (e) {
    reportApiError(e, { route: 'objective-steps/[id]/push-to-google', stage: 'load' })
    return errorJson(500, 'No se pudo leer la tarea')
  }
  if (!step) return errorJson(404, 'No encontré esa tarea')
  if (step.gcal_event_id) return NextResponse.json({ ok: true, alreadySynced: true, gcalEventId: step.gcal_event_id })

  const date = (step.target_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errorJson(400, 'La tarea no tiene fecha', 'Ponele una fecha objetivo para agendarla en Google.')
  }

  const fresh = await ensureFreshGoogleToken(supabase, auth.user.id)
  if (!fresh) return errorJson(409, 'No hay un Google Calendar conectado', 'Conectá tu Google Calendar y reinténtalo.')

  // Con due_time válida → evento cronometrado (reloj Lima); sin hora → día completo.
  const timed = step.due_time && DUE_TIME_RE.test(step.due_time)
  const start = timed ? `${date}T${step.due_time}:00-05:00` : date

  let created: { id: string; htmlLink?: string }
  try {
    created = await createGoogleEvent(fresh.token, {
      title: step.title,
      start,
      allDay: !timed,
      description: step.description ?? undefined,
    })
  } catch (e) {
    reportApiError(e, { route: 'objective-steps/[id]/push-to-google', stage: 'create' })
    const msg = e instanceof Error ? e.message : 'error desconocido'
    if (/403|insufficient|scope|permission/i.test(msg)) {
      return errorJson(403, 'Sin permiso de escritura en Google', 'Reconectá tu Google Calendar para otorgar escritura.')
    }
    return errorJson(502, 'No se pudo crear el evento en Google', msg.slice(0, 160))
  }

  try {
    await supabase
      .from('objective_steps')
      .update({ gcal_event_id: created.id })
      .eq('user_id', auth.user.id)
      .eq('id', id)
  } catch {
    // El evento está en Google; solo no quedó marcado. Se re-detecta al re-pullear.
  }

  return NextResponse.json({ ok: true, gcalEventId: created.id, htmlLink: created.htmlLink }, { status: 201 })
}

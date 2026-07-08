// SIR V2 — PATCH/DELETE /api/personal-events/[id] (editar/borrar un plan)
//
// RLS por dueño (auth.uid() = user_id). PATCH permite editar título/fecha/nota.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { rowToPersonalEvent, type PersonalEventRow } from '@/lib/personal-events/types'
import { ensureFreshGoogleToken } from '@/lib/calendar/oauth/session'
import { deleteGoogleEvent } from '@/lib/calendar/oauth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, person_id, title, event_date, end_date, all_day, note, source, created_at, updated_at'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface PatchBody {
  title?: unknown
  date?: unknown
  endDate?: unknown
  note?: unknown
  /** Re-ligar el plan a una persona (string) o desligarlo (null). */
  personId?: unknown
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  if (!id) return errorJson(400, 'Falta el id')

  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return errorJson(400, 'Body inválido') }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 200)
  if (typeof body.date === 'string' && ISO_DATE.test(body.date.slice(0, 10))) patch.event_date = body.date.slice(0, 10)
  if (typeof body.endDate === 'string') patch.end_date = ISO_DATE.test(body.endDate.slice(0, 10)) ? body.endDate.slice(0, 10) : null
  if (typeof body.note === 'string') patch.note = body.note.trim() ? body.note.trim().slice(0, 500) : null
  // personId presente → asignar (string) o desligar (null/vacío). Ausente → no tocar.
  if ('personId' in body) patch.person_id = typeof body.personId === 'string' && body.personId ? body.personId : null

  try {
    const { data, error } = await supabase
      .from('personal_events')
      .update(patch)
      .eq('user_id', auth.user.id)
      .eq('id', id)
      .select(SELECT_COLS)
      .maybeSingle()
    if (error) return errorJson(500, 'No se pudo actualizar', error.message.slice(0, 200))
    if (!data) return errorJson(404, 'No encontré ese plan')
    return NextResponse.json({ event: rowToPersonalEvent(data as PersonalEventRow) })
  } catch (e) {
    reportApiError(e, { route: 'personal-events/[id]', stage: 'patch' })
    return errorJson(500, 'No se pudo actualizar')
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  if (!id) return errorJson(400, 'Falta el id')

  // Si el plan estaba empujado a Google (gcal_event_id), lo borramos también allá
  // (best-effort). Lectura con fallback: si la columna 0138 aún no existe, no hay
  // nada que sincronizar. NUNCA bloquea el borrado en SIR.
  let gcalEventId: string | null = null
  try {
    const { data } = await supabase
      .from('personal_events').select('gcal_event_id').eq('user_id', auth.user.id).eq('id', id).maybeSingle()
    gcalEventId = (data as { gcal_event_id?: string | null } | null)?.gcal_event_id ?? null
  } catch { /* columna ausente / error → sin sync */ }

  let googleDeleted = false
  if (gcalEventId) {
    try {
      const fresh = await ensureFreshGoogleToken(supabase, auth.user.id)
      if (fresh) { await deleteGoogleEvent(fresh.token, gcalEventId); googleDeleted = true }
    } catch (e) {
      // El evento de Google no se pudo borrar (token/permiso/red): seguimos con el
      // borrado en SIR igual. Queda un evento huérfano en Google (mejor que no borrar acá).
      reportApiError(e, { route: 'personal-events/[id]', stage: 'gcal-delete' })
    }
  }

  try {
    const { error } = await supabase.from('personal_events').delete().eq('user_id', auth.user.id).eq('id', id)
    if (error) return errorJson(500, 'No se pudo borrar', error.message.slice(0, 200))
    return NextResponse.json({ ok: true, googleDeleted })
  } catch (e) {
    reportApiError(e, { route: 'personal-events/[id]', stage: 'delete' })
    return errorJson(500, 'No se pudo borrar')
  }
}

// SIR V2 — GET/POST /api/personal-events (agenda personal, mig 0133)
//
// La agenda personal nativa de SIR: planes propios de Aaron (escribibles), la
// capa que alimenta el Horizonte del ciclo cuando el plan está ligado a una
// persona. Auth-gated, RLS por dueño. TOLERANTE: si la tabla aún no existe
// (migración sin correr), GET devuelve lista vacía en vez de 500.
//
// GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD&personId=xxx  → { events: PersonalEvent[] }
// POST { title, date, endDate?, allDay?, note?, personId? }  → { event }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { rowToPersonalEvent, type PersonalEventRow } from '@/lib/personal-events/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, person_id, title, event_date, end_date, all_day, note, source, gcal_event_id, created_at, updated_at'
// Sin `gcal_event_id`: fallback si la migración 0138 aún no corrió (los planes no desaparecen).
const SELECT_COLS_LEGACY = 'id, person_id, title, event_date, end_date, all_day, note, source, created_at, updated_at'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const personId = sp.get('personId')

  try {
    const build = (cols: string) => {
      let q = supabase.from('personal_events').select(cols).eq('user_id', auth.user.id)
      if (from && ISO_DATE.test(from)) q = q.gte('event_date', from)
      if (to && ISO_DATE.test(to)) q = q.lte('event_date', to)
      if (personId) q = q.eq('person_id', personId)
      return q.order('event_date', { ascending: true }).limit(500)
    }
    let { data, error } = await build(SELECT_COLS)
    // Columna gcal_event_id ausente (migración 0138 sin correr) → reintentar sin ella.
    if (error) ({ data, error } = await build(SELECT_COLS_LEGACY))
    if (error) return NextResponse.json({ events: [] }) // tabla ausente / error → vacío
    return NextResponse.json({ events: (data as unknown as PersonalEventRow[]).map(rowToPersonalEvent) })
  } catch {
    return NextResponse.json({ events: [] })
  }
}

interface PostBody {
  title?: unknown
  date?: unknown
  endDate?: unknown
  allDay?: unknown
  note?: unknown
  personId?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')

  let body: PostBody
  try { body = (await req.json()) as PostBody } catch { return errorJson(400, 'Body inválido') }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const date = typeof body.date === 'string' ? body.date.slice(0, 10) : ''
  if (!title) return errorJson(400, 'Falta el título del plan')
  if (!ISO_DATE.test(date)) return errorJson(400, 'Fecha inválida (usá YYYY-MM-DD)')
  const endDate = typeof body.endDate === 'string' && ISO_DATE.test(body.endDate.slice(0, 10)) ? body.endDate.slice(0, 10) : null
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const personId = typeof body.personId === 'string' && body.personId ? body.personId : null
  const allDay = body.allDay !== false

  try {
    const { data, error } = await supabase
      .from('personal_events')
      .insert({
        user_id: auth.user.id,
        person_id: personId,
        title,
        event_date: date,
        end_date: endDate,
        all_day: allDay,
        note,
        source: 'sir',
        updated_at: new Date().toISOString(),
      })
      .select(SELECT_COLS)
      .maybeSingle()
    if (error) return errorJson(500, 'No se pudo guardar el plan', error.message.slice(0, 200))
    return NextResponse.json({ event: rowToPersonalEvent(data as PersonalEventRow) }, { status: 201 })
  } catch (e) {
    reportApiError(e, { route: 'personal-events' })
    return errorJson(500, 'No se pudo guardar el plan')
  }
}

// SIR V2 — GET/POST/DELETE /api/watched-events  (18·M3: "Eventos que sigo")
//
// CRUD de los eventos externos que Aaron declara seguir. Session-auth, RLS +
// eq(user_id) defensivo. Fail-open si la tabla 0122 no está aplicada aún.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeNode } from '@/lib/external/watchedEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SELECT = 'id, title, event_date, node, related_id, impact, created_at'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    eventDate: ((r.event_date as string) ?? '').slice(0, 10),
    node: normalizeNode(r.node),
    relatedId: (r.related_id as string | null) ?? null,
    impact: (r.impact as string) ?? '',
    createdAt: (r.created_at as string) ?? '',
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  try {
    const { data } = await supabase
      .from('watched_events')
      .select(SELECT)
      .eq('user_id', auth.user.id)
      .order('event_date', { ascending: true })
      .limit(200)
    return NextResponse.json({ events: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) })
  } catch {
    // Tabla 0122 no aplicada aún → sin eventos, sin romper.
    return NextResponse.json({ events: [] })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { title?: unknown; eventDate?: unknown; node?: unknown; relatedId?: unknown; impact?: unknown }
  try { body = (await req.json()) as typeof body } catch { return err(400, 'Body inválido') }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.slice(0, 10) : ''
  if (!title) return err(400, 'Falta el título del evento')
  if (!DATE_RE.test(eventDate)) return err(400, 'Fecha inválida (YYYY-MM-DD)')
  const node = normalizeNode(body.node)
  const relatedId = typeof body.relatedId === 'string' && body.relatedId ? body.relatedId.slice(0, 200) : null
  const impact = typeof body.impact === 'string' ? body.impact.trim().slice(0, 500) : ''

  const { data, error } = await supabase
    .from('watched_events')
    .insert({ user_id: auth.user.id, title, event_date: eventDate, node, related_id: relatedId, impact })
    .select(SELECT)
    .single()
  if (error) return err(500, error.message)
  return NextResponse.json({ event: mapRow(data as Record<string, unknown>) })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  await supabase.from('watched_events').delete().eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

// SIR V2 — GET/PATCH /api/person-status-alerts
//
// Lee las alertas activas de status y permite marcar seen/dismissed.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AlertRow {
  id: string; person_id: string; from_label: string; to_label: string;
  message: string; created_at: string; seen_at: string | null; dismissed_at: string | null;
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase
      .from('person_status_alerts')
      .select('id, person_id, from_label, to_label, message, created_at, seen_at, dismissed_at')
      .eq('user_id', auth.user.id).is('dismissed_at', null)
      .order('created_at', { ascending: false }).limit(50)
    const alerts = (data ?? []) as AlertRow[]
    // Traer nombre + slug de las personas afectadas.
    const personIds = [...new Set(alerts.map((a) => a.person_id))]
    if (personIds.length === 0) return NextResponse.json({ alerts: [] })
    const { data: peopleRaw } = await supabase.from('people').select('id, name, slug').eq('user_id', auth.user.id).in('id', personIds)
    const peopleById = new Map<string, { name: string; slug: string | null }>()
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; name: string; slug: string | null }>)) {
      peopleById.set(p.id, { name: p.name, slug: p.slug })
    }
    const enriched = alerts.map((a) => ({
      ...a,
      person_name: peopleById.get(a.person_id)?.name ?? '',
      person_slug: peopleById.get(a.person_id)?.slug ?? null,
    }))
    return NextResponse.json({ alerts: enriched })
  } catch { return NextResponse.json({ alerts: [] }) }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let body: { id?: unknown; action?: unknown }
  try { body = await req.json() as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  const action = body.action
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const patch: Record<string, string> = {}
  if (action === 'seen') patch.seen_at = new Date().toISOString()
  else if (action === 'dismissed') patch.dismissed_at = new Date().toISOString()
  else return NextResponse.json({ error: 'action inválida' }, { status: 400 })
  await supabase.from('person_status_alerts').update(patch).eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

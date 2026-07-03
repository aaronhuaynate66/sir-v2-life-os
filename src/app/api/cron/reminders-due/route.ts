// SIR V2 — GET /api/cron/reminders-due
//
// Corre cada 15 minutos. Busca reminders con due_at <= now, done_at IS NULL,
// notified_at IS NULL. Por cada uno:
//   1. Dispara push notification al user (best-effort).
//   2. Marca notified_at para no re-disparar.
// Auth: CRON_SECRET.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pushToUser } from '@/lib/push/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('reminders')
    .select('id, user_id, text, related_person_id')
    .lte('due_at', now).is('done_at', null).is('notified_at', null).limit(50)
  const rows = (data ?? []) as Array<{ id: string; user_id: string; text: string; related_person_id: string | null }>
  if (rows.length === 0) return NextResponse.json({ processed: 0 })

  // Traer person slug para deep-link.
  const pids = [...new Set(rows.map((r) => r.related_person_id).filter((v): v is string => v != null))]
  const slugById = new Map<string, string | null>()
  if (pids.length > 0) {
    const { data: peopleRaw } = await supabase.from('people').select('id, slug').in('id', pids)
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; slug: string | null }>)) slugById.set(p.id, p.slug)
  }

  let notified = 0
  for (const r of rows) {
    const slug = r.related_person_id ? slugById.get(r.related_person_id) : null
    void pushToUser(r.user_id, {
      title: 'SIR · Recordatorio',
      body: r.text,
      url: slug ? `/relaciones/${slug}` : '/panel',
      tag: `reminder-${r.id}`,
      requireInteraction: false,
    })
    // Marcar como notificado inmediatamente para no re-disparar aunque el push falle.
    await supabase.from('reminders').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
    notified++
  }

  return NextResponse.json({ processed: rows.length, notified })
}

// SIR V2 — GET/POST/PATCH/DELETE /api/reminders

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

const SELECT = 'id, text, due_at, related_person_id, related_goal_id, done_at, notified_at, created_at'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const scope = req.nextUrl.searchParams.get('scope') // 'pending' | 'done' | 'all'
  let q = supabase.from('reminders').select(SELECT).eq('user_id', auth.user.id).order('due_at', { ascending: true }).limit(100)
  if (scope === 'pending' || !scope) q = q.is('done_at', null)
  else if (scope === 'done') q = q.not('done_at', 'is', null)
  const { data } = await q
  // Enriquecer con person_name si hay related_person_id.
  const rows = (data ?? []) as Array<{ id: string; text: string; due_at: string; related_person_id: string | null; related_goal_id: string | null; done_at: string | null; notified_at: string | null; created_at: string }>
  const pids = [...new Set(rows.map((r) => r.related_person_id).filter((v): v is string => v != null))]
  const personByIds = new Map<string, { name: string; slug: string | null }>()
  if (pids.length > 0) {
    const { data: peopleRaw } = await supabase.from('people').select('id, name, slug').eq('user_id', auth.user.id).in('id', pids)
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; name: string; slug: string | null }>)) personByIds.set(p.id, { name: p.name, slug: p.slug })
  }
  return NextResponse.json({
    reminders: rows.map((r) => ({
      ...r,
      person_name: r.related_person_id ? personByIds.get(r.related_person_id)?.name ?? null : null,
      person_slug: r.related_person_id ? personByIds.get(r.related_person_id)?.slug ?? null : null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { text?: unknown; due_at?: unknown; related_person_id?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const text = typeof body.text === 'string' ? body.text.slice(0, 500).trim() : ''
  const dueAt = typeof body.due_at === 'string' ? body.due_at : ''
  if (!text || !dueAt) return err(400, 'text y due_at requeridos')
  const relatedPersonId = typeof body.related_person_id === 'string' ? body.related_person_id : null
  const { data, error } = await supabase.from('reminders').insert({
    user_id: auth.user.id, text, due_at: dueAt, related_person_id: relatedPersonId,
  }).select(SELECT).single()
  if (error) return err(500, error.message)
  return NextResponse.json({ reminder: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { id?: unknown; action?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return err(400, 'id requerido')
  const patch: Record<string, string | null> = {}
  if (body.action === 'done') patch.done_at = new Date().toISOString()
  else if (body.action === 'undone') patch.done_at = null
  else return err(400, 'action inválida')
  await supabase.from('reminders').update(patch).eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  await supabase.from('reminders').delete().eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

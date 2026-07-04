// SIR V2 — GET/POST/PATCH/DELETE /api/diario
//
// CRUD del journal íntimo. GET soporta search + tag filter.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMentionedPersons, extractTags } from '@/lib/diario/mentions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

// mentioned_goal_ids descartada (columna muerta, nunca escrita — mig 0124).
const SELECT = 'id, content, mood, tags, mentioned_person_ids, entry_date, created_at, updated_at'

interface EntryRow {
  id: string
  content: string
  mood: number | null
  tags: string[]
  mentioned_person_ids: string[]
  entry_date: string
  created_at: string
  updated_at: string
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const tag = req.nextUrl.searchParams.get('tag')?.trim() ?? ''
  const personId = req.nextUrl.searchParams.get('person_id')?.trim() ?? ''
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)))

  let query = supabase.from('journal_entries').select(SELECT)
    .eq('user_id', auth.user.id)
    .order('entry_date', { ascending: false }).limit(limit)
  if (q.length >= 2) query = query.textSearch('content', q, { config: 'spanish' })
  if (tag) query = query.contains('tags', [tag])
  if (personId) query = query.contains('mentioned_person_ids', [personId])

  const { data } = await query
  const rows = (data ?? []) as EntryRow[]

  // Enriquecer con nombres de personas mencionadas (para chips en la UI).
  const pidsAll = new Set<string>()
  for (const r of rows) for (const pid of r.mentioned_person_ids) pidsAll.add(pid)
  const personById = new Map<string, { name: string; slug: string | null }>()
  if (pidsAll.size > 0) {
    const { data: peopleRaw } = await supabase.from('people').select('id, name, slug').eq('user_id', auth.user.id).in('id', [...pidsAll])
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; name: string; slug: string | null }>)) personById.set(p.id, { name: p.name, slug: p.slug })
  }
  const enriched = rows.map((r) => ({
    ...r,
    mentioned_persons: r.mentioned_person_ids.map((pid) => ({
      id: pid,
      name: personById.get(pid)?.name ?? '?',
      slug: personById.get(pid)?.slug ?? null,
    })).filter((m) => m.name !== '?'),
  }))

  return NextResponse.json({ entries: enriched })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { content?: unknown; mood?: unknown; entry_date?: unknown; mentioned_person_ids?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return err(400, 'content requerido')
  if (content.length > 20000) return err(400, 'content demasiado largo (máx 20k chars)')
  const mood = typeof body.mood === 'number' && body.mood >= 1 && body.mood <= 5 ? Math.round(body.mood) : null
  const entryDate = typeof body.entry_date === 'string' && body.entry_date ? body.entry_date : new Date().toISOString()

  // Auto-detección de menciones + tags (sobreescribible con mentioned_person_ids explícito).
  const { data: peopleRaw } = await supabase.from('people').select('id, name').eq('user_id', auth.user.id).limit(500)
  const people = (peopleRaw ?? []) as Array<{ id: string; name: string }>
  const auto = detectMentionedPersons(content, people)
  const explicit = Array.isArray(body.mentioned_person_ids)
    ? (body.mentioned_person_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : null
  const mentionedPersons = explicit ?? auto
  const tags = extractTags(content)

  const { data, error } = await supabase.from('journal_entries').insert({
    user_id: auth.user.id,
    content, mood, tags,
    mentioned_person_ids: mentionedPersons,
    entry_date: entryDate,
  }).select(SELECT).single()
  if (error) return err(500, error.message)
  return NextResponse.json({ entry: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { id?: unknown; content?: unknown; mood?: unknown; tags?: unknown; mentioned_person_ids?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return err(400, 'id requerido')
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.content === 'string') patch.content = body.content.slice(0, 20000)
  if (body.mood === null || (typeof body.mood === 'number' && body.mood >= 1 && body.mood <= 5)) patch.mood = body.mood
  if (Array.isArray(body.tags)) patch.tags = (body.tags as unknown[]).filter((x): x is string => typeof x === 'string')
  if (Array.isArray(body.mentioned_person_ids)) patch.mentioned_person_ids = (body.mentioned_person_ids as unknown[]).filter((x): x is string => typeof x === 'string')
  await supabase.from('journal_entries').update(patch).eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  await supabase.from('journal_entries').delete().eq('user_id', auth.user.id).eq('id', id)
  return NextResponse.json({ ok: true })
}

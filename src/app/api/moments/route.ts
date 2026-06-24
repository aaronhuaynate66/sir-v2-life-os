// SIR V2 — /api/moments (Momentos / Decisiones relacionales · multi-persona).
// relationship_moments no está en el tipo generado → .from() compila igual.
// Un momento tiene UNA persona PRIMARIA (person_id) y, opcionalmente, otros
// participantes (tabla moment_participants, mig 0095). Esto lo vuelve un
// "episodio compartido" (ej. la pelea del Mundial: mamá + hermana).
// GET    ?person_id=  → episodios donde la persona participa (primaria O participante)
//        ?open=1      → todos los episodios ABIERTOS del usuario (para brief/recordatorio)
// POST   { person_id | person_ids[], title, detail?, occurred_on?, follow_up_on? }
// PATCH  { id, status?, resolution?, title?, detail?, follow_up_on? }
// DELETE ?id=
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapMomentRow, type RelationshipMoment } from '@/lib/moments/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at'

type SB = Awaited<ReturnType<typeof createClient>>
interface MomentRowShape { id: string; person_id: string }

/** Adjunta participantIds (primaria + participantes) a cada momento mapeado. */
async function withParticipants(supabase: SB, userId: string, rows: unknown[]): Promise<RelationshipMoment[]> {
  const mapped = (rows as MomentRowShape[]).map((r) => mapMomentRow(r as Parameters<typeof mapMomentRow>[0]))
  const ids = mapped.map((m) => m.id)
  const extra = new Map<string, string[]>()
  if (ids.length) {
    try {
      const { data } = await supabase.from('moment_participants').select('moment_id, person_id').eq('user_id', userId).in('moment_id', ids)
      for (const p of (data ?? []) as Array<{ moment_id: string; person_id: string }>) {
        const a = extra.get(p.moment_id) ?? []; a.push(p.person_id); extra.set(p.moment_id, a)
      }
    } catch { /* */ }
  }
  return mapped.map((m) => ({ ...m, participantIds: Array.from(new Set([m.personId, ...(extra.get(m.id) ?? [])])) }))
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const personId = req.nextUrl.searchParams.get('person_id')
  const onlyOpen = req.nextUrl.searchParams.get('open') === '1'
  try {
    if (personId) {
      // momentos donde la persona es PRIMARIA o PARTICIPANTE.
      let participantMomentIds: string[] = []
      try {
        const { data: pm } = await supabase.from('moment_participants').select('moment_id').eq('user_id', auth.user.id).eq('person_id', personId)
        participantMomentIds = ((pm ?? []) as Array<{ moment_id: string }>).map((r) => r.moment_id)
      } catch { /* */ }
      let q = supabase.from('relationship_moments').select(SELECT).eq('user_id', auth.user.id)
      if (participantMomentIds.length) {
        q = q.or(`person_id.eq.${personId},id.in.(${participantMomentIds.join(',')})`)
      } else {
        q = q.eq('person_id', personId)
      }
      const { data } = await q.order('occurred_on', { ascending: false }).limit(100)
      return NextResponse.json({ moments: await withParticipants(supabase, auth.user.id, data ?? []) })
    }
    let q = supabase.from('relationship_moments').select(SELECT).eq('user_id', auth.user.id)
    if (onlyOpen) q = q.eq('status', 'abierto')
    const { data } = await q.order('occurred_on', { ascending: false }).limit(100)
    return NextResponse.json({ moments: await withParticipants(supabase, auth.user.id, data ?? []) })
  } catch { return NextResponse.json({ moments: [] }) }
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}
const ISO = /^\d{4}-\d{2}-\d{2}$/
function dateOrNull(v: unknown): string | null {
  return typeof v === 'string' && ISO.test(v.trim()) ? v.trim() : null
}
function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const x of v) { const s = str(x, 60); if (s) out.push(s) }
  return Array.from(new Set(out))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  // person_ids[] (multi) tiene prioridad; si no, person_id (legacy).
  let ids = idList(b.person_ids)
  if (!ids.length) { const single = str(b.person_id, 60); if (single) ids = [single] }
  const title = str(b.title, 200)
  if (!ids.length || !title) return NextResponse.json({ error: 'person_id(s) y title requeridos' }, { status: 400 })
  // Ownership de TODAS las personas.
  const { data: owned } = await supabase.from('people').select('id').eq('user_id', auth.user.id).in('id', ids)
  const ownedIds = new Set(((owned ?? []) as Array<{ id: string }>).map((r) => r.id))
  const validIds = ids.filter((x) => ownedIds.has(x))
  if (!validIds.length) return NextResponse.json({ error: 'Persona(s) no encontrada(s)' }, { status: 404 })
  const primary = validIds[0]
  const extras = validIds.slice(1)
  const row: Record<string, unknown> = {
    user_id: auth.user.id, person_id: primary, title,
    detail: str(b.detail, 2000),
    status: 'abierto',
    follow_up_on: dateOrNull(b.follow_up_on),
  }
  const occurred = dateOrNull(b.occurred_on)
  if (occurred) row.occurred_on = occurred
  try {
    const { data, error } = await supabase.from('relationship_moments').insert(row).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    const moment = mapMomentRow(data)
    if (extras.length) {
      try {
        await supabase.from('moment_participants').insert(extras.map((pid) => ({ user_id: auth.user.id, moment_id: moment.id, person_id: pid })))
      } catch { /* el momento ya quedó; participantes best-effort */ }
    }
    return NextResponse.json({ moment: { ...moment, participantIds: validIds } })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 60)
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (b.status === 'abierto' || b.status === 'resuelto') patch.status = b.status
  if ('resolution' in b) patch.resolution = str(b.resolution, 2000)
  if ('title' in b) { const t = str(b.title, 200); if (t) patch.title = t }
  if ('detail' in b) patch.detail = str(b.detail, 2000)
  if ('follow_up_on' in b) patch.follow_up_on = dateOrNull(b.follow_up_on)
  try {
    const { data, error } = await supabase.from('relationship_moments').update(patch).eq('user_id', auth.user.id).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
    const [moment] = await withParticipants(supabase, auth.user.id, [data])
    return NextResponse.json({ moment })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo actualizar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('relationship_moments').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}

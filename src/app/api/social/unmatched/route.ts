// SIR V2 — Bandeja "¿quién es quién?" de señales sociales SIN asignar.
//
// GET    → lista las señales que el reader vio pero no pudo matchear a un contacto
//          (cuentas que Aaron sigue con story, sin handle seteado). Recientes 1º.
// POST   → ASIGNA una a una persona: setea su instagram_handle (o marca el LI) y
//          PROMUEVE las señales guardadas de esa identidad a contact_activity →
//          de ahí en más el reader la matchea sola.
// DELETE → DESCARTA una (una cuenta que no es un contacto: negocio, desconocido).
//
// Sesión (RLS owner-only). Fail-open.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { canonHandle } from '@/lib/social-reader/match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEDUP_HOURS = 6

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data } = await supabase
    .from('unmatched_social_activity')
    .select('id, platform, handle, name, kind, detail, observed_at')
    .order('observed_at', { ascending: false })
    .limit(200)
  return NextResponse.json({ items: data ?? [] }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  let body: { id?: unknown; personId?: unknown; newPerson?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  let personId = typeof body.personId === 'string' ? body.personId : ''
  // Crear una persona nueva desde la bandeja (Aaron: "crear a esa persona si no
  // existe"). El cliente manda id+slug generados para que su store y esta fila
  // converjan en el MISMO id (upsert idempotente, sin duplicar). El insert va
  // ANTES de promover → la FK contact_activity.person_id nunca falla.
  const np = body.newPerson as { id?: unknown; name?: unknown; slug?: unknown } | undefined
  const newPerson = np && typeof np.id === 'string' && typeof np.name === 'string' && np.name.trim().length >= 2
    ? { id: np.id, name: np.name.trim().slice(0, 120), slug: typeof np.slug === 'string' ? np.slug : null }
    : null
  if (!id || (!personId && !newPerson)) return NextResponse.json({ error: 'id y (personId o newPerson) requeridos' }, { status: 400 })

  // La fila que Aaron está asignando (RLS ya la limita a su dueño).
  const { data: row } = await supabase
    .from('unmatched_social_activity')
    .select('id, platform, handle, name, kind, detail, observed_at')
    .eq('id', id).limit(1).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Señal no encontrada' }, { status: 404 })

  const canon = row.handle ? canonHandle(row.handle) : null

  // 0. Si es persona nueva: crearla en people ANTES de promover (defaults
  //    conservadores; el store del cliente hará upsert del MISMO id con el resto).
  if (newPerson) {
    personId = newPerson.id
    await supabase.from('people').insert({
      id: newPerson.id, user_id: userId, name: newPerson.name, slug: newPerson.slug,
      relationship: 'acquaintance', category: 'network',
      importance_score: 5, energy_impact: 'neutral', trust_level: 5,
      instagram_handle: row.platform === 'instagram' && canon ? canon : null,
      notes: 'Creado desde ¿quién es quién?',
    })
  }

  // 1. Setear el identificador en la persona → futuras capturas matchean solas.
  if (row.platform === 'instagram' && canon) {
    await supabase.from('people').update({ instagram_handle: canon }).eq('id', personId)
  }

  // 2. Promover TODAS las señales guardadas de esa identidad (mismo handle) a
  //    contact_activity, deduplicando por (persona, kind) en la ventana. Luego
  //    borrarlas de la bandeja.
  const sinceIso = new Date(Date.now() - DEDUP_HOURS * 3_600_000).toISOString()
  const sameIdentity = canon
    ? (await supabase.from('unmatched_social_activity').select('id, kind, detail, observed_at, platform').eq('handle', canon)).data ?? []
    : [{ id: row.id, kind: row.kind, detail: row.detail, observed_at: row.observed_at, platform: row.platform }]
  let promoted = 0
  const doneIds: string[] = []
  for (const u of sameIdentity as Array<{ id: string; kind: string; detail: string | null; observed_at: string; platform: string }>) {
    const { data: rec } = await supabase
      .from('contact_activity').select('id')
      .eq('user_id', userId).eq('person_id', personId).eq('kind', u.kind).gte('observed_at', sinceIso).limit(1)
    if (!rec || rec.length === 0) {
      const { error } = await supabase.from('contact_activity').insert({
        user_id: userId, person_id: personId, kind: u.kind, detail: u.detail, source: u.platform, observed_at: u.observed_at,
      })
      if (!error) promoted++
    }
    doneIds.push(u.id)
  }
  if (doneIds.length > 0) await supabase.from('unmatched_social_activity').delete().in('id', doneIds)

  return NextResponse.json({ ok: true, promoted, handleSet: canon, created: !!newPerson }, { status: 200 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let body: { id?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  await supabase.from('unmatched_social_activity').delete().eq('id', id)
  return NextResponse.json({ ok: true }, { status: 200 })
}

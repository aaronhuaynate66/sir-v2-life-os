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

const AVATAR_BUCKET = 'person-avatars'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Incluye las columnas del match por cara (mig 0160). Resiliente a la ventana
  // de deploy: si el código llega a Vercel antes que la migración, el select con
  // las columnas nuevas fallaría y vaciaría la bandeja → caemos al select base.
  const withFace = await supabase
    .from('unmatched_social_activity')
    .select('id, platform, handle, name, kind, detail, observed_at, avatar_path, avatar_url, face_person_id, face_confidence')
    .order('observed_at', { ascending: false })
    .limit(200)
  const data = withFace.error
    ? (await supabase
        .from('unmatched_social_activity')
        .select('id, platform, handle, name, kind, detail, observed_at, avatar_path, avatar_url')
        .order('observed_at', { ascending: false })
        .limit(200)).data
    : withFace.data
  const rows = (data ?? []) as Array<{ id: string; avatar_path: string | null; avatar_url: string | null; face_person_id?: string | null; face_confidence?: string | null; [k: string]: unknown }>

  // Cara visible: signed URL del snapshot permanente (1 sola llamada batch). Si
  // aún no se snapshoteó, cae a la URL cruda de IG (fresca funciona; vieja no).
  const paths = rows.map((r) => r.avatar_path).filter((p): p is string => !!p)
  const signedByPath: Record<string, string> = {}
  if (paths.length > 0) {
    try {
      const { data: signed } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(paths, 3600)
      for (const s of signed ?? []) if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl
    } catch { /* fail-soft */ }
  }
  const items = rows.map((r) => ({
    id: r.id, platform: r.platform, handle: r.handle, name: r.name, kind: r.kind, detail: r.detail, observed_at: r.observed_at,
    avatar: (r.avatar_path && signedByPath[r.avatar_path]) || r.avatar_url || null,
    // Match por cara (capa 2, cacheado): contacto sugerido por foto + confianza.
    facePersonId: r.face_person_id ?? null,
    faceConfidence: r.face_confidence ?? null,
  }))
  return NextResponse.json({ items }, { status: 200 })
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
    .select('id, platform, handle, name, kind, detail, observed_at, avatar_path')
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

  // 1b. BOOTSTRAP de galería de caras: si la señal traía una foto snapshoteada y
  //     el contacto aún no tiene avatar, la copiamos como su avatar. Así la
  //     galería de referencia crece sola con cada asignación → el match por cara
  //     (contra contactos con foto) se va encendiendo. No pisa un avatar ya puesto.
  const avatarPath = (row as { avatar_path?: string | null }).avatar_path
  if (avatarPath) {
    try {
      const { data: existingAv } = await supabase
        .from('person_avatars').select('person_id').eq('user_id', userId).eq('person_id', personId).maybeSingle()
      if (!existingAv) {
        const ext = (avatarPath.split('.').pop() || 'jpg').toLowerCase()
        const dest = `${userId}/${personId}.${ext}`
        const { error: cpErr } = await supabase.storage.from(AVATAR_BUCKET).copy(avatarPath, dest)
        if (!cpErr) {
          await supabase.from('person_avatars').upsert(
            { user_id: userId, person_id: personId, storage_path: dest, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,person_id' },
          )
        }
      }
    } catch { /* fail-soft: el avatar es un plus, no bloquea la asignación */ }
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

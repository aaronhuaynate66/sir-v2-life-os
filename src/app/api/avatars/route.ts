// SIR V2 — /api/avatars. Foto/avatar por persona (tabla person_avatars + bucket
// privado person-avatars). El archivo se sube client-side; acá registramos el
// path y servimos signed URLs. .from() directo (no en tipo generado).
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BUCKET = 'person-avatars'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const personId = req.nextUrl.searchParams.get('person_id')
  try {
    let q = supabase.from('person_avatars').select('person_id, storage_path').eq('user_id', auth.user.id)
    if (personId) q = q.eq('person_id', personId)
    const { data } = await q.limit(2000)
    const rows = (data as Array<{ person_id: string; storage_path: string }>) ?? []
    const avatars: Record<string, string> = {}
    for (const r of rows) {
      try {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600)
        if (signed?.signedUrl) avatars[r.person_id] = signed.signedUrl
      } catch { /* */ }
    }
    return NextResponse.json({ avatars })
  } catch { return NextResponse.json({ avatars: {} }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: { person_id?: unknown; storage_path?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  const path = typeof b.storage_path === 'string' ? b.storage_path : ''
  if (!personId || !path) return NextResponse.json({ error: 'person_id y storage_path requeridos' }, { status: 400 })
  if (!path.startsWith(`${auth.user.id}/`)) return NextResponse.json({ error: 'path fuera de tu carpeta' }, { status: 403 })
  const { data: prow } = await supabase.from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
  if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
  try { await supabase.from('person_avatars').upsert({ user_id: auth.user.id, person_id: personId, storage_path: path, updated_at: new Date().toISOString() }, { onConflict: 'user_id,person_id' }) } catch (e) {
    return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
  try {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? null })
  } catch { return NextResponse.json({ ok: true, url: null }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })
  try {
    const { data } = await supabase.from('person_avatars').select('storage_path').eq('user_id', auth.user.id).eq('person_id', personId).maybeSingle()
    const path = (data as { storage_path?: string } | null)?.storage_path
    await supabase.from('person_avatars').delete().eq('user_id', auth.user.id).eq('person_id', personId)
    if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
  } catch { /* */ }
  return NextResponse.json({ ok: true })
}

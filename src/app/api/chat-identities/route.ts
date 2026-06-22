// SIR V2 — /api/chat-identities. Mapea huella de chat → persona, para
// auto-rutear el re-import de WhatsApp. chat_identities no está en el tipo
// generado → .from() directo. RLS.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const fp = req.nextUrl.searchParams.get('fingerprint') || ''
  if (!fp) return NextResponse.json({ personId: null })
  try {
    const { data } = await supabase.from('chat_identities').select('person_id').eq('user_id', auth.user.id).eq('fingerprint', fp).maybeSingle()
    const personId = (data as { person_id?: string } | null)?.person_id ?? null
    if (!personId) return NextResponse.json({ personId: null })
    // Confirmar que la persona sigue existiendo + traer su nombre.
    const { data: prow } = await supabase.from('people').select('id, name').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
    if (!prow) return NextResponse.json({ personId: null })
    return NextResponse.json({ personId, personName: (prow as { name: string }).name })
  } catch { return NextResponse.json({ personId: null }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: { fingerprint?: unknown; person_id?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const fp = typeof b.fingerprint === 'string' ? b.fingerprint.slice(0, 240) : ''
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  if (!fp || !personId) return NextResponse.json({ error: 'fingerprint y person_id requeridos' }, { status: 400 })
  try { await supabase.from('chat_identities').upsert({ user_id: auth.user.id, fingerprint: fp, person_id: personId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,fingerprint' }) } catch { /* */ }
  return NextResponse.json({ ok: true })
}

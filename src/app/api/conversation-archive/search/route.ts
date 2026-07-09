// SIR V2 — GET /api/conversation-archive/search?person_id=&q=&source=
// Busca dentro del historial de una persona. SUSTRATO-FIRST: si hay mensajes en
// chat_messages (mig 0141), busca ahí — full-text por mensaje, sobre el hilo
// COMPLETO (sin el corte de 3MB del blob) y para toda persona con sustrato. Si
// aún no tiene sustrato, cae al blob crudo archivado (conversation_archives). RLS.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchArchive } from '@/lib/conversation/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const MAX_HITS = 30

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const personId = req.nextUrl.searchParams.get('person_id')
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const source = req.nextUrl.searchParams.get('source') ?? 'whatsapp'
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })
  if (q.trim().length < 2) return NextResponse.json({ hits: [], note: 'query muy corta' }, { status: 200 })

  // ── SUSTRATO-FIRST ──────────────────────────────────────────────────────
  // ¿esta persona tiene hilo en el sustrato? Si sí, es la fuente completa.
  const { count: subCount } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId).eq('person_id', personId)
  if ((subCount ?? 0) > 0) {
    // ILIKE por mensaje (los comodines de la query se neutralizan). Full-text
    // sobre el hilo entero, ordenado por fecha desc.
    const like = `%${q.trim().replace(/[%_\\]/g, ' ')}%`
    const { data: rows, error } = await supabase
      .from('chat_messages')
      .select('sent_at, content')
      .eq('user_id', userId).eq('person_id', personId)
      .ilike('content', like)
      .order('sent_at', { ascending: false })
      .limit(MAX_HITS)
    if (error) return NextResponse.json({ error: 'No se pudo buscar', detail: error.message }, { status: 500 })
    const hits = (rows ?? []).map((r) => ({
      date: r.sent_at ? String(r.sent_at).slice(0, 10) : null,
      snippet: String(r.content ?? '').slice(0, 300),
    }))
    return NextResponse.json({ hits, archived: true, truncated: false, source: 'substrate' }, { status: 200 })
  }

  // ── FALLBACK: blob crudo archivado ──────────────────────────────────────
  const { data, error } = await supabase
    .from('conversation_archives')
    .select('raw_text, truncated, date_first, date_last')
    .eq('user_id', userId).eq('person_id', personId).eq('source', source).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo leer el archivo', detail: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ hits: [], archived: false }, { status: 200 })

  const hits = searchArchive((data.raw_text as string) ?? '', q, MAX_HITS)
  return NextResponse.json({ hits, archived: true, truncated: !!data.truncated, range: { first: data.date_first, last: data.date_last } }, { status: 200 })
}

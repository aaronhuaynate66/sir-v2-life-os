// SIR V2 — GET /api/conversation-archive/search?person_id=&q=&source=
// Busca dentro del historial crudo archivado de una persona. RLS.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchArchive } from '@/lib/conversation/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const personId = req.nextUrl.searchParams.get('person_id')
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const source = req.nextUrl.searchParams.get('source') ?? 'whatsapp'
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })
  if (q.trim().length < 2) return NextResponse.json({ hits: [], note: 'query muy corta' }, { status: 200 })

  const { data, error } = await supabase
    .from('conversation_archives')
    .select('raw_text, truncated, date_first, date_last')
    .eq('user_id', auth.user.id).eq('person_id', personId).eq('source', source).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo leer el archivo', detail: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ hits: [], archived: false }, { status: 200 })

  const hits = searchArchive((data.raw_text as string) ?? '', q, 30)
  return NextResponse.json({ hits, archived: true, truncated: !!data.truncated, range: { first: data.date_first, last: data.date_last } }, { status: 200 })
}

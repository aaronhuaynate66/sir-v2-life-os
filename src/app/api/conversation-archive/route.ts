// SIR V2 — POST /api/conversation-archive (bitácora 1: guardar el crudo).
// Upsert por (user, person, source): el export más reciente ES el historial más
// completo. raw_text capado al tramo reciente (~3MB) para el límite de body.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tailCap } from '@/lib/conversation/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const MAX_CHARS = 3_000_000

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return String(h >>> 0)
}
function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = str(b.personId, 80)
  const rawIn = typeof b.rawText === 'string' ? b.rawText : ''
  if (!personId || rawIn.length === 0) return NextResponse.json({ error: 'personId y rawText requeridos' }, { status: 400 })

  const { text: raw, truncated } = tailCap(rawIn, MAX_CHARS)
  const hash = djb2(raw)
  const source = str(b.source, 40) ?? 'whatsapp'

  // Si ya existe con el mismo hash, no reescribir (idempotente).
  const { data: existing } = await supabase
    .from('conversation_archives')
    .select('id, content_hash')
    .eq('user_id', auth.user.id).eq('person_id', personId).eq('source', source).maybeSingle()
  if (existing && existing.content_hash === hash) {
    return NextResponse.json({ ok: true, unchanged: true }, { status: 200 })
  }

  const row = {
    // id: lo genera la DB en insert (default gen_random_uuid). En update, el
    // onConflict matchea por (user_id, person_id, source), no por id. Enviar
    // id:undefined hacía que PostgREST mandara null → violaba el not-null.
    ...(existing?.id ? { id: existing.id as string } : {}),
    user_id: auth.user.id, person_id: personId, source,
    date_first: str(b.dateFirst, 20), date_last: str(b.dateLast, 20),
    message_count: typeof b.messageCount === 'number' ? b.messageCount : null,
    content_hash: hash, raw_text: raw, truncated, updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('conversation_archives').upsert([row], { onConflict: 'user_id,person_id,source' })
  if (error) return NextResponse.json({ error: 'No se pudo archivar', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, truncated, chars: raw.length }, { status: 200 })
}

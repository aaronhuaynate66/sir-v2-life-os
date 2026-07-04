// SIR V2 — /api/bigfive (19·M4 + M5): guardar/leer un perfil Big Five consentido.
//   GET ?subject=self|<personId> → el perfil (o null).
//   POST { subject, o,c,e,a,n }   → upsert (dedupe por subject).
// Session-auth + RLS. Query directa.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEL = 'subject, o, c, e, a, n, taken_at'

function clampScore(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const subject = req.nextUrl.searchParams.get('subject')
  if (!subject) return NextResponse.json({ error: 'subject requerido' }, { status: 400 })
  const { data } = await supabase.from('big_five_profiles').select(SEL).eq('user_id', auth.user.id).eq('subject', subject).maybeSingle()
  return NextResponse.json({ profile: data ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const subject = typeof b.subject === 'string' && b.subject.trim() ? b.subject.trim().slice(0, 80) : null
  if (!subject) return NextResponse.json({ error: 'subject requerido' }, { status: 400 })

  const row = {
    user_id: auth.user.id, subject,
    o: clampScore(b.o), c: clampScore(b.c), e: clampScore(b.e), a: clampScore(b.a), n: clampScore(b.n),
    taken_at: new Date().toISOString(),
  }
  if ([row.o, row.c, row.e, row.a, row.n].some((v) => v === null)) {
    return NextResponse.json({ error: 'faltan puntajes' }, { status: 400 })
  }
  const { data, error } = await supabase.from('big_five_profiles').upsert(row, { onConflict: 'user_id,subject' }).select(SEL).maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
  return NextResponse.json({ profile: data ?? null })
}

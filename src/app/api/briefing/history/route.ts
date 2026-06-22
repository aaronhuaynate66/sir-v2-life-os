// SIR V2 — GET /api/briefing/history → briefs anteriores (recientes primero).
// DELETE ?id= borra uno. briefing_history no está en el tipo generado → .from().
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BriefRow { id: string; kind: string; content: string; created_at: string }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase
      .from('briefing_history')
      .select('id, kind, content, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    const briefs = ((data as BriefRow[]) ?? []).map((b) => ({ id: b.id, kind: b.kind, content: b.content, createdAt: b.created_at }))
    return NextResponse.json({ briefs })
  } catch { return NextResponse.json({ briefs: [] }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('briefing_history').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}

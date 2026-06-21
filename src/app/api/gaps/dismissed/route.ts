// SIR V2 — Descartes del Knowledge Gap Engine, cross-device (#114 follow-up).
// GET  → { keys: string[] }  (todos los gap_key descartados del usuario)
// POST { key }  → registra un descarte (idempotente)
// La tabla gap_dismissals no está en el tipo generado; el server client no es
// estrictamente tipado, así que .from('gap_dismissals') compila. Best-effort.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase
      .from('gap_dismissals')
      .select('gap_key')
      .eq('user_id', auth.user.id)
      .limit(1000)
    const keys = ((data as Array<{ gap_key: string }>) ?? []).map((r) => r.gap_key)
    return NextResponse.json({ keys })
  } catch {
    return NextResponse.json({ keys: [] })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let body: { key?: unknown }
  try { body = (await req.json()) as { key?: unknown } } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const key = typeof body.key === 'string' ? body.key.trim().slice(0, 200) : ''
  if (!key) return NextResponse.json({ error: 'key requerido' }, { status: 400 })
  try {
    await supabase.from('gap_dismissals').upsert(
      { user_id: auth.user.id, gap_key: key },
      { onConflict: 'user_id,gap_key' },
    )
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}

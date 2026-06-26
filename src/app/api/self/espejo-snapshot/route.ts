// SIR V2 — /api/self/espejo-snapshot (Tendencia del Espejo semana a semana).
// POST upsert del estado de la semana actual (idempotente por week_start).
// GET  últimas ~10 semanas para dibujar la tendencia.
// espejo_snapshots no está en el tipo generado → .from() compila igual.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mondayLima } from '@/lib/experiments/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'week_start, state, gaps_count, wins_count'
const STATES = new Set(['sin_datos', 'sin_norte', 'a_la_deriva', 'a_medias', 'alineado'])

interface SnapRow { week_start: string; state: string; gaps_count: number; wins_count: number }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase
      .from('espejo_snapshots')
      .select(SELECT)
      .eq('user_id', auth.user.id)
      .order('week_start', { ascending: true })
      .limit(12)
    const snapshots = ((data ?? []) as SnapRow[]).map((r) => ({
      weekStart: r.week_start.slice(0, 10),
      state: r.state,
      gaps: r.gaps_count,
      wins: r.wins_count,
    }))
    return NextResponse.json({ snapshots })
  } catch { return NextResponse.json({ snapshots: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const state = typeof b.state === 'string' && STATES.has(b.state) ? b.state : null
  if (!state || state === 'sin_datos') return NextResponse.json({ ok: false }) // no guardamos semanas vacías
  const row = {
    user_id: auth.user.id,
    week_start: mondayLima(),
    state,
    gaps_count: Number.isFinite(b.gaps) ? Math.max(0, Math.trunc(b.gaps as number)) : 0,
    wins_count: Number.isFinite(b.wins) ? Math.max(0, Math.trunc(b.wins as number)) : 0,
    updated_at: new Date().toISOString(),
  }
  try {
    await supabase.from('espejo_snapshots').upsert(row, { onConflict: 'user_id,week_start' })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

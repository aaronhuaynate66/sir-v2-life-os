// SIR V2 — POST /api/people/cycle. Setea el ciclo de una persona
// (cycle_start_date + cycle_length_days) desde fuera del store. Útil para
// cargar/ajustar el ciclo sin pasar por el form. RLS + ownership.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: { person_id?: unknown; cycle_start_date?: unknown; cycle_length_days?: unknown; phase?: unknown; date?: unknown; note?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })

  // Modo ENTRADA (person_cycles): registrar un DÍA con estado (bleeding/pms/…).
  // Alimenta la detección de patrones del forecast conductual (anclas).
  const PHASES = ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown']
  if (typeof b.phase === 'string' && PHASES.includes(b.phase)) {
    const date = typeof b.date === 'string' && ISO.test(b.date) ? b.date : null
    if (!date) return NextResponse.json({ error: 'date inválida (YYYY-MM-DD)' }, { status: 400 })
    const { data: prow } = await supabase.from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
    if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
    const { error } = await supabase.from('person_cycles').insert({
      user_id: auth.user.id, person_id: personId, date, phase: b.phase,
      confidence: 'medium', source: 'aaron',
      note: typeof b.note === 'string' ? b.note.slice(0, 300) : null,
    })
    if (error) return NextResponse.json({ error: 'No se pudo registrar', detail: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, entry: { date, phase: b.phase } })
  }

  const start = typeof b.cycle_start_date === 'string' && ISO.test(b.cycle_start_date) ? b.cycle_start_date : null
  if (!start) return NextResponse.json({ error: 'cycle_start_date inválido (YYYY-MM-DD)' }, { status: 400 })
  const len = typeof b.cycle_length_days === 'number' && Number.isFinite(b.cycle_length_days)
    ? Math.max(15, Math.min(60, Math.round(b.cycle_length_days))) : 28
  const { data: prow } = await supabase.from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
  if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
  const { error } = await supabase.from('people').update({ cycle_start_date: start, cycle_length_days: len }).eq('user_id', auth.user.id).eq('id', personId)
  if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cycle_start_date: start, cycle_length_days: len })
}

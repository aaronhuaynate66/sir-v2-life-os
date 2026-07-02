// SIR V2 — GET/POST/DELETE /api/person-cycles
//
// CRUD del ciclo menstrual de terceros (person_cycles, mig 0110).
// Sesión-auth. RLS por user_id.
//
// GET    ?person_id=…&from=YYYY-MM-DD&to=YYYY-MM-DD → entries de la ventana
// POST   { person_id, date, phase, confidence?, source?, note? }
// DELETE ?id=…

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, person_id, date, phase, confidence, source, note, created_at'
const PHASES = ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown'] as const
const CONFIDENCES = ['high', 'medium', 'low'] as const
const SOURCES = ['aaron', 'self_report'] as const

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function ymd(v: unknown): string | null {
  const s = str(v, 20)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  const personId = req.nextUrl.searchParams.get('person_id')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  try {
    let q = supabase.from('person_cycles').select(SELECT).eq('user_id', auth.user.id)
    if (personId) q = q.eq('person_id', personId)
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    const { data, error } = await q.order('date', { ascending: false }).limit(500)
    if (error) return NextResponse.json({ entries: [] })
    return NextResponse.json({ entries: data ?? [] })
  } catch { return NextResponse.json({ entries: [] }) }
}

interface PostBody {
  person_id?: unknown
  date?: unknown
  phase?: unknown
  confidence?: unknown
  source?: unknown
  note?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  let body: PostBody
  try { body = (await req.json()) as PostBody } catch { return errorJson(400, 'Body inválido') }
  const personId = str(body.person_id, 60)
  const date = ymd(body.date)
  const phase = str(body.phase, 20)
  if (!personId || !date || !phase) return errorJson(400, 'person_id, date, phase requeridos')
  if (!PHASES.includes(phase as (typeof PHASES)[number])) return errorJson(400, `phase inválida (${PHASES.join(', ')})`)
  const confidence = (str(body.confidence, 10) as (typeof CONFIDENCES)[number] | null) ?? 'medium'
  if (!CONFIDENCES.includes(confidence)) return errorJson(400, 'confidence inválida')
  const source = (str(body.source, 20) as (typeof SOURCES)[number] | null) ?? 'aaron'
  if (!SOURCES.includes(source)) return errorJson(400, 'source inválida')
  const note = str(body.note, 500)

  // Ownership de la persona.
  const { data: ownedPerson } = await supabase
    .from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).single()
  if (!ownedPerson) return errorJson(404, 'Persona no encontrada')

  try {
    const { data, error } = await supabase.from('person_cycles').upsert({
      user_id: auth.user.id,
      person_id: personId,
      date,
      phase,
      confidence,
      source,
      note,
    }, { onConflict: 'user_id,person_id,date' }).select(SELECT).single()
    if (error) return errorJson(500, 'No pude guardar', error.message)
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (e) {
    return errorJson(500, 'No pude guardar', e instanceof Error ? e.message : String(e))
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return errorJson(401, 'No autenticado')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return errorJson(400, 'id requerido')
  try {
    const { error } = await supabase.from('person_cycles').delete()
      .eq('user_id', auth.user.id).eq('id', id)
    if (error) return errorJson(500, 'No pude borrar', error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(500, 'No pude borrar', e instanceof Error ? e.message : String(e))
  }
}

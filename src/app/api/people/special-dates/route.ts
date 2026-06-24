// SIR V2 — POST /api/people/special-dates (#130/#131/#132). Agrega fechas
// importadas a una persona PASÁNDOLAS por el filtro central: dedup contra las
// existentes + entre sí, descarta genéricas/no-personales, y no agrega el
// cumpleaños si ya hay fecha de nacimiento. Devuelve cuántas se agregaron.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cleanImportDates, type IncomingDate } from '@/lib/people/dateFilter'
import type { SpecialDate } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  const incoming = Array.isArray(b.dates) ? (b.dates as IncomingDate[]).filter((d) => d && typeof d.label === 'string' && typeof d.date === 'string') : []
  if (!personId || incoming.length === 0) return NextResponse.json({ added: 0 })

  try {
    const { data: prow } = await supabase.from('people').select('name, birth_date, special_dates').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
    if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
    const p = prow as { name?: string; birth_date?: string | null; special_dates?: unknown }
    const existing: SpecialDate[] = Array.isArray(p.special_dates) ? (p.special_dates as SpecialDate[]) : []
    const added = cleanImportDates(incoming, existing, p.birth_date ?? null, p.name ?? '')
    if (added.length === 0) return NextResponse.json({ added: 0 })
    const next = [...existing, ...added]
    const { error } = await supabase.from('people').update({ special_dates: next }).eq('user_id', auth.user.id).eq('id', personId)
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ added: added.length })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

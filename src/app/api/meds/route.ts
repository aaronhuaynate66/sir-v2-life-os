// SIR V2 — Registro de tomas de medicación (#migraña). med_intakes no está en
// el tipo generado → .from() compila igual. Best-effort.
// GET  → { intakes: [...], names: [...] }  (historial + nombres frecuentes p/ botones)
// POST { name, quantity?, note? } → registra la toma (taken_at = ahora)
// DELETE ?id=  → borra una toma (corregir errores)

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface IntakeRow { id: string; name: string; quantity: number; note: string | null; taken_at: string }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase
      .from('med_intakes')
      .select('id, name, quantity, note, taken_at')
      .eq('user_id', auth.user.id)
      .order('taken_at', { ascending: false })
      .limit(200)
    const intakes = (data as IntakeRow[]) ?? []
    let registry: Array<{ name: string; dose: string | null }> = []
    try {
      const { data: reg } = await supabase.from('med_registry').select('name, dose').eq('user_id', auth.user.id).order('created_at', { ascending: true }).limit(50)
      registry = (reg as Array<{ name: string; dose: string | null }>) ?? []
    } catch { /* */ }
    // Nombres frecuentes (para botones de un toque), por recencia + frecuencia.
    const seen = new Set<string>(); const names: string[] = []
    for (const r of intakes) { if (!seen.has(r.name)) { seen.add(r.name); names.push(r.name) } }
    return NextResponse.json({ intakes, names: names.slice(0, 8), registry })
  } catch {
    return NextResponse.json({ intakes: [], names: [], registry: [] })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: { name?: unknown; quantity?: unknown; note?: unknown; taken_at?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 })
  const quantity = typeof b.quantity === 'number' && b.quantity > 0 ? Math.min(b.quantity, 99) : 1
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 240) : null
  // Hora elegida (ISO). Si no viene o es inválida → la DB usa el default (ahora).
  const takenAt = typeof b.taken_at === 'string' && !Number.isNaN(Date.parse(b.taken_at)) ? new Date(b.taken_at).toISOString() : null
  try {
    const { data, error } = await supabase
      .from('med_intakes')
      .insert({ user_id: auth.user.id, name, quantity, note, ...(takenAt ? { taken_at: takenAt } : {}) })
      .select('id, name, quantity, note, taken_at')
      .single()
    if (error) return NextResponse.json({ error: 'No se pudo registrar', detail: error.message }, { status: 500 })
    return NextResponse.json({ intake: data })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo registrar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try {
    await supabase.from('med_intakes').delete().eq('user_id', auth.user.id).eq('id', id)
  } catch { /* */ }
  return NextResponse.json({ ok: true })
}

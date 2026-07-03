// SIR V2 — "Mis medicamentos" (registro para botones de un toque). med_registry
// no está en el tipo generado → .from() compila. Best-effort.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const { data } = await supabase.from('med_registry').select('name, dose, component, drug_class, treats, note').eq('user_id', auth.user.id).order('created_at', { ascending: true }).limit(50)
    return NextResponse.json({ meds: data ?? [] })
  } catch {
    // Fallback si 0118 no está aún: sin las columnas de desglose.
    try {
      const { data } = await supabase.from('med_registry').select('name, dose').eq('user_id', auth.user.id).limit(50)
      return NextResponse.json({ meds: data ?? [] })
    } catch { return NextResponse.json({ meds: [] }) }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: { name?: unknown; dose?: unknown; component?: unknown; drug_class?: unknown; treats?: unknown; note?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 })
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
  const dose = str(b.dose, 120)
  // Desglose (opcional). Solo se incluyen las keys presentes en el body, para no
  // pisar con null lo ya cargado en un upsert parcial.
  const breakdown: Record<string, string | null> = {}
  if ('component' in b) breakdown.component = str(b.component, 240)
  if ('drug_class' in b) breakdown.drug_class = str(b.drug_class, 80)
  if ('treats' in b) breakdown.treats = str(b.treats, 120)
  if ('note' in b) breakdown.note = str(b.note, 240)
  const row = { user_id: auth.user.id, name, dose, ...breakdown }
  try {
    await supabase.from('med_registry').upsert(row, { onConflict: 'user_id,name' })
  } catch {
    // Fallback si 0118 no está: guardar al menos name+dose.
    try { await supabase.from('med_registry').upsert({ user_id: auth.user.id, name, dose }, { onConflict: 'user_id,name' }) } catch { /* */ }
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const name = req.nextUrl.searchParams.get('name')
  if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 })
  try { await supabase.from('med_registry').delete().eq('user_id', auth.user.id).eq('name', name) } catch { /* */ }
  return NextResponse.json({ ok: true })
}

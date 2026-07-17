// SIR V2 — GET/POST/PATCH/DELETE /api/relaciones/contact-reminders
//
// "Recordar antes de contactar" (diferenciador #3, mig 0148). Recordatorios
// ligados a una PERSONA que SIR resurge antes de tu próximo contacto — no por
// fecha (eso es /api/reminders), sino por evento. GET fail-open mientras la
// migración se propaga (PostgREST cachea el esquema viejo unos minutos).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToContactReminder, sortContactReminders } from '@/lib/contact-reminders/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

const SELECT = 'id, person_id, text, kind, status, created_at, done_at'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) return err(400, 'person_id requerido')
  try {
    const { data, error } = await supabase
      .from('contact_reminders')
      .select(SELECT)
      .eq('user_id', auth.user.id)
      .eq('person_id', personId)
      .eq('status', 'pending')
      .limit(100)
    if (error) throw error
    const reminders = sortContactReminders((data ?? []).map((r) => rowToContactReminder(r as Record<string, unknown>)))
    return NextResponse.json({ reminders })
  } catch {
    // Tabla 0148 aún no propagada → sin recordatorios (no rompe la ficha).
    return NextResponse.json({ reminders: [] })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  let body: { person_id?: unknown; text?: unknown; kind?: unknown }
  try { body = (await req.json()) as typeof body } catch { return err(400, 'Body inválido') }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const text = typeof body.text === 'string' ? body.text.slice(0, 500).trim() : ''
  const kind = body.kind === 'standing' ? 'standing' : 'once'
  if (!personId || !text) return err(400, 'person_id y text requeridos')
  const { data, error } = await supabase
    .from('contact_reminders')
    .insert({ user_id: auth.user.id, person_id: personId, text, kind })
    .select(SELECT)
    .single()
  if (error) return err(500, 'No se pudo crear el recordatorio', error.message)
  return NextResponse.json({ reminder: rowToContactReminder(data as Record<string, unknown>) })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  let body: { id?: unknown; status?: unknown }
  try { body = (await req.json()) as typeof body } catch { return err(400, 'Body inválido') }
  const id = typeof body.id === 'string' ? body.id : ''
  const status = body.status === 'done' ? 'done' : body.status === 'pending' ? 'pending' : ''
  if (!id || !status) return err(400, 'id y status (done|pending) requeridos')
  const { data, error } = await supabase
    .from('contact_reminders')
    .update({ status, done_at: status === 'done' ? new Date().toISOString() : null })
    .eq('user_id', auth.user.id)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) return err(500, 'No se pudo actualizar el recordatorio', error.message)
  return NextResponse.json({ reminder: rowToContactReminder(data as Record<string, unknown>) })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  const { error } = await supabase
    .from('contact_reminders')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('id', id)
  if (error) return err(500, 'No se pudo borrar el recordatorio', error.message)
  return NextResponse.json({ ok: true })
}

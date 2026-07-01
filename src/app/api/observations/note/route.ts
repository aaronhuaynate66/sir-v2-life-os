// SIR V2 — POST /api/observations/note
//
// "Anotar algo ahora" desde la ficha: crea una observation con
// capture_type='manual_note' + data.text + observed_at=now. No mueve el
// campo `people.notes` (esa es la ficha "quién es" — inmutable en su
// naturaleza descriptiva). Esta ruta escribe EVENTOS fechados que caen en
// la Bitácora.
//
// Auth por sesión. RLS del user hace el resto.
// Body: { person_id: string, text: string }
// Response 200: { observation: { id, observed_at } }

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) return errorJson(401, 'No autenticado')
  const userId = authData.user.id

  let body: { person_id?: unknown; text?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!personId) return errorJson(400, 'person_id requerido')
  if (!text) return errorJson(400, 'text requerido (no vacío)')
  if (text.length > 4000) return errorJson(400, 'text demasiado largo (max 4000 chars)')

  // Ownership: la persona es del usuario.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  if (!personRow) return errorJson(404, 'Persona no encontrada o sin permiso')

  const nowIso = new Date().toISOString()
  const id = `obs_note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const { data: inserted, error: insErr } = await supabase
    .from('observations')
    .insert({
      id,
      user_id: userId,
      person_id: personId,
      capture_type: 'manual_note',
      data: { text, source: 'anotar_ahora' },
      confidence: 'high',
      observed_at: nowIso,
      is_obsolete: false,
    })
    .select('id, observed_at')
    .maybeSingle()

  if (insErr) return errorJson(500, 'No se pudo guardar la nota', insErr.message)
  return NextResponse.json({ observation: inserted }, { status: 200 })
}

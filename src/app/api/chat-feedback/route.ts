// SIR V2 — /api/chat-feedback (Ola 2, slice 2)
//
// Captura el 👍/👎 del chat de SIR con el turno COMPLETO (pregunta + respuesta +
// contexto usado), para que la señal sea aprovechable por el harness de eval y el
// loop de aprendizaje. Corre en paralelo al flujo de `suggestions` (que sigue
// alimentando su panel). POST crea; PATCH agrega la corrección del 👎.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: { question?: unknown; answer?: unknown; rating?: unknown; context?: unknown; channel?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const answer = typeof b.answer === 'string' ? b.answer.slice(0, 8000) : ''
  const rating = b.rating === 'up' || b.rating === 'down' ? b.rating : null
  if (!answer || !rating) return NextResponse.json({ error: 'answer y rating (up|down) requeridos' }, { status: 400 })
  const question = typeof b.question === 'string' ? b.question.slice(0, 4000) : null
  const channel = b.channel === 'telegram' ? 'telegram' : 'web'
  const context = b.context && typeof b.context === 'object' ? b.context : null

  const { data, error } = await supabase
    .from('chat_feedback')
    .insert({ user_id: auth.user.id, question, answer, rating, context, channel })
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message.slice(0, 160) }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id ?? null })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: { id?: unknown; correction?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = typeof b.id === 'string' ? b.id : ''
  const correction = typeof b.correction === 'string' ? b.correction.slice(0, 2000) : ''
  if (!id || !correction) return NextResponse.json({ error: 'id y correction requeridos' }, { status: 400 })

  // RLS ya acota al dueño; el eq(user_id) es defensa extra.
  const { error } = await supabase
    .from('chat_feedback')
    .update({ correction })
    .eq('id', id)
    .eq('user_id', auth.user.id)
  if (error) return NextResponse.json({ error: 'No se pudo guardar la corrección', detail: error.message.slice(0, 160) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

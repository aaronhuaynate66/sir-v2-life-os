// SIR V2 — GET /api/sir/thread
//
// Devuelve el hilo conversacional del usuario (sir_messages, mig 0143) para que
// el chat web lo cargue al montar — así ve también lo hablado por Telegram
// (historial unificado cross-canal). Requiere sesión. Fail-open → [].
//
// Response 200: { turns: [{ role, text, channel, at }] }  (orden cronológico).
// Sirve tanto para la carga inicial como para el POLLING de sincronización viva:
// preserva `channel` y `at` (created_at) para separadores de día, hora y la
// marca "vía Telegram" del hilo unificado.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getSirThreadDetailed } from '@/lib/sir/thread'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error } = await supabase.auth.getUser()
  if (error || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const turns = await getSirThreadDetailed(supabase, authData.user.id, 40)
  return NextResponse.json({ turns }, { status: 200 })
}

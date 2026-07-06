// SIR V2 — POST /api/conversation-analytics (Capa 0: estadística temporal pura).
//
// Body { personId }. Junta los mensajes de la persona (Teams/DM + WhatsApp),
// corre el engine PURO analyzeConversation y devuelve la analítica temporal:
// tendencia de volumen, cadencia + próximo contacto, latencia, balance, tono y
// temas que suben. Sin LLM, sin API externa. Loguea el evento (mig 0130).

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getConversationMessages } from '@/lib/conversation-analytics/fromObservations'
import { analyzeConversation } from '@/lib/conversation-analytics/analyze'
import { logEvent } from '@/lib/observability/logEvent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { personId?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return NextResponse.json({ error: 'Falta personId' }, { status: 400 })

  const messages = await getConversationMessages(supabase, auth.user.id, personId)
  const analytics = analyzeConversation(messages, Date.now())

  await logEvent(supabase, auth.user.id, {
    type: 'conversation-analytics', ok: true, route: 'conversation-analytics',
    meta: { personId, total: analytics.total },
  })

  return NextResponse.json({ analytics })
}

// SIR V2 — GET/POST /api/sir/settings (#86 PR3)
// Lee/actualiza el modelo elegido para el chat de SIR (sir_settings, mig 0080).
// NO maneja API keys de terceros (follow-up con almacenamiento seguro).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeTier, DEFAULT_SIR_TIER } from '@/lib/sir/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const { data } = await supabase
    .from('sir_settings')
    .select('chat_model')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  return NextResponse.json({ chatModel: normalizeTier(data?.chat_model) }, { status: 200 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { chat_model?: unknown }
  try { body = (await req.json()) as { chat_model?: unknown } } catch { return err(400, 'Body invalido') }
  const tier = normalizeTier(body.chat_model)
  const { error } = await supabase
    .from('sir_settings')
    .upsert({ user_id: auth.user.id, chat_model: tier, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return err(500, error.message)
  return NextResponse.json({ chatModel: tier || DEFAULT_SIR_TIER }, { status: 200 })
}

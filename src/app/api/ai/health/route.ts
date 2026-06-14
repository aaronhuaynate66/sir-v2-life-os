// SIR V2 — GET /api/ai/health
//
// Chequeo barato del estado de la IA: hace un ping mínimo (haiku, max_tokens 1)
// y clasifica el resultado. Sirve para el banner global que avisa cuando se
// agotaron los créditos de Anthropic (la API no expone saldo, así que el único
// modo confiable de "saber" es intentar y leer el error). Coste despreciable.
//
// Respuestas: { ok:true } | { ok:false, reason:'credits'|'auth'|'config'|'other', detail? }

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { isAiCreditError } from '@/lib/ai/billingError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const PING_MODEL = 'claude-haiku-4-5-20251001'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, reason: 'auth' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'config' })
  }
  const client = new Anthropic({ maxRetries: 0 })
  try {
    await client.messages.create({
      model: PING_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ok' }],
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (isAiCreditError(e)) {
      return NextResponse.json({ ok: false, reason: 'credits' })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, reason: 'other', detail: msg.slice(0, 200) })
  }
}

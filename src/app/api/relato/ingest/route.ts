// SIR V2 — POST /api/relato/ingest
//
// Recibe un relato en prosa de Aaron. Llama a Claude Sonnet con tools que
// estructuran el relato en acciones (moments, logs, notas, cumples). Devuelve
// el PLAN. Si el body trae `apply: true`, además EJECUTA cada acción contra
// Supabase con la sesión de Aaron.
//
// Reglas duras:
//   - Auth COMBINADA (C2): sesión (cookie, la UI de Aaron) O bearer con un token
//     personal (Fase 1) — para "contarle por chat" desde AFUERA (Claude.ai, un
//     script, un atajo del cel). Con token usamos service-role scoped por userId.
//   - Nombre completo obligatorio en cada tool. Si Claude no puede
//     desambiguar, debe llamar `flag_ambiguo` (que no crea nada, solo pide
//     aclaración).
//   - Contexto de "las dos Dianas" incluido en el system prompt para evitar
//     el bug del backfill anterior.
//   - Sin escritura silenciosa: apply=false por default → dry-run que Aaron
//     revisa en el UI antes de confirmar.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { authenticateRequest } from '@/lib/auth/tokens'
import { runRelatoIngest } from '@/lib/relato-ingest/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body { text?: unknown; apply?: unknown }

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  // Auth combinada: sesión (cookie) o bearer con token personal (Fase 1).
  const user = await authenticateRequest(req)
  if (!user) return err(401, 'No autenticado', 'Inicia sesión o manda un token personal (Bearer).')
  const userId = user.userId
  // Cliente: sesión con RLS si vino por cookie; service-role (scoped por userId)
  // si vino por token — el caller externo no tiene sesión.
  let supabase: SupabaseClient
  if (user.tokenId) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return err(500, 'Supabase service-role no configurado en el servidor')
    supabase = createServiceClient(url, key, { auth: { persistSession: false } })
  } else {
    supabase = (await createClient()) as unknown as SupabaseClient
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return err(501, 'ANTHROPIC_API_KEY no configurado en el servidor')

  let body: Body
  try { body = (await req.json()) as Body } catch { return err(400, 'Body inválido') }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return err(400, 'text requerido')
  if (text.length > 8000) return err(400, 'text demasiado largo (máx 8000 chars)')
  const shouldApply = body.apply === true

  try {
    const result = await runRelatoIngest({ supabase, userId, text, apply: shouldApply, apiKey })
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 502
    return err(status, 'Falló la ingesta', e instanceof Error ? e.message : String(e))
  }
}

// SIR V2 — POST /api/relaciones/intake-suggest (intake inteligente)
//
// Recibe señales ya extraídas en el cliente (LinkedIn/WhatsApp/Instagram) y pide
// a la IA que proponga identidad + tipo de relación. NO persiste: la propuesta
// se confirma/edita en la UI. Espeja el patrón de /api/empresas/extract.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import {
  INTAKE_SYSTEM_PROMPT,
  buildIntakeInput,
  parseIntakeSuggestion,
  type IntakeSignals,
} from '@/lib/relaciones/intakeSuggest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : undefined
}

/** Sanea defensivamente las señales que manda el cliente. */
function sanitizeSignals(raw: unknown): IntakeSignals {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const li = (r.linkedin && typeof r.linkedin === 'object' ? r.linkedin : null) as Record<string, unknown> | null
  const ig = (r.instagram && typeof r.instagram === 'object' ? r.instagram : null) as Record<string, unknown> | null
  const wa = (r.whatsapp && typeof r.whatsapp === 'object' ? r.whatsapp : null) as Record<string, unknown> | null
  return {
    linkedin: li
      ? { fullName: str(li.fullName, 160), headline: str(li.headline, 240), company: str(li.company, 160) }
      : null,
    instagram: ig ? { displayName: str(ig.displayName, 160), handle: str(ig.handle, 80) } : null,
    whatsapp: wa
      ? {
          name: str(wa.name, 160),
          participants: Array.isArray(wa.participants)
            ? wa.participants.filter((x): x is string => typeof x === 'string').slice(0, 12).map((x) => x.slice(0, 80))
            : [],
          excerpt: str(wa.excerpt, 1500),
        }
      : null,
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { signals?: unknown }
  try {
    body = (await req.json()) as { signals?: unknown }
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  const signals = sanitizeSignals(body.signals)
  const hasAny = signals.linkedin || signals.instagram || signals.whatsapp
  if (!hasAny) return errorJson(400, 'Sin señales para analizar')

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(503, 'IA no disponible', 'Falta configurar ANTHROPIC_API_KEY.')
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: INTAKE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildIntakeInput(signals) }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const suggestion = parseIntakeSuggestion(block && block.type === 'text' ? block.text : '')
    if (!suggestion) return errorJson(502, 'No se pudo proponer una identidad')
    return NextResponse.json({ suggestion }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }
}

// SIR V2 — POST /api/relaciones/intake-suggest (intake inteligente)
//
// Recibe señales ya extraídas en el cliente (LinkedIn/WhatsApp/Instagram) y pide
// a la IA que proponga identidad + tipo de relación. NO persiste: la propuesta
// se confirma/edita en la UI. Espeja el patrón de /api/empresas/extract.

import { NextResponse, type NextRequest } from 'next/server'
import { complete, LlmError } from '@/lib/llm'
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

  try {
    const res = await complete({
      task: 'extract',
      sensitivity: 'third_party',
      system: INTAKE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildIntakeInput(signals) }],
      maxTokens: 400,
    }, { supabase, userId: authData.user.id })
    const suggestion = parseIntakeSuggestion(res.text)
    if (!suggestion) return errorJson(502, 'No se pudo proponer una identidad')
    return NextResponse.json({ suggestion }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(503, 'IA no disponible', 'No hay proveedor LLM configurado.')
    }
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }
}

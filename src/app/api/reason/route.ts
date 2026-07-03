// SIR V2 — POST /api/reason  (Multi-Persona Reasoner, A1)
//
// El corazón de la base científica: SIR razona el momento a través de VARIAS
// lentes (personas.ts) y sintetiza. Recibe el CognitiveAssessment (A2, "Foco
// ahora") del cliente, elige las lentes según los dominios del foco, arma UNA
// llamada estructurada (consciente del costo) y devuelve la lectura por lente +
// la síntesis. On-demand (lo dispara el usuario), Sonnet por calidad.
//
// Auth: sesión de Supabase. Rate-limit 'generation'. Mismo pipeline tolerante
// que /api/meds/extract (retry si el JSON falla).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import type { CognitiveAssessment } from '@/engines/orchestrator'
import type { PriorityDomain } from '@/engines/priority'
import { selectPersonas, PERSONAS, type CognitivePersona } from '@/lib/reasoner/personas'
import { buildReasonerPrompt, type ReasonerResult, type LensTake } from '@/lib/reasoner/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 40

const MODEL_ID = 'claude-sonnet-4-5'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}
function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

/** Valida mínimamente el CognitiveAssessment que manda el cliente. */
function parseAssessment(x: unknown): CognitiveAssessment | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const peace = o.peace as Record<string, unknown> | undefined
  if (!peace || typeof peace.total !== 'number') return null
  const focus = Array.isArray(o.focus) ? o.focus : []
  return {
    peace: {
      total: peace.total as number,
      trend: (['improving', 'stable', 'declining'].includes(peace.trend as string) ? peace.trend : 'stable') as CognitiveAssessment['peace']['trend'],
      recoveryMode: !!peace.recoveryMode,
    },
    focus: focus.slice(0, 12).map((f) => {
      const g = f as Record<string, unknown>
      return {
        domain: (g.domain as PriorityDomain) ?? 'optimization',
        domainLabel: typeof g.domainLabel === 'string' ? g.domainLabel : '',
        kind: g.kind === 'threat' ? 'threat' : 'recommendation',
        title: typeof g.title === 'string' ? g.title.slice(0, 200) : '',
        detail: typeof g.detail === 'string' ? g.detail.slice(0, 300) : '',
        severityRank: typeof g.severityRank === 'number' ? g.severityRank : 3,
      }
    }),
    headline: typeof o.headline === 'string' ? o.headline : null,
  }
}

/** Dominios del foco en orden de aparición (dedup) → para elegir lentes. */
function focusDomains(a: CognitiveAssessment): PriorityDomain[] {
  const out: PriorityDomain[] = []
  for (const f of a.focus) if (!out.includes(f.domain)) out.push(f.domain)
  return out
}

function sanitizeResult(x: unknown, personas: CognitivePersona[]): ReasonerResult {
  const o = (x ?? {}) as Record<string, unknown>
  const allowed = new Set(personas)
  const perLens: LensTake[] = Array.isArray(o.perLens)
    ? (o.perLens as unknown[])
        .map((e) => {
          const g = (e ?? {}) as Record<string, unknown>
          const persona = g.persona as CognitivePersona
          if (!allowed.has(persona)) return null
          const take = typeof g.take === 'string' ? g.take.trim().slice(0, 300) : ''
          if (!take) return null
          return { persona, label: PERSONAS[persona].label, take }
        })
        .filter((v): v is LensTake => !!v)
    : []
  const synthesis = typeof o.synthesis === 'string' ? o.synthesis.trim().slice(0, 800) : ''
  return { perLens, synthesis }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: unknown
  try { body = await req.json() } catch { return errorJson(400, 'JSON inválido') }
  const assessment = parseAssessment((body as Record<string, unknown>)?.assessment)
  if (!assessment) return errorJson(400, 'Body inválido', 'Se esperaba { assessment: CognitiveAssessment }')

  const personas = selectPersonas(focusDomains(assessment))
  const { system, user } = buildReasonerPrompt(assessment, personas)

  if (!process.env.ANTHROPIC_API_KEY) return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  const client = new Anthropic({ maxRetries: 2 })

  async function call(extra = ''): Promise<string> {
    const msg = await client.messages.create({
      model: MODEL_ID, max_tokens: 900,
      system: extra ? `${system}\n\n${extra}` : system,
      messages: [{ role: 'user', content: user }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text : ''
  }

  let raw = ''
  try {
    raw = await call()
  } catch (e) {
    reportApiError(e)
    return errorJson(502, 'Falló la llamada a Claude', (e instanceof Error ? e.message : String(e)).slice(0, 300))
  }

  let parsed: unknown = null
  try { parsed = JSON.parse(stripFences(raw)) } catch { parsed = null }
  if (!parsed || typeof parsed !== 'object') {
    try { parsed = JSON.parse(stripFences(await call('CRÍTICO: devolvé SOLO el JSON, empezando con { y terminando con }.'))) } catch {
      return errorJson(502, 'Claude devolvió formato inválido')
    }
  }

  const result = sanitizeResult(parsed, personas)
  if (!result.synthesis && result.perLens.length === 0) return errorJson(502, 'No obtuve una lectura del modelo')
  return NextResponse.json({ result, personas })
}

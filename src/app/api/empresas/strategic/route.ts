// SIR V2 — POST /api/empresas/strategic (escalón 3b)
//
// Lectura estratégica de una empresa/holding. Recibe { slug }, RECOMPUTA el hub
// server-side (no confía en el cliente), y pide a Anthropic una lectura breve.
// Misma línea que el briefing: estrategia legítima sobre vínculos genuinos, sin
// engaño ni daño.

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { buildCompanyHub, type HubPerson, type HubGoal } from '@/lib/people/companyHub'
import {
  STRATEGIC_SYSTEM_PROMPT,
  buildStrategicInput,
  parseStrategicInsight,
  type StrategicInput,
} from '@/lib/people/companyStrategic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL_ID = 'claude-sonnet-4-5-20250929'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  let body: { slug?: unknown }
  try {
    body = (await req.json()) as { slug?: unknown }
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  const slug = typeof body.slug === 'string' && body.slug.trim().length > 0 ? body.slug.trim() : null
  if (!slug) return errorJson(400, 'slug requerido')

  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, name, slug, organization, org_group, importance_score, last_contact')
    .eq('user_id', userId)
    .limit(1000)
  const people: HubPerson[] = (peopleRows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: row.id as string,
      name: (row.name as string) ?? 'alguien',
      slug: (row.slug as string | null) ?? null,
      organization: (row.organization as string | null) ?? null,
      orgGroup: (row.org_group as string | null) ?? null,
      importance:
        row.importance_score !== null && row.importance_score !== undefined
          ? Number(row.importance_score)
          : undefined,
      lastContact: (row.last_contact as string | null) ?? null,
    }
  })

  const { data: goalRows } = await supabase
    .from('goals')
    .select('title, related_persons, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(200)
  const goals: HubGoal[] = (goalRows ?? []).map((g) => {
    const row = g as Record<string, unknown>
    return {
      title: (row.title as string) ?? '',
      personIds: Array.isArray(row.related_persons) ? (row.related_persons as string[]) : [],
    }
  })

  const hub = buildCompanyHub(slug, people, goals)
  if (!hub.found) return errorJson(404, 'Empresa no encontrada')

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(503, 'IA no disponible', 'Falta configurar ANTHROPIC_API_KEY.')
  }

  const input: StrategicInput = {
    label: hub.label,
    level: hub.level,
    parentLabel: hub.parentGroup?.label ?? null,
    subCompanies: hub.subCompanies.map((c) => c.label),
    people: hub.people.map((p) => ({
      name: p.name,
      organization: p.organization ?? null,
      importance: p.importance,
      lastContact: p.lastContact ?? null,
    })),
    goals: hub.goals.map((g) => g.title),
  }

  try {
    const client = new Anthropic({ maxRetries: 2 })
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 500,
      system: STRATEGIC_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildStrategicInput(input) }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const insight = parseStrategicInsight(block && block.type === 'text' ? block.text : '')
    if (!insight) return errorJson(502, 'No se pudo generar la lectura')
    return NextResponse.json({ insight }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo', m.slice(0, 300))
  }
}

// SIR V2 — POST /api/person-briefing (#16 "Briefing IA" del detail page)
//
// Genera un briefing EFÍMERO (no se persiste) sobre una persona usando el
// LLM sobre sus memorias asociadas + metadata del vínculo.
//
// Body JSON: { person_id: string }
// Response 200: { briefing: string }
//
// Flujo (mismo scaffolding que /api/person-synthesis):
//   1. Auth + person ownership (404 si ajena).
//   2. getMemoriesForPerson (RLS + user_id). 422 si 0 memorias.
//   3. Anthropic Sonnet 4.5. 500 si falta ANTHROPIC_API_KEY.
//   4. Devolver el texto. NO se escribe a DB (briefing es transitorio).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import {
  BRIEFING_SYSTEM_PROMPT,
  buildBriefingInput,
  type BriefingMemory,
  type BriefingSelfStat,
  type BriefingColleague,
} from '@/lib/person-briefing/prompt'
import {
  findColleagues,
  orgJoinKey,
  daysUntilNextBirthday,
  type NetworkPerson,
} from '@/lib/people/professionalNetwork'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const MODEL_ID = 'claude-sonnet-4-5-20250929'
const MAX_MEMORIES = 60
const SELF_STATE_DAYS = 3
const DAY_MS = 86_400_000
const SELF_KINDS = ['mood', 'energy', 'sleep', 'pain'] as const

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const rl = await enforceRateLimit(supabase, authData.user.id, 'generation')
  if (!rl.ok) return rl.response
  const userId = authData.user.id

  let body: { person_id?: unknown }
  try {
    body = (await req.json()) as { person_id?: unknown }
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  // Person ownership + facts para el prompt.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id, name, relationship, category, last_contact, importance_score, energy_impact, organization, org_group')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }

  const memories = await getMemoriesForPerson(supabase, userId, personId, { limit: MAX_MEMORIES })
  // NOTA: NO cortamos acá por falta de memorias. El briefing también puede
  // apoyarse en la RED PROFESIONAL (colegas del mismo grupo) y el estado del
  // usuario. El gate combinado se evalúa más abajo, ya con los colegas cargados.
  const briefingMemories: BriefingMemory[] = memories.map((m) => ({
    type: m.type,
    content: m.content,
    timestamp: m.timestamp,
  }))

  // Estado reciente del USUARIO (no de la persona): promedios de los registros
  // numéricos (mood/energy/sleep/pain) de los últimos días. Sólo calibra el
  // timing/tono de la Oportunidad — el prompt tiene prohibido usarlo como causa.
  // Fail-soft: si la lectura falla, el briefing corre igual sin esta señal.
  let selfStats: BriefingSelfStat[] = []
  try {
    const recentIso = new Date(Date.now() - SELF_STATE_DAYS * DAY_MS).toISOString()
    const { data: logRows } = await supabase
      .from('person_logs')
      .select('kind, value, logged_at')
      .eq('user_id', userId)
      .in('kind', SELF_KINDS as unknown as string[])
      .gte('logged_at', recentIso)
      .limit(200)
    const byKind = new Map<string, { count: number; sum: number }>()
    for (const r of (logRows ?? []) as Array<{ kind: string; value: number }>) {
      const v = Number(r.value)
      if (!Number.isFinite(v)) continue
      const e = byKind.get(r.kind) ?? { count: 0, sum: 0 }
      e.count += 1
      e.sum += v
      byKind.set(r.kind, e)
    }
    selfStats = [...byKind.entries()].map(([kind, e]) => ({
      kind,
      count: e.count,
      avg: e.count ? e.sum / e.count : 0,
    }))
  } catch {
    selfStats = []
  }

  // Red profesional: colegas del mismo empleador/grupo + objetivos activos que
  // los involucran. Inteligencia estratégica para la Oportunidad. Fail-soft.
  let colleagues: BriefingColleague[] = []
  try {
    const targetOrg = {
      organization: (personRow.organization as string | null) ?? null,
      orgGroup: (personRow.org_group as string | null) ?? null,
    }
    if (orgJoinKey(targetOrg) !== '') {
      const { data: peopleRows } = await supabase
        .from('people')
        .select('id, name, organization, org_group, importance_score, birth_date, last_contact')
        .eq('user_id', userId)
        .limit(500)
      // Score del vínculo: último snapshot por persona (person_score_snapshots).
      const scoreByPerson: Record<string, number> = {}
      try {
        const { data: snapRows } = await supabase
          .from('person_score_snapshots')
          .select('person_id, global, date_bucket')
          .eq('user_id', userId)
          .order('date_bucket', { ascending: false })
          .limit(1000)
        for (const sn of (snapRows ?? []) as Array<{ person_id: string; global: number }>) {
          if (sn.person_id && scoreByPerson[sn.person_id] === undefined && typeof sn.global === 'number') {
            scoreByPerson[sn.person_id] = sn.global
          }
        }
      } catch {
        /* fail-soft: sin score igual hay briefing */
      }

      const all: NetworkPerson[] = (peopleRows ?? []).map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row.id as string,
          name: (row.name as string) ?? 'alguien',
          organization: (row.organization as string | null) ?? null,
          orgGroup: (row.org_group as string | null) ?? null,
          importance:
            row.importance_score !== null && row.importance_score !== undefined
              ? Number(row.importance_score)
              : undefined,
          birthDate: (row.birth_date as string | null) ?? null,
          lastContact: (row.last_contact as string | null) ?? null,
          relScore: scoreByPerson[row.id as string],
        }
      })

      // Objetivos activos → mapa personId → título (solo el primero por persona).
      const goalByPerson: Record<string, string> = {}
      const { data: goalRows } = await supabase
        .from('goals')
        .select('title, related_persons, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(100)
      for (const g of (goalRows ?? []) as Array<{ title: string; related_persons: unknown }>) {
        const ids = Array.isArray(g.related_persons) ? (g.related_persons as string[]) : []
        for (const pid of ids) {
          if (typeof pid === 'string' && !goalByPerson[pid]) goalByPerson[pid] = g.title
        }
      }

      const target: NetworkPerson = {
        id: personId,
        name: (personRow.name as string) ?? 'esta persona',
        organization: targetOrg.organization,
        orgGroup: targetOrg.orgGroup,
      }
      const nowForBday = new Date()
      colleagues = findColleagues(target, all, goalByPerson).map((c) => {
        const bday = daysUntilNextBirthday(c.birthDate, nowForBday)
        return {
          name: c.name,
          orgLabel: c.orgGroup ?? c.organization ?? undefined,
          importance: c.importance,
          activeGoalTitle: c.activeGoalTitle,
          birthdayInDays: bday !== null && bday <= 30 ? bday : undefined,
          lastContact: c.lastContact ?? undefined,
          relScore: c.relScore,
        }
      })
    }
  } catch {
    colleagues = []
  }

  // Gate combinado: necesitamos ALGO de material. Memorias O red profesional.
  // (Antes exigía ≥1 memoria; ahora una persona con colegas del mismo grupo
  // —aunque sin memorias propias todavía— igual da un briefing útil.)
  if (briefingMemories.length === 0 && colleagues.length === 0) {
    return errorJson(
      422,
      'Sin material para el briefing',
      'Registrá una interacción con nota, derivá memorias, o asigná su empresa para conectarla a su red.',
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorJson(500, 'ANTHROPIC_API_KEY no configurada en el server')
  }
  const client = new Anthropic({ maxRetries: 2 })

  let text = ''
  try {
    const msg = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 600,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildBriefingInput(
            {
              name: (personRow.name as string) ?? 'esta persona',
              relationship: (personRow.relationship as string) ?? 'desconocido',
              category: (personRow.category as string) ?? 'desconocido',
              lastContact: (personRow.last_contact as string | null) ?? null,
              importanceScore:
                personRow.importance_score !== null && personRow.importance_score !== undefined
                  ? Number(personRow.importance_score)
                  : undefined,
              energyImpact: (personRow.energy_impact as string) ?? undefined,
            },
            briefingMemories,
            selfStats,
            colleagues,
          ),
        },
      ],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
  } catch (e) {
    reportApiError(e)
    const m = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la llamada al modelo de briefing', m.slice(0, 300))
  }
  if (!text) {
    return errorJson(502, 'El modelo devolvió un briefing vacío')
  }

  return NextResponse.json({ briefing: text }, { status: 200 })
}

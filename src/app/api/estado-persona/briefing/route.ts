// SIR V2 — GET/POST /api/estado-persona/briefing
//
// Genera / lee la síntesis IA (Claude Sonnet) del panel "Cómo estás con X".
// GET  ?person_id=…              → devuelve cache si existe y sigue fresco.
// POST { person_id, force? }     → regenera (respeta cache 24h salvo force=true).
//
// El endpoint junta la data ya disponible (moments abiertos, últimos logs,
// person_cycles, memorias recientes), computa un hash de esos inputs, y
// llama a Claude solo si el cache expiró (>24h) o el hash cambió.

import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'
import { buildEstadoInsights, LABEL_HUMAN, type EstadoInsights } from '@/lib/estado-con-persona/insights'
import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry } from '@/lib/person-cycles/types'
import type { Memory } from '@/types'
import { mapMomentRow } from '@/lib/moments/types'
import { mapPersonCycleRow } from '@/lib/person-cycles/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type Supabase = Awaited<ReturnType<typeof createClient>>

interface DataBundle {
  personName: string
  personLogs: PersonLog[]
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
  memories: Memory[]
}

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

async function loadBundle(supabase: Supabase, userId: string, personId: string): Promise<DataBundle | null> {
  const { data: personRow } = await supabase.from('people').select('id, name').eq('user_id', userId).eq('id', personId).single()
  if (!personRow) return null
  const person = personRow as { id: string; name: string }

  // Logs recientes: últimos 60 días alcanza para la síntesis.
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const [logsRes, momentsRes, cyclesRes, memoriesRes] = await Promise.all([
    supabase.from('person_logs').select('id, user_id, person_id, kind, value, note, logged_at, created_at')
      .eq('user_id', userId).eq('person_id', personId).gte('logged_at', cutoff)
      .order('logged_at', { ascending: false }).limit(50),
    supabase.from('relationship_moments').select('id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at')
      .eq('user_id', userId).eq('person_id', personId)
      .order('occurred_on', { ascending: false }).limit(20),
    supabase.from('person_cycles').select('id, person_id, date, phase, confidence, source, note, created_at')
      .eq('user_id', userId).eq('person_id', personId)
      .gte('date', cutoff.slice(0, 10))
      .order('date', { ascending: false }).limit(60),
    supabase.from('memories').select('id, person_id, title, content, type, timestamp:occurred_at, tags, is_private')
      .eq('user_id', userId).eq('person_id', personId)
      .eq('is_private', false)
      .order('occurred_at', { ascending: false }).limit(20),
  ])

  const personLogs = ((logsRes.data ?? []) as Array<{ id: string; user_id: string; person_id: string; kind: string; value: number; note: string | null; logged_at: string; created_at: string }>)
    .map((r) => ({
      id: r.id, userId: r.user_id, personId: r.person_id,
      kind: r.kind as PersonLog['kind'], value: r.value, note: r.note,
      loggedAt: r.logged_at, createdAt: r.created_at,
    }))
  const moments = ((momentsRes.data ?? []) as Parameters<typeof mapMomentRow>[0][]).map(mapMomentRow)
  const personCycles = ((cyclesRes.data ?? []) as Parameters<typeof mapPersonCycleRow>[0][]).map(mapPersonCycleRow)
  const memories = ((memoriesRes.data ?? []) as Array<{ id: string; person_id: string; title: string; content: string; type: string; timestamp: string; tags: string[]; is_private: boolean }>)
    .map((r) => ({
      id: r.id, personId: r.person_id, title: r.title, content: r.content,
      type: r.type, timestamp: r.timestamp, tags: r.tags ?? [],
      importance: 5, emotionalContext: 'neutral',
    })) as unknown as Memory[]

  return { personName: person.name, personLogs, moments, personCycles, memories }
}

function computeInputHash(bundle: DataBundle): string {
  const parts = [
    bundle.personLogs.length,
    bundle.personLogs[0]?.loggedAt ?? '',
    bundle.moments.length,
    bundle.moments.filter((m) => m.status === 'abierto').length,
    bundle.moments[0]?.updatedAt ?? '',
    bundle.personCycles.length,
    bundle.personCycles[0]?.date ?? '',
    bundle.memories.length,
    bundle.memories[0]?.timestamp ?? '',
  ].join('|')
  return createHash('sha1').update(parts).digest('hex')
}

function buildPrompt(bundle: DataBundle, insights: EstadoInsights): string {
  const openMoments = bundle.moments
    .filter((m) => m.status === 'abierto')
    .slice(0, 5)
    .map((m) => `- "${m.title}" (${m.occurredOn}${m.followUpOn ? `, follow-up ${m.followUpOn}` : ''})`)
    .join('\n') || '(ninguno)'
  const recentLogs = bundle.personLogs
    .slice(0, 6)
    .map((l) => `- ${l.loggedAt.slice(0, 10)}: ${l.kind} ${l.value}/5${l.note ? ` — ${l.note}` : ''}`)
    .join('\n') || '(sin registros)'
  const recentCycles = bundle.personCycles
    .slice(0, 8)
    .map((c) => `- ${c.date}: ${c.phase}`)
    .join('\n') || '(sin registros)'
  const recentMemories = bundle.memories
    .slice(0, 5)
    .map((m) => `- ${m.timestamp.slice(0, 10)}: ${m.title}`)
    .join('\n') || '(sin memorias recientes)'

  const labelHuman = LABEL_HUMAN[insights.overallLabel]

  return `Estado actual del vínculo (calculado): ${labelHuman.label} — ${labelHuman.description}
Última interacción: ${insights.lastInteractionAt ? insights.lastInteractionAt.slice(0, 10) : 'nunca'} (tono ${insights.lastInteractionValue ?? '—'}/5).
Tono reciente promedio: ${insights.recentAvg ?? '—'}/5 (delta vs anterior: ${insights.toneDelta ?? '—'}).
Pendientes abiertos: ${insights.openMomentsCount} (${insights.overdueCount} vencidos).

Moments abiertos:
${openMoments}

Últimas interacciones:
${recentLogs}

Ciclo registrado (últimas entries):
${recentCycles}

Memorias recientes:
${recentMemories}`
}

const SYSTEM_PROMPT = `Sos un asistente que ayuda a Aaron a leer el estado de sus vínculos con sus personas cercanas.
Tarea: escribí 3-4 líneas de estado en prosa neutral, en español rioplatense.

Reglas:
- NO diagnosticar ("estás distanciándote") — reportar hechos + patrones observables ("las últimas 3 interacciones estuvieron en 2-3/5, viniendo de 5/5").
- Si hay overdue, mencionalo con la fecha vencida.
- Si hay un patrón que cruza (ej. peleas concentradas en fase 'bleeding'), señalalo con humildad ("coincide que…", "posible correlación entre…").
- Cerrá con UNA sugerencia concreta y proporcional (no dramática): un llamado, un mensaje, resolver un pendiente puntual, tocar un tema específico. No moralizar.
- NO usar bullets — devolvé texto continuo en 3-4 oraciones.
- NO empezar con "Aaron" (él ya sabe que es su vida).

Devolvé SOLO la prosa, sin encabezado, sin "Estado:", nada extra.`

interface AnthropicResp {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function callClaude(apiKey: string, userMessage: string): Promise<{ text: string; usage?: AnthropicResp['usage'] }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as AnthropicResp
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
  if (!text) throw new Error('Claude devolvió respuesta vacía')
  return { text, usage: body.usage }
}

// ─── GET (lee cache) ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) return err(400, 'person_id requerido')

  try {
    const { data } = await supabase
      .from('person_briefings').select('synthesis, input_hash, generated_at, model_used')
      .eq('user_id', auth.user.id).eq('person_id', personId).limit(1).maybeSingle()
    if (!data) return NextResponse.json({ cached: false })
    const row = data as { synthesis: string; input_hash: string; generated_at: string; model_used: string | null }
    const ageMs = Date.now() - new Date(row.generated_at).getTime()
    return NextResponse.json({
      cached: true,
      synthesis: row.synthesis,
      generatedAt: row.generated_at,
      isFresh: ageMs < CACHE_TTL_MS,
      ageHours: Math.round(ageMs / (60 * 60 * 1000)),
    })
  } catch {
    return NextResponse.json({ cached: false })
  }
}

// ─── POST (genera si expiró/force) ───────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return err(501, 'ANTHROPIC_API_KEY no configurado')

  let body: { person_id?: unknown; force?: unknown }
  try { body = (await req.json()) as typeof body } catch { return err(400, 'Body inválido') }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const force = body.force === true
  if (!personId) return err(400, 'person_id requerido')

  const bundle = await loadBundle(supabase, auth.user.id, personId)
  if (!bundle) return err(404, 'Persona no encontrada')

  const insights = buildEstadoInsights({
    personLogs: bundle.personLogs, moments: bundle.moments,
    personCycles: bundle.personCycles, memories: bundle.memories,
    now: new Date(),
  })
  const inputHash = computeInputHash(bundle)

  // Cache check.
  if (!force) {
    const { data: existing } = await supabase
      .from('person_briefings').select('synthesis, input_hash, generated_at')
      .eq('user_id', auth.user.id).eq('person_id', personId).limit(1).maybeSingle()
    if (existing) {
      const row = existing as { synthesis: string; input_hash: string; generated_at: string }
      const ageMs = Date.now() - new Date(row.generated_at).getTime()
      if (ageMs < CACHE_TTL_MS && row.input_hash === inputHash) {
        return NextResponse.json({
          cached: true, synthesis: row.synthesis, generatedAt: row.generated_at,
        })
      }
    }
  }

  const prompt = buildPrompt(bundle, insights)
  let synthesis: string
  try {
    const r = await callClaude(apiKey, prompt)
    synthesis = r.text
    void recordAiUsage(supabase, auth.user.id, 'estado_briefing', MODEL, r.usage)
  } catch (e) {
    return err(502, 'Falló la síntesis con Claude', e instanceof Error ? e.message : String(e))
  }

  const { error: upErr } = await supabase.from('person_briefings').upsert({
    user_id: auth.user.id,
    person_id: personId,
    synthesis,
    input_hash: inputHash,
    generated_at: new Date().toISOString(),
    model_used: MODEL,
  }, { onConflict: 'user_id,person_id' })
  if (upErr) {
    // El síntesis sirvió: devolvemos aunque falle el cache.
    return NextResponse.json({ cached: false, synthesis, generatedAt: new Date().toISOString(), warning: 'no pude cachear' })
  }
  return NextResponse.json({ cached: false, synthesis, generatedAt: new Date().toISOString() })
}

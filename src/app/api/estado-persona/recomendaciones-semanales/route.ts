// SIR V2 — GET/POST/PATCH /api/estado-persona/recomendaciones-semanales
//
// Genera 3-5 recomendaciones concretas para esta semana con una persona.
// Cache por semana calendario (mig 0112). PATCH marca cada recomendación
// como hecha para no perderla.

import { NextResponse, type NextRequest } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'
import { mapMomentRow } from '@/lib/moments/types'
import { mapPersonCycleRow } from '@/lib/person-cycles/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

type Supabase = Awaited<ReturnType<typeof createClient>>

interface Recommendation {
  id: string
  text: string
  deadline?: string
  done: boolean
}

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

/** Lunes de la semana en TZ Lima (aproximado con local). YYYY-MM-DD. */
function weekStartYmd(now = new Date()): string {
  const d = new Date(now)
  const dow = (d.getDay() + 6) % 7 // lunes=0
  d.setDate(d.getDate() - dow)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadContext(supabase: Supabase, userId: string, personId: string) {
  const { data: personRow } = await supabase.from('people').select('id, name').eq('user_id', userId).eq('id', personId).single()
  if (!personRow) return null
  const person = personRow as { id: string; name: string }

  const now = new Date()
  const cutoff30 = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

  const [logsRes, momentsRes, cyclesRes, memoriesRes] = await Promise.all([
    supabase.from('person_logs').select('id, kind, value, note, logged_at')
      .eq('user_id', userId).eq('person_id', personId).gte('logged_at', cutoff30)
      .order('logged_at', { ascending: false }).limit(30),
    supabase.from('relationship_moments').select('id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at')
      .eq('user_id', userId).eq('person_id', personId)
      .order('occurred_on', { ascending: false }).limit(15),
    supabase.from('person_cycles').select('id, person_id, date, phase, confidence, source, note, created_at')
      .eq('user_id', userId).eq('person_id', personId)
      .lte('date', nextWeek)
      .order('date', { ascending: false }).limit(30),
    supabase.from('memories').select('id, title, content, timestamp:occurred_at, is_private')
      .eq('user_id', userId).eq('person_id', personId)
      .eq('is_private', false)
      .order('occurred_at', { ascending: false }).limit(10),
  ])

  return {
    person,
    logs: (logsRes.data ?? []) as Array<{ id: string; kind: string; value: number; note: string | null; logged_at: string }>,
    moments: ((momentsRes.data ?? []) as Parameters<typeof mapMomentRow>[0][]).map(mapMomentRow),
    cycles: ((cyclesRes.data ?? []) as Parameters<typeof mapPersonCycleRow>[0][]).map(mapPersonCycleRow),
    memories: (memoriesRes.data ?? []) as Array<{ id: string; title: string; content: string; timestamp: string }>,
  }
}

function buildPrompt(ctx: NonNullable<Awaited<ReturnType<typeof loadContext>>>): string {
  const openMoments = ctx.moments.filter((m) => m.status === 'abierto').slice(0, 5)
    .map((m) => `- "${m.title}"${m.detail ? ` — ${m.detail.slice(0, 200)}` : ''}${m.followUpOn ? ` (follow-up ${m.followUpOn})` : ''}`).join('\n') || '(ninguno)'
  const recentLogs = ctx.logs.slice(0, 8)
    .map((l) => `- ${l.logged_at.slice(0, 10)}: ${l.kind} ${l.value}/5${l.note ? ` — ${l.note.slice(0, 120)}` : ''}`).join('\n') || '(sin registros)'
  const cycles = ctx.cycles.slice(0, 12).map((c) => `- ${c.date}: ${c.phase}`).join('\n') || '(sin registros)'
  const memories = ctx.memories.slice(0, 5).map((m) => `- ${m.timestamp.slice(0, 10)}: ${m.title}`).join('\n') || '(sin memorias)'

  return `Persona: ${ctx.person.name}
Hoy: ${new Date().toISOString().slice(0, 10)}

Moments abiertos:
${openMoments}

Últimas interacciones:
${recentLogs}

Ciclo (últimos + proyección):
${cycles}

Memorias recientes:
${memories}`
}

const SYSTEM_PROMPT = `Sos un asistente que ayuda a Aaron a llevar mejor sus vínculos. Recibís la data de una persona (moments abiertos, últimas interacciones, ciclo, memorias) y devolvés 3-5 recomendaciones CONCRETAS para esta semana.

Reglas:
- Cada recomendación es UNA acción ejecutable ("Mandale un mensaje sobre X", "Llamala el martes", "Pedile que te cuente cómo va Y"). NO consejos vagos.
- Si hay overdue, la primera recomendación debe ser resolverlo.
- Si el ciclo sugiere un mejor día para conversar temas duros, incluilo ("evitá tocar el tema del examen mientras esté en bleeding; esperá al miércoles").
- Cada recomendación puede tener un deadline sugerido (fecha o "esta semana"/"antes del viernes").
- Máximo 5. Ordenadas de más urgente a menos.
- NO moralizar, no dramatizar, no diagnósticar.

Formato de respuesta: SOLO un array JSON con este shape:
[{"text": "...", "deadline": "YYYY-MM-DD o null"}, ...]

Nada de encabezado, markdown ni prosa fuera del JSON.`

interface AnthropicResp {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function callClaude(apiKey: string, userMessage: string): Promise<{ recs: Array<{ text: string; deadline: string | null }>; usage?: AnthropicResp['usage'] }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as AnthropicResp
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON')
  const parsed = JSON.parse(jsonMatch[0]) as Array<{ text?: string; deadline?: string | null }>
  const recs = parsed
    .map((r) => ({ text: (r.text ?? '').slice(0, 400).trim(), deadline: r.deadline && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : null }))
    .filter((r) => r.text.length > 0)
    .slice(0, 5)
  return { recs, usage: body.usage }
}

// ─── GET ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) return err(400, 'person_id requerido')
  const weekStart = weekStartYmd()

  try {
    const { data } = await supabase.from('weekly_recommendations')
      .select('recommendations, generated_at, week_start')
      .eq('user_id', auth.user.id).eq('person_id', personId).eq('week_start', weekStart)
      .maybeSingle()
    if (!data) return NextResponse.json({ cached: false, weekStart })
    const row = data as { recommendations: unknown; generated_at: string; week_start: string }
    return NextResponse.json({
      cached: true,
      recommendations: row.recommendations as Recommendation[],
      generatedAt: row.generated_at,
      weekStart: row.week_start,
    })
  } catch {
    return NextResponse.json({ cached: false, weekStart })
  }
}

// ─── POST (genera) ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return err(501, 'ANTHROPIC_API_KEY no configurado')

  let body: { person_id?: unknown; force?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const force = body.force === true
  if (!personId) return err(400, 'person_id requerido')

  const ctx = await loadContext(supabase, auth.user.id, personId)
  if (!ctx) return err(404, 'Persona no encontrada')
  const weekStart = weekStartYmd()
  const inputHash = createHash('sha1').update(JSON.stringify({
    m: ctx.moments.length, l: ctx.logs.length, c: ctx.cycles.length,
    firstL: ctx.logs[0]?.logged_at, firstM: ctx.moments[0]?.updatedAt,
  })).digest('hex')

  if (!force) {
    const { data: existing } = await supabase.from('weekly_recommendations')
      .select('recommendations, input_hash, generated_at')
      .eq('user_id', auth.user.id).eq('person_id', personId).eq('week_start', weekStart)
      .maybeSingle()
    if (existing) {
      const row = existing as { recommendations: unknown; input_hash: string; generated_at: string }
      if (row.input_hash === inputHash) {
        return NextResponse.json({ cached: true, recommendations: row.recommendations as Recommendation[], generatedAt: row.generated_at, weekStart })
      }
    }
  }

  const prompt = buildPrompt(ctx)
  let raw: Array<{ text: string; deadline: string | null }>
  try {
    const r = await callClaude(apiKey, prompt)
    raw = r.recs
    void recordAiUsage(supabase, auth.user.id, 'estado_recomendaciones_semanales', MODEL, r.usage)
  }
  catch (e) { return err(502, 'Falló la síntesis con Claude', e instanceof Error ? e.message : String(e)) }
  if (raw.length === 0) return err(422, 'Claude no generó recomendaciones — probá con force:true si insistís')

  const recs: Recommendation[] = raw.map((r) => ({
    id: randomUUID(), text: r.text,
    deadline: r.deadline ?? undefined,
    done: false,
  }))

  const { error: upErr } = await supabase.from('weekly_recommendations').upsert({
    user_id: auth.user.id, person_id: personId, week_start: weekStart,
    recommendations: recs, input_hash: inputHash, generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), model_used: MODEL,
  }, { onConflict: 'user_id,person_id,week_start' })
  if (upErr) return NextResponse.json({ cached: false, recommendations: recs, generatedAt: new Date().toISOString(), weekStart, warning: upErr.message })
  return NextResponse.json({ cached: false, recommendations: recs, generatedAt: new Date().toISOString(), weekStart })
}

// ─── PATCH (marcar done) ─────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { person_id?: unknown; rec_id?: unknown; done?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const recId = typeof body.rec_id === 'string' ? body.rec_id : ''
  const done = body.done === true
  if (!personId || !recId) return err(400, 'person_id y rec_id requeridos')
  const weekStart = weekStartYmd()

  const { data: existing } = await supabase.from('weekly_recommendations')
    .select('id, recommendations')
    .eq('user_id', auth.user.id).eq('person_id', personId).eq('week_start', weekStart)
    .maybeSingle()
  if (!existing) return err(404, 'No hay recomendaciones esta semana')
  const row = existing as { id: string; recommendations: Recommendation[] }
  const next = row.recommendations.map((r) => r.id === recId ? { ...r, done } : r)
  await supabase.from('weekly_recommendations').update({ recommendations: next, updated_at: new Date().toISOString() }).eq('id', row.id)
  return NextResponse.json({ ok: true, recommendations: next })
}

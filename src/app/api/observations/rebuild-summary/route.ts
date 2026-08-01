// SIR V2 — POST /api/observations/rebuild-summary
//
// Re-genera el `data.summary` (+ topics + emotionalStates) de una observation
// whatsapp_chat cuando quedó como fallback ("Conversación de WhatsApp con X.")
// porque en el import original la síntesis LLM falló o no había material
// suficiente. Reusa los `data.rawMessages` que quedaron persistidos.
//
// Caso disparador: la obs "43 mensajes" de Fabiola post-fusión no tenía
// síntesis visible en la Bitácora, solo el texto genérico "Importada del
// export…". Con esto Aaron aprieta un botón y el summary se rearma.
//
// Auth por sesión (RLS por user_id + ownership de la observation).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface RawMsg { ts?: string; author?: string; content?: string; hasSticker?: boolean }
interface ObsData {
  summary?: string
  personName?: string
  rawMessages?: RawMsg[]
  topics?: string[]
  emotionalStates?: { user?: string; otherPerson?: string }
  conversationDate?: string
  source?: string
  [k: string]: unknown
}

/** ¿El summary quedó como template pobre o vacío? */
function isPoorSummary(summary: string | undefined | null): boolean {
  if (!summary) return true
  const s = summary.trim()
  if (s.length < 40) return true
  if (/^Conversaci[oó]n de WhatsApp con /i.test(s)) return true
  if (/^Importad[oa] del export/i.test(s)) return true
  return false
}

interface AnthropicResp {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function reGenSummary(apiKey: string, personName: string, rawMessages: RawMsg[]): Promise<{ summary: string; topics: string[]; emotionalUser: string | null; emotionalOther: string | null; usage?: AnthropicResp['usage'] }> {
  const lines = rawMessages
    .filter((m) => (m.content ?? '').trim().length > 0)
    .slice(0, 200)
    .map((m) => `[${m.ts ?? '?'}] ${m.author ?? '?'}: ${(m.content ?? '').replace(/\n+/g, ' ').slice(0, 300)}`)
    .join('\n')

  const system = `Eres un asistente que resume conversaciones de WhatsApp. Vas a recibir un extracto de mensajes intercambiados entre Aaron y ${personName}. Tu tarea es:
1. Escribir un summary de 3-5 líneas en prosa neutra, en español del Perú (peruano neutro, de Lima) — qué temas se hablaron, tono general, si hubo tensión, si algo quedó pendiente. NO uses frases genéricas del tipo "Conversación de WhatsApp con X".
2. Listar entre 3 y 8 topics cortos (2-4 palabras cada uno).
3. Estimar el estado emocional del USER (Aaron) y de la OTRA persona (${personName}), en 1-3 palabras cada uno. Null si no queda claro.
Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

Devuelve SOLO un JSON con este shape:
{"summary": "...", "topics": ["...", "..."], "emotionalUser": "...", "emotionalOther": "..."}`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `Mensajes (formato [timestamp] autor: contenido):\n${lines}` }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as AnthropicResp
  const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude no devolvió JSON parseable')
  const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; topics?: string[]; emotionalUser?: string | null; emotionalOther?: string | null }
  return {
    summary: (parsed.summary ?? '').trim() || `Conversación con ${personName}.`,
    topics: Array.isArray(parsed.topics) ? parsed.topics.map((t) => String(t).slice(0, 60)).filter(Boolean).slice(0, 8) : [],
    emotionalUser: typeof parsed.emotionalUser === 'string' ? parsed.emotionalUser.slice(0, 40) : null,
    emotionalOther: typeof parsed.emotionalOther === 'string' ? parsed.emotionalOther.slice(0, 40) : null,
    usage: body.usage,
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return err(501, 'ANTHROPIC_API_KEY no configurado')

  let body: { observation_id?: unknown; force?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const observationId = typeof body.observation_id === 'string' ? body.observation_id : ''
  const force = body.force === true
  if (!observationId) return err(400, 'observation_id requerido')

  const { data: obs, error: fetchErr } = await supabase
    .from('observations')
    .select('id, user_id, person_id, capture_type, data')
    .eq('user_id', auth.user.id)
    .eq('id', observationId)
    .single()
  if (fetchErr || !obs) return err(404, 'Observation no encontrada')
  const row = obs as { id: string; user_id: string; person_id: string | null; capture_type: string; data: ObsData | null }
  if (row.capture_type !== 'whatsapp_chat') return err(400, 'Solo aplicable a observations whatsapp_chat')
  const data = row.data ?? {}
  if (!force && !isPoorSummary(data.summary)) {
    return NextResponse.json({ skipped: true, reason: 'summary ya parece bueno; pasa force:true si quieres regenerarlo igual' })
  }
  const rawMessages = Array.isArray(data.rawMessages) ? data.rawMessages : []
  if (rawMessages.length === 0) return err(422, 'Esta observation no tiene rawMessages persistidos — no puedo reconstruir')

  // Person name: preferí data.personName; si no, lookup en people.
  let personName = typeof data.personName === 'string' ? data.personName : ''
  if (!personName && row.person_id) {
    const { data: p } = await supabase.from('people').select('name').eq('user_id', auth.user.id).eq('id', row.person_id).single()
    personName = (p as { name?: string } | null)?.name ?? 'esta persona'
  }
  personName = personName || 'esta persona'

  let regen: Awaited<ReturnType<typeof reGenSummary>>
  try {
    regen = await reGenSummary(apiKey, personName, rawMessages)
    void recordAiUsage(supabase, auth.user.id, 'observations_rebuild_summary', MODEL, regen.usage)
  } catch (e) {
    return err(502, 'Falló la re-síntesis con Claude', e instanceof Error ? e.message : String(e))
  }

  const nextData: ObsData = {
    ...data,
    summary: regen.summary,
    topics: regen.topics,
    emotionalStates: {
      user: regen.emotionalUser ?? undefined,
      otherPerson: regen.emotionalOther ?? undefined,
    },
    // Marcador de auditoría — cuándo se regeneró y con qué versión de prompt.
    resummaryAt: new Date().toISOString(),
  }
  const { error: updErr } = await supabase
    .from('observations')
    .update({ data: nextData })
    .eq('user_id', auth.user.id)
    .eq('id', observationId)
  if (updErr) return err(500, 'No pude guardar el summary', updErr.message)

  return NextResponse.json({
    ok: true,
    summary: regen.summary,
    topics: regen.topics,
    emotionalStates: { user: regen.emotionalUser, otherPerson: regen.emotionalOther },
  })
}

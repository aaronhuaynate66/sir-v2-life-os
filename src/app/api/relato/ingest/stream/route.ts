// SIR V2 — POST /api/relato/ingest/stream (SSE)
//
// Versión streaming del ingest: en vez de esperar el response completo de
// Claude, emite eventos SSE a medida que Anthropic devuelve tokens. Los
// tool_use vienen fragmentados (partial_json por chunk); acá los buffeamos
// hasta content_block_stop, parseamos JSON, validamos con parseToolUse, y
// emitimos como evento 'tool'.
//
// Diseñado para el paso "Ver plan" del chat — la UI puede ir agregando items
// al plan a medida que llegan. Percepción de latencia mucho menor en relatos
// grandes.
//
// El endpoint NO ejecuta (apply queda para /api/relato/apply strict). Solo
// devuelve el plan.

import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'
import { INGEST_TOOLS, parseToolUse, type IngestAction } from '@/lib/relato-ingest/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

interface Body { text?: unknown }

async function loadPeopleNames(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string[]> {
  const { data } = await supabase.from('people').select('name').eq('user_id', userId).limit(500)
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name).filter(Boolean)
}

function buildSystemPrompt(peopleNames: string[]): string {
  const today = new Date().toISOString().slice(0, 10)
  return `Sos un asistente que estructura relatos en prosa de Aaron en acciones para su Life OS (SIR).

Fecha de hoy: ${today} (America/Lima, UTC-05:00).

Reglas obligatorias:
1. Cada acción debe traer NOMBRE COMPLETO de la persona (nombre + al menos un apellido). Si Aaron menciona solo el primer nombre, buscá coincidencia inequívoca en la lista de abajo; si hay ambigüedad o no está, llamá "flag_ambiguo" y NO crees nada para esa persona.
2. Contexto Aaron: hay DOS Diana en su red.
   - Diana Díaz → NOVIA. Todo lo afectivo va a ella.
   - Diana Cencaro → COMPAÑERA DE TRABAJO en HNG. Todo lo laboral va a ella.
   Si el relato es afectivo y dice "Diana" → Diana Díaz.
3. Cuando Aaron introduce a alguien NUEVO en el relato (nombre + apellido, sin match en la lista), usá "crear_persona" para agregarla ANTES de crear moments/logs con ella.
4. Cuando Aaron enuncia una META u OBJETIVO futuro, usá "crear_objetivo".
5. Un relato semanal se descompone en:
   - Un "crear_moment" por CADA episodio con fecha concreta y valor emocional.
   - Un "crear_person_log" (kind="interaction") por cada día que hubo contacto.
   - Un solo "crear_nota_manual" opcional al final con resumen general.
   - Un "registrar_ciclo" por CADA día que Aaron mencione la fase menstrual.
6. Fechas: siempre YYYY-MM-DD. Timestamps siempre con TZ.

Personas ya en la red:
${peopleNames.length > 0 ? peopleNames.slice(0, 200).map((n) => `- ${n}`).join('\n') : '(vacía)'}
`
}

/** SSE event serializer. */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

interface StreamEventContentBlockStart {
  type: 'content_block_start'
  index: number
  content_block: { type: 'tool_use' | 'text'; id?: string; name?: string; input?: Record<string, unknown> } | { type: 'text'; text: string }
}
interface StreamEventContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string }
}
interface StreamEventContentBlockStop { type: 'content_block_stop'; index: number }
interface StreamEventMessageStop { type: 'message_stop' }
type StreamEvent = StreamEventContentBlockStart | StreamEventContentBlockDelta | StreamEventContentBlockStop | StreamEventMessageStop | { type: string; [k: string]: unknown }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 })
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurado' }), { status: 501 })

  let body: Body
  try { body = (await req.json()) as Body } catch { return new Response(JSON.stringify({ error: 'Body inválido' }), { status: 400 }) }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return new Response(JSON.stringify({ error: 'text requerido' }), { status: 400 })
  if (text.length > 8000) return new Response(JSON.stringify({ error: 'text demasiado largo' }), { status: 400 })

  const peopleNames = await loadPeopleNames(supabase, auth.user.id)
  const system = buildSystemPrompt(peopleNames)

  // Llamada a Anthropic con stream=true.
  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 4096, system,
      messages: [{ role: 'user', content: text }],
      tools: INGEST_TOOLS,
      tool_choice: { type: 'auto' },
      stream: true,
    }),
  })
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text()
    return new Response(sseEvent('error', { error: `Anthropic ${upstream.status}: ${errText.slice(0, 200)}` }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const userId = auth.user.id
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      // Buffer por bloque (index → { name, jsonAcc, text }).
      const blocks = new Map<number, { name?: string; jsonAcc: string; text: string; type: 'tool_use' | 'text' | null }>()
      let toolIndex = 0
      // Acumulador de usage; en streaming Anthropic manda input_tokens en
      // message_start y output_tokens en message_delta.
      let inputTokens = 0
      let outputTokens = 0
      const reader = upstream.body!.getReader()
      let buf = ''

      function push(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(event, data)))
      }

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // Anthropic manda SSE con "event: <name>\ndata: <json>\n\n"
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            const lines = part.split('\n')
            let dataLine = ''
            for (const l of lines) if (l.startsWith('data:')) dataLine = l.slice(5).trim()
            if (!dataLine) continue
            let parsed: StreamEvent
            try { parsed = JSON.parse(dataLine) as StreamEvent } catch { continue }
            if (parsed.type === 'content_block_start') {
              const e = parsed as StreamEventContentBlockStart
              const cb = e.content_block
              const type = cb.type === 'tool_use' ? 'tool_use' : 'text'
              const name = 'name' in cb ? cb.name : undefined
              blocks.set(e.index, { name, jsonAcc: '', text: '', type })
            } else if (parsed.type === 'content_block_delta') {
              const e = parsed as StreamEventContentBlockDelta
              const b = blocks.get(e.index); if (!b) continue
              if (e.delta.type === 'input_json_delta') b.jsonAcc += e.delta.partial_json
              else if (e.delta.type === 'text_delta') {
                b.text += e.delta.text
                push('text', { chunk: e.delta.text })
              }
            } else if (parsed.type === 'content_block_stop') {
              const e = parsed as StreamEventContentBlockStop
              const b = blocks.get(e.index); if (!b) continue
              if (b.type === 'tool_use' && b.name) {
                let input: Record<string, unknown> = {}
                try { input = b.jsonAcc ? (JSON.parse(b.jsonAcc) as Record<string, unknown>) : {} } catch { input = {} }
                const action = parseToolUse({ name: b.name, input })
                if (action) {
                  const ambiguous = action.kind === 'flag_ambiguo'
                  push(ambiguous ? 'ambiguous' : 'tool', { index: toolIndex++, action })
                } else {
                  push('invalid', { name: b.name, rawInput: input })
                }
              }
              blocks.delete(e.index)
            } else if (parsed.type === 'message_start') {
              // Anthropic manda { message: { usage: { input_tokens, output_tokens } } }
              const p = parsed as { message?: { usage?: { input_tokens?: number; output_tokens?: number } } }
              inputTokens = p.message?.usage?.input_tokens ?? 0
              outputTokens = p.message?.usage?.output_tokens ?? 0
            } else if (parsed.type === 'message_delta') {
              // { usage: { output_tokens } } al final.
              const p = parsed as { usage?: { output_tokens?: number } }
              if (p.usage?.output_tokens != null) outputTokens = p.usage.output_tokens
            } else if (parsed.type === 'message_stop') {
              push('done', {})
            }
          }
        }
        push('done', {}) // por si upstream cerró sin message_stop
      } catch (e) {
        push('error', { error: e instanceof Error ? e.message : String(e) })
      } finally {
        // Registrar consumo best-effort.
        if (inputTokens > 0 || outputTokens > 0) {
          void recordAiUsage(supabase, userId, 'relato_ingest_stream', MODEL, {
            input_tokens: inputTokens, output_tokens: outputTokens,
          })
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

// Silenciar unused-var: type IngestAction se re-exporta implícitamente por
// el parseToolUse import; el tsc lo ve.
type _UsedByParseToolUse = IngestAction

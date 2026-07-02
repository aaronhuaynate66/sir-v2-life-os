// SIR V2 — POST /api/relato/ingest
//
// Recibe un relato en prosa de Aaron. Llama a Claude Sonnet con tools que
// estructuran el relato en acciones (moments, logs, notas, cumples). Devuelve
// el PLAN. Si el body trae `apply: true`, además EJECUTA cada acción contra
// Supabase con la sesión de Aaron.
//
// Reglas duras:
//   - Auth por sesión (cookie). Sin bearer — este endpoint no acepta tokens.
//     El módulo de tokens (Fase 1) queda disponible para OTROS casos.
//   - Nombre completo obligatorio en cada tool. Si Claude no puede
//     desambiguar, debe llamar `flag_ambiguo` (que no crea nada, solo pide
//     aclaración).
//   - Contexto de "las dos Dianas" incluido en el system prompt para evitar
//     el bug del backfill anterior.
//   - Sin escritura silenciosa: apply=false por default → dry-run que Aaron
//     revisa en el UI antes de confirmar.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { INGEST_TOOLS, parseToolUse, type IngestAction } from '@/lib/relato-ingest/tools'
import { executeActions, type ExecResult } from '@/lib/relato-ingest/execute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

interface Body { text?: unknown; apply?: unknown }

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

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
   - Diana Díaz → NOVIA. Todo lo afectivo (peleas, encuentros, hoteles, ubicación, sexo, exámenes médicos que él paga, aniversarios) va a ella.
   - Diana Cencaro → COMPAÑERA DE TRABAJO en HNG. Todo lo laboral (proyectos, reuniones, capacitaciones, chats WhatsApp de oficina) va a ella.
   Si el relato es afectivo y dice "Diana" → Diana Díaz.
3. Cuando Aaron introduce a alguien NUEVO en el relato (nombre + apellido, sin match en la lista), usá "crear_persona" para agregarla ANTES de crear moments/logs con ella.
4. Cuando Aaron enuncia una META u OBJETIVO futuro ("quiero llegar a X", "mudarme antes de Y", "correr una maratón"), usá "crear_objetivo". Para hechos ya cerrados usá crear_moment.
5. Un relato semanal se descompone en:
   - Un "crear_moment" por CADA episodio con fecha concreta y valor emocional. Status "abierto" si algo queda pendiente + follow_up_on si hay fecha explícita. Status "resuelto" si cerró bien en el mismo día.
   - Un "crear_person_log" (kind="interaction") por cada día que hubo contacto, con value 1..5 según cómo se sintió Aaron.
   - Un solo "crear_nota_manual" opcional al final con resumen general de la semana. NO dupliques info de los moments.
   - Un "registrar_ciclo" por CADA día que Aaron mencione la fase menstrual de una persona ("estaba con la regla", "tenía un resto de regla", "sangrando", "PMS"). Un día = una acción. Phase "bleeding" para sangrado, "pms" para síntomas premenstruales. Confidence "medium" por default; "high" si Aaron confirma que ella lo dijo.
4. Fechas: siempre YYYY-MM-DD. Timestamps siempre con TZ (-05:00 para Lima). Si Aaron dice "viernes 26", usá el año actual.
5. Efectuá ediciones pequeñas y precisas. NO inventes detalles que Aaron no dio.

Personas ya en la red (para desambiguar):
${peopleNames.length > 0 ? peopleNames.slice(0, 200).map((n) => `- ${n}`).join('\n') : '(vacía)'}
`
}

interface AnthropicResponse {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: Record<string, unknown>; id: string }
  >
  stop_reason?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return err(501, 'ANTHROPIC_API_KEY no configurado en el servidor')

  let body: Body
  try { body = (await req.json()) as Body } catch { return err(400, 'Body inválido') }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return err(400, 'text requerido')
  if (text.length > 8000) return err(400, 'text demasiado largo (máx 8000 chars)')
  const shouldApply = body.apply === true

  // Cargamos la red de Aaron para inyectar como contexto de desambiguación.
  const peopleNames = await loadPeopleNames(supabase, userId)
  const system = buildSystemPrompt(peopleNames)

  // Llamada a Anthropic (Sonnet con tool_use).
  let anthro: AnthropicResponse
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: text }],
        tools: INGEST_TOOLS,
        tool_choice: { type: 'auto' },
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return err(502, 'Falló Anthropic API', errText.slice(0, 300))
    }
    anthro = (await res.json()) as AnthropicResponse
  } catch (e) {
    return err(502, 'Falló Anthropic API', e instanceof Error ? e.message : String(e))
  }

  // Parsear tool_uses del response.
  const parsed: IngestAction[] = []
  const invalid: Array<{ name: string; raw: unknown }> = []
  const modelText: string[] = []
  for (const block of anthro.content ?? []) {
    if (block.type === 'text') { if (block.text.trim()) modelText.push(block.text.trim()); continue }
    if (block.type !== 'tool_use') continue
    const action = parseToolUse({ name: block.name, input: block.input ?? {} })
    if (action) parsed.push(action)
    else invalid.push({ name: block.name, raw: block.input })
  }

  const ambiguous = parsed.filter((a) => a.kind === 'flag_ambiguo')
  const actionable = parsed.filter((a) => a.kind !== 'flag_ambiguo')

  const response: {
    plan: IngestAction[]
    ambiguous: IngestAction[]
    modelText: string[]
    invalid: Array<{ name: string; raw: unknown }>
    executed?: ExecResult[]
  } = {
    plan: actionable,
    ambiguous,
    modelText,
    invalid,
  }

  if (shouldApply && actionable.length > 0) {
    response.executed = await executeActions(supabase, userId, actionable)
  }

  return NextResponse.json(response, { status: 200 })
}

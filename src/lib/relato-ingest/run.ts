// SIR V2 — Núcleo de ingesta de relato (compartido por la ruta y el canal WhatsApp).
//
// Toma un texto en prosa, llama a Claude Sonnet con las tools de ingesta,
// estructura el relato en acciones y (si apply) las ejecuta. Antes vivía inline
// en /api/relato/ingest; se extrajo para reusarlo desde el webhook de WhatsApp
// (I/O externo, misma inteligencia server-side). PURO respecto de HTTP: recibe
// el cliente Supabase y el userId ya resueltos.

import type { SupabaseClient } from '@supabase/supabase-js'
import { INGEST_TOOLS, parseToolUse, type IngestAction } from './tools'
import { executeActions, type ExecResult } from './execute'
import { recordAiUsage } from '@/lib/ai/usage'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const RELATO_MODEL = 'claude-sonnet-4-5-20250929'

export interface RelatoIngestResult {
  plan: IngestAction[]
  ambiguous: IngestAction[]
  modelText: string[]
  invalid: Array<{ name: string; raw: unknown }>
  executed?: ExecResult[]
}

interface AnthropicResponse {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; input: Record<string, unknown>; id: string }
  >
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

async function loadPeopleNames(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('people').select('name').eq('user_id', userId).limit(500)
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name).filter(Boolean)
}

export function buildRelatoSystemPrompt(peopleNames: string[], nowIso: string): string {
  const today = nowIso.slice(0, 10)
  return `Eres un asistente que estructura relatos en prosa de Aaron en acciones para su Life OS (SIR).

Fecha de hoy: ${today} (America/Lima, UTC-05:00).

Reglas obligatorias:
1. Cada acción debe traer NOMBRE COMPLETO de la persona (nombre + al menos un apellido). Si Aaron menciona solo el primer nombre, busca coincidencia inequívoca en la lista de abajo; si hay ambigüedad o no está, llama "flag_ambiguo" y NO crees nada para esa persona.
2. Contexto Aaron: hay DOS Diana en su red.
   - Diana Díaz → NOVIA. Todo lo afectivo (peleas, encuentros, hoteles, ubicación, sexo, exámenes médicos que él paga, aniversarios) va a ella.
   - Diana Cencaro → COMPAÑERA DE TRABAJO en HNG. Todo lo laboral (proyectos, reuniones, capacitaciones, chats WhatsApp de oficina) va a ella.
   Si el relato es afectivo y dice "Diana" → Diana Díaz.
3. Cuando Aaron introduce a alguien NUEVO en el relato (nombre + apellido, sin match en la lista), usa "crear_persona" para agregarla ANTES de crear moments/logs con ella.
4. Cuando Aaron enuncia una META u OBJETIVO futuro ("quiero llegar a X", "mudarme antes de Y", "correr una maratón"), usa "crear_objetivo". Para hechos ya cerrados usa crear_moment.
4b. Cuando Aaron dice "recuérdame en X días" / "avísame el viernes" / "en 2 horas" / "mañana a las 15" → usa "crear_recordatorio". Calcula el due_at ISO con TZ Lima (-05:00). Sin hora específica en Lima usa 09:00. Si menciona una persona, incluye person_full_name.
4c. Cuando Aaron enuncia algo DURABLE Y GENERAL SOBRE SÍ MISMO (una preferencia estable, un patrón propio, un principio/prioridad del período, un hecho estable) → usa "registrar_aprendizaje". Ej: "prefiero findes largos para viajar", "cuando duermo poco me irrito", "este año el Mundial va antes que todo". NO para hechos de una sola vez (eso es crear_moment) ni para cosas de otra persona. Es memoria que vas a aplicar al aconsejar. Fraséalo corto y en tercera persona.
5. Un relato semanal se descompone en:
   - Un "crear_moment" por CADA episodio con fecha concreta y valor emocional. Status "abierto" si algo queda pendiente + follow_up_on si hay fecha explícita. Status "resuelto" si cerró bien en el mismo día.
   - Un "crear_person_log" (kind="interaction") por cada día que hubo contacto, con value 1..5 según cómo se sintió Aaron. DISCRIMINA el tono, NO metas 3 por defecto: lee la carga emocional de lo que contó (pelea o "me molestó" → 1-2, día lindo o "buena charla" → 4-5, contacto rutinario sin carga → 3). El valor de esta feature depende de que el tono VARÍE, no de que sea siempre neutro.
   - Un solo "crear_nota_manual" opcional al final con resumen general de la semana. NO dupliques info de los moments.
   - Un "registrar_ciclo" por CADA día que Aaron mencione la fase menstrual de una persona ("estaba con la regla", "tenía un resto de regla", "sangrando", "PMS"). Un día = una acción. Phase "bleeding" para sangrado, "pms" para síntomas premenstruales. Confidence "medium" por default; "high" si Aaron confirma que ella lo dijo.
4. Fechas: siempre YYYY-MM-DD. Timestamps siempre con TZ (-05:00 para Lima). Si Aaron dice "viernes 26", usa el año actual.
5. Efectúa ediciones pequeñas y precisas. NO inventes detalles que Aaron no dio.

Personas ya en la red (para desambiguar):
${peopleNames.length > 0 ? peopleNames.slice(0, 200).map((n) => `- ${n}`).join('\n') : '(vacía)'}
`
}

/**
 * Ejecuta la ingesta de un relato. `apiKey` = ANTHROPIC_API_KEY (el caller la
 * valida). `nowIso` inyectable para tests. Lanza Error con `.status` en fallas de
 * red/API para que el caller lo mapee a un HTTP code.
 */
export async function runRelatoIngest(opts: {
  supabase: SupabaseClient
  userId: string
  text: string
  apply: boolean
  apiKey: string
  nowIso?: string
}): Promise<RelatoIngestResult> {
  const { supabase, userId, text, apply, apiKey } = opts
  const nowIso = opts.nowIso ?? new Date().toISOString()

  const peopleNames = await loadPeopleNames(supabase, userId)
  const system = buildRelatoSystemPrompt(peopleNames, nowIso)

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: RELATO_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: text }],
      tools: INGEST_TOOLS,
      tool_choice: { type: 'auto' },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    const e = new Error(`Anthropic API ${res.status}: ${errText.slice(0, 300)}`) as Error & { status?: number }
    e.status = 502
    throw e
  }
  const anthro = (await res.json()) as AnthropicResponse
  void recordAiUsage(supabase, userId, 'relato_ingest', RELATO_MODEL, anthro.usage)

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

  const result: RelatoIngestResult = { plan: actionable, ambiguous, modelText, invalid }
  if (apply && actionable.length > 0) {
    result.executed = await executeActions(supabase, userId, actionable)
  }
  return result
}

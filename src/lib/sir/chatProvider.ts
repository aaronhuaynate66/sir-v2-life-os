// SIR V2 — Capa de proveedor del chat (#86). Una sola función runSirChat que
// habla con Anthropic (SDK, tool_use) o con OpenRouter (fetch OpenAI-compatible,
// function calling). Devuelve {answer, tool} normalizado, así la ruta no
// conoce el proveedor. Las keys vienen de env (nunca de la base).

import Anthropic from '@anthropic-ai/sdk'
import { SIR_ACTION_TOOLS } from './actions'
import type { SirModelInfo } from './model'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RunSirChatArgs {
  model: SirModelInfo
  system: string
  history: ChatTurn[]
  /** Mensaje final del usuario (el contexto aterrizado + la pregunta). */
  userContent: string
  anthropicKey?: string
  openrouterKey?: string
}

export interface RunSirChatResult {
  answer: string
  tool: { name: string; input: unknown } | null
}

/** Convierte las tools (input_schema) al formato function-calling de OpenAI. */
export function toOpenAITools(
  tools: ReadonlyArray<{ name: string; description: string; input_schema: unknown }>,
): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))
}

/** Extrae la primera tool-call de un message OpenAI (o null). Parsea arguments. */
export function parseOpenAIToolCall(message: unknown): { name: string; input: unknown } | null {
  const m = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>
  const calls = m.tool_calls
  if (!Array.isArray(calls) || calls.length === 0) return null
  const fn = (calls[0] as Record<string, unknown>)?.function as Record<string, unknown> | undefined
  if (!fn || typeof fn.name !== 'string') return null
  let input: unknown = {}
  try { input = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments ?? {}) } catch { input = {} }
  return { name: fn.name, input }
}

/** Texto plano de un message OpenAI (content puede ser string o null). */
export function openAIText(message: unknown): string {
  const m = (message && typeof message === 'object' ? message : {}) as Record<string, unknown>
  return typeof m.content === 'string' ? m.content.trim() : ''
}

async function runAnthropic(args: RunSirChatArgs): Promise<RunSirChatResult> {
  const anthropic = new Anthropic({ apiKey: args.anthropicKey })
  const msg = await anthropic.messages.create({
    model: args.model.modelId,
    max_tokens: 900,
    system: args.system,
    tools: SIR_ACTION_TOOLS as unknown as Anthropic.Tool[],
    messages: [
      ...args.history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: args.userContent },
    ],
  })
  const answer = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  const tu = msg.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
  return { answer, tool: tu ? { name: tu.name, input: tu.input } : null }
}

async function runOpenRouter(args: RunSirChatArgs): Promise<RunSirChatResult> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.openrouterKey}`,
      'X-Title': 'SIR V2',
    },
    body: JSON.stringify({
      model: args.model.modelId,
      max_tokens: 900,
      messages: [
        { role: 'system', content: args.system },
        ...args.history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: args.userContent },
      ],
      tools: toOpenAITools(SIR_ACTION_TOOLS),
      tool_choice: 'auto',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: unknown }> }
  const message = data.choices?.[0]?.message
  return { answer: openAIText(message), tool: parseOpenAIToolCall(message) }
}

/** Ejecuta el turno de chat con el proveedor del modelo. */
export async function runSirChat(args: RunSirChatArgs): Promise<RunSirChatResult> {
  return args.model.provider === 'openrouter' ? runOpenRouter(args) : runAnthropic(args)
}

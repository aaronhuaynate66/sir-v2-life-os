// SIR V2 — Adaptador Anthropic nativo para la capa llm/.

import Anthropic from '@anthropic-ai/sdk'
import type { LlmMessage, LlmRequest, LlmUsage } from '../types'

/** Traduce el `content` de un LlmMessage al formato nativo de Anthropic.
 *  String → string; bloques → text/image nativos. */
function toAnthropicContent(content: LlmMessage['content']): Anthropic.MessageParam['content'] {
  if (typeof content === 'string') return content
  return content.map((b) =>
    b.type === 'image'
      ? { type: 'image' as const, source: { type: 'base64' as const, media_type: b.source.mediaType, data: b.source.data } }
      : { type: 'text' as const, text: b.text },
  )
}

export async function callAnthropic(
  model: string,
  req: LlmRequest,
): Promise<{ text: string; usage: LlmUsage }> {
  const client = new Anthropic({ maxRetries: 1 })
  const msg = await client.messages.create({
    model,
    max_tokens: req.maxTokens ?? 1024,
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
  })
  const block = msg.content.find((b) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text.trim() : ''
  return {
    text,
    usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 },
  }
}

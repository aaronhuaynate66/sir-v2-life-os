// SIR V2 — Adaptador Anthropic nativo para la capa llm/.

import Anthropic from '@anthropic-ai/sdk'
import type { LlmRequest, LlmUsage } from '../types'

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
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  })
  const block = msg.content.find((b) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text.trim() : ''
  return {
    text,
    usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 },
  }
}

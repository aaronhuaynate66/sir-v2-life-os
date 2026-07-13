// SIR V2 — Adaptador OpenAI-compatible para la capa llm/.
//
// Un solo código cubre DeepSeek, Qwen (DashScope), GLM (Zhipu), Kimi (Moonshot),
// OpenRouter y cualquier proveedor con /chat/completions estilo OpenAI. La
// diferencia entre proveedores vive en el registry (baseURL + envKey + modelId).

import type { LlmRequest, LlmUsage } from '../types'
import type { ProviderConfig } from '../registry'

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

export async function callOpenAiCompat(
  cfg: ProviderConfig,
  model: string,
  req: LlmRequest,
): Promise<{ text: string; usage: LlmUsage }> {
  const key = process.env[cfg.envKey]
  if (!key) throw new Error(`Falta ${cfg.envKey} para ${cfg.provider}`)
  const messages = [
    ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ]
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
    }),
  })
  const data = (await res.json().catch(() => null)) as ChatCompletion | null
  if (!res.ok || !data) {
    throw new Error(`${cfg.provider} ${res.status}: ${data?.error?.message ?? res.statusText}`)
  }
  const text = (data.choices?.[0]?.message?.content ?? '').trim()
  return {
    text,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  }
}

// SIR V2 — complete(): API pública de la capa llm/ (ADR 0011).
//
// Reemplaza el `new Anthropic()/messages.create` de cada ruta. Elige la chain
// (router) e intenta cada proveedor con fallback ante error/rate-limit. Registra
// tokens+costo por (task, provider) en ai_usage si se pasa supabase+userId.

import type { LlmRequest, LlmResponse } from './types'
import { LlmError } from './types'
import { PROVIDERS, availableProviders, estimateCost } from './registry'
import { planChain, type PlannedCall } from './router'
import { callAnthropic } from './providers/anthropic'
import { callOpenAiCompat } from './providers/openaiCompat'
import { recordAiUsage } from '@/lib/ai/usage'

type Supabase = Parameters<typeof recordAiUsage>[0]

async function dispatch(call: PlannedCall, req: LlmRequest): Promise<{ text: string; usage: LlmResponse['usage'] }> {
  if (call.kind === 'anthropic') return callAnthropic(call.model, req)
  return callOpenAiCompat(PROVIDERS[call.provider], call.model, req)
}

export interface CompleteOpts {
  supabase?: Supabase
  userId?: string
}

/**
 * Completa una request contra el mejor proveedor disponible, con fallback.
 * Lanza LlmError si no hay proveedor configurado o si todos fallan.
 */
export async function complete(req: LlmRequest, opts: CompleteOpts = {}): Promise<LlmResponse> {
  const chain = planChain(req, availableProviders())
  if (chain.length === 0) {
    throw new LlmError('no_provider', 'No hay proveedor LLM configurado — falta la API key en el entorno.')
  }

  let lastErr: unknown = null
  for (let i = 0; i < chain.length; i++) {
    const call = chain[i]
    try {
      const { text, usage } = await dispatch(call, req)
      if (!text) throw new Error(`${call.provider} devolvió texto vacío`)
      // Telemetría best-effort (no rompe la respuesta).
      if (opts.supabase && opts.userId) {
        void recordAiUsage(opts.supabase, opts.userId, req.task, `${call.provider}:${call.model}`, {
          input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
        })
      }
      return {
        text,
        provider: call.provider,
        model: call.model,
        usage,
        costUsd: estimateCost(call.provider, usage.inputTokens, usage.outputTokens),
        ...(i > 0 ? { fellBackTo: call.provider } : {}),
      }
    } catch (e) {
      lastErr = e // probamos el siguiente proveedor de la chain
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr)
  throw new LlmError('all_failed', `Todos los proveedores fallaron: ${detail}`.slice(0, 300))
}

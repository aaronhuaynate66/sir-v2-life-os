// SIR V2 — Capa LLM multi-proveedor (ADR 0011). Tipos compartidos.
//
// Reemplaza los `new Anthropic()` directos regados en ~30 rutas por una
// interfaz única `complete()` con router + fallback. Un adaptador OpenAI-compat
// cubre la mayoría de proveedores (DeepSeek/Qwen/GLM/Kimi/OpenRouter) y otro
// nativo cubre Anthropic.

export type LlmRole = 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

/** Sensibilidad del contenido. Por ADR 0011 NO excluye proveedores (Aaron
 *  priorizó costo), pero se conserva para ordenar el fallback, telemetría y
 *  poder revertir la política sin re-cablear. */
export type Sensitivity = 'none' | 'self' | 'third_party'

export type LlmProvider = 'anthropic' | 'deepseek' | 'qwen' | 'zhipu' | 'moonshot' | 'openrouter'

/** Nivel de capacidad/costo pedido. El router lo mapea a un modelo por proveedor. */
export type LlmTier = 'cheap' | 'balanced' | 'capable'

export interface LlmRequest {
  /** Etiqueta de tarea (para routing + métricas). Ej. 'sir_chat', 'briefing_daily'. */
  task: string
  sensitivity?: Sensitivity
  system?: string
  messages: LlmMessage[]
  maxTokens?: number
  temperature?: number
  /** Fuerza el tier (si no, se infiere de la tarea). */
  tier?: LlmTier
  /** Fuerza un proveedor específico (si está disponible). */
  provider?: LlmProvider
  /** Fuerza un modelId específico (además del proveedor). */
  model?: string
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
}

export interface LlmResponse {
  text: string
  provider: LlmProvider
  model: string
  usage: LlmUsage
  /** Costo estimado en USD (según price del registry). null si sin precio. */
  costUsd: number | null
  /** Presente si el primario falló y respondió un fallback. */
  fellBackTo?: LlmProvider
}

export class LlmError extends Error {
  constructor(public code: 'no_provider' | 'all_failed' | 'provider_error', message: string) {
    super(message)
    this.name = 'LlmError'
  }
}

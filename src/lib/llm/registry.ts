// SIR V2 — Registro de proveedores LLM (ADR 0011 · spec en docs/LLM_PROVIDER_ARCHITECTURE.md).
//
// Catálogo declarativo: proveedor → cómo llamarlo (kind + baseURL + envKey),
// qué modelo usar por tier, costo relativo y precio estimado (para telemetría).
// "Bring your own key": solo se usan los proveedores cuya env var está seteada
// en Vercel. Agregar un proveedor OpenAI-compatible = una fila acá, cero código.

import type { LlmProvider, LlmTier } from './types'

export type ProviderKind = 'anthropic' | 'openai-compat'

export interface ProviderConfig {
  provider: LlmProvider
  kind: ProviderKind
  /** Base URL del endpoint OpenAI-compatible (ignorado por 'anthropic'). */
  baseURL?: string
  /** Env var con la API key. Sin ella, el proveedor no está disponible. */
  envKey: string
  /** Modelo por tier. */
  models: Record<LlmTier, string>
  /** Modelo multimodal (visión). Si falta, el proveedor NO recibe requests con
   *  imágenes: el router lo filtra de la chain. Sumar visión barata = una línea. */
  vision?: string
  /** Orden de costo (menor = más barato). Ordena el fallback por costo. */
  costRank: number
  /** ¿Entrena con el input? Documentado (ADR 0011 no lo usa para excluir). */
  trainsOnInput: boolean
  /** Precio USD por 1M tokens {in, out} — estimado, para el costo en telemetría. */
  price?: { in: number; out: number }
}

// Precios y modelIds son ESTIMADOS/ajustables — se calibran con la telemetría real.
export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  anthropic: {
    provider: 'anthropic', kind: 'anthropic', envKey: 'ANTHROPIC_API_KEY',
    models: { cheap: 'claude-haiku-4-5-20251001', balanced: 'claude-sonnet-4-5-20250929', capable: 'claude-sonnet-4-5-20250929' },
    // Visión: Sonnet 4.5 (multimodal) — es el modelo que ya usan hoy los
    // extractores de captura. Migrar a la capa NO cambia el modelo (behavior-preserving).
    vision: 'claude-sonnet-4-5-20250929',
    costRank: 100, trainsOnInput: false, price: { in: 3, out: 15 },
  },
  deepseek: {
    provider: 'deepseek', kind: 'openai-compat', baseURL: 'https://api.deepseek.com/v1', envKey: 'DEEPSEEK_API_KEY',
    models: { cheap: 'deepseek-chat', balanced: 'deepseek-chat', capable: 'deepseek-reasoner' },
    costRank: 5, trainsOnInput: true, price: { in: 0.28, out: 0.42 },
  },
  qwen: {
    provider: 'qwen', kind: 'openai-compat', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', envKey: 'DASHSCOPE_API_KEY',
    models: { cheap: 'qwen-plus', balanced: 'qwen-plus', capable: 'qwen-max' },
    costRank: 10, trainsOnInput: true, price: { in: 0.4, out: 1.2 },
  },
  zhipu: {
    provider: 'zhipu', kind: 'openai-compat', baseURL: 'https://open.bigmodel.cn/api/paas/v4', envKey: 'ZHIPU_API_KEY',
    models: { cheap: 'glm-4-flash', balanced: 'glm-4.6', capable: 'glm-4.6' },
    costRank: 8, trainsOnInput: true, price: { in: 0.6, out: 2 },
  },
  moonshot: {
    provider: 'moonshot', kind: 'openai-compat', baseURL: 'https://api.moonshot.cn/v1', envKey: 'MOONSHOT_API_KEY',
    models: { cheap: 'moonshot-v1-8k', balanced: 'kimi-k2-0905-preview', capable: 'kimi-k2-0905-preview' },
    costRank: 12, trainsOnInput: true, price: { in: 0.6, out: 2.5 },
  },
  openrouter: {
    provider: 'openrouter', kind: 'openai-compat', baseURL: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY',
    models: { cheap: 'meta-llama/llama-3.3-70b-instruct', balanced: 'qwen/qwen-2.5-72b-instruct', capable: 'deepseek/deepseek-r1' },
    costRank: 30, trainsOnInput: false, price: { in: 0.5, out: 1.5 },
  },
}

/** Lista de proveedores cuya env key está presente (server-side). */
export function availableProviders(env: Record<string, string | undefined> = process.env): LlmProvider[] {
  return (Object.keys(PROVIDERS) as LlmProvider[]).filter((p) => {
    const v = env[PROVIDERS[p].envKey]
    return typeof v === 'string' && v.trim().length > 0
  })
}

/** Costo estimado en USD de un uso, o null si el proveedor no tiene precio. */
export function estimateCost(provider: LlmProvider, inputTokens: number, outputTokens: number): number | null {
  const price = PROVIDERS[provider].price
  if (!price) return null
  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out
}

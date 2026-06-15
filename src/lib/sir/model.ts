// SIR V2 — Registro de modelos del chat de SIR (#86). Capa de PROVEEDOR.
// Anthropic (key en env ANTHROPIC_API_KEY) + OSS vía OpenRouter (gateway
// OpenAI-compatible, key en env OPENROUTER_API_KEY). Sin keys en la base:
// "bring your own key" = setear la env var en Vercel. Si la env del proveedor
// elegido falta, /api/sir/ask responde con un error claro.

export type SirProvider = 'anthropic' | 'openrouter'
export type SirModelTier = 'haiku' | 'sonnet' | 'oss_llama' | 'oss_qwen'

export interface SirModelInfo {
  tier: SirModelTier
  provider: SirProvider
  modelId: string
  label: string
  hint: string
  /** Env var que debe existir para usar este modelo. */
  envKey: 'ANTHROPIC_API_KEY' | 'OPENROUTER_API_KEY'
}

export const SIR_MODELS: Record<SirModelTier, SirModelInfo> = {
  haiku: { tier: 'haiku', provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', label: 'Rápido y barato (Claude)', hint: 'Respuestas ágiles, menor costo.', envKey: 'ANTHROPIC_API_KEY' },
  sonnet: { tier: 'sonnet', provider: 'anthropic', modelId: 'claude-sonnet-4-5-20250929', label: 'Equilibrado (Claude)', hint: 'Mejor razonamiento, costo medio (default).', envKey: 'ANTHROPIC_API_KEY' },
  oss_llama: { tier: 'oss_llama', provider: 'openrouter', modelId: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (OSS)', hint: 'Open-source vía OpenRouter, más barato. Requiere OPENROUTER_API_KEY.', envKey: 'OPENROUTER_API_KEY' },
  oss_qwen: { tier: 'oss_qwen', provider: 'openrouter', modelId: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (OSS)', hint: 'Open-source vía OpenRouter, más barato. Requiere OPENROUTER_API_KEY.', envKey: 'OPENROUTER_API_KEY' },
}

export const DEFAULT_SIR_TIER: SirModelTier = 'sonnet'

/** Normaliza un valor cualquiera a un tier válido (default sonnet). */
export function normalizeTier(v: unknown): SirModelTier {
  return typeof v === 'string' && v in SIR_MODELS ? (v as SirModelTier) : DEFAULT_SIR_TIER
}

/** Resuelve la info completa del modelo (provider+id) a partir del tier. */
export function resolveModel(tier: unknown): SirModelInfo {
  return SIR_MODELS[normalizeTier(tier)]
}

/** Compat: model id suelto (usado por el path Anthropic legado). */
export function resolveModelId(tier: unknown): string {
  return resolveModel(tier).modelId
}

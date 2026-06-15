// SIR V2 — Registro de modelos del chat de SIR (#86 PR3).
// Capa fina de "proveedor": hoy solo Anthropic, 3 niveles de costo/calidad.
// Mañana, para OSS por API (OpenRouter/Groq), se agrega baseURL/key acá —
// pero ESO requiere almacenamiento seguro de la key (no en este PR).

export type SirModelTier = 'haiku' | 'sonnet'

export interface SirModelInfo {
  tier: SirModelTier
  modelId: string
  label: string
  hint: string
}

export const SIR_MODELS: Record<SirModelTier, SirModelInfo> = {
  haiku: { tier: 'haiku', modelId: 'claude-haiku-4-5-20251001', label: 'Rápido y barato', hint: 'Respuestas ágiles, menor costo.' },
  sonnet: { tier: 'sonnet', modelId: 'claude-sonnet-4-5-20250929', label: 'Equilibrado', hint: 'Mejor razonamiento, costo medio (default).' },
}

export const DEFAULT_SIR_TIER: SirModelTier = 'sonnet'

/** Normaliza un valor cualquiera a un tier válido (default sonnet). */
export function normalizeTier(v: unknown): SirModelTier {
  return v === 'haiku' || v === 'sonnet' ? v : DEFAULT_SIR_TIER
}

/** Resuelve el model id de Anthropic a partir del tier guardado. */
export function resolveModelId(tier: unknown): string {
  return SIR_MODELS[normalizeTier(tier)].modelId
}

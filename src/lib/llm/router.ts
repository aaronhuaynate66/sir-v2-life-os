// SIR V2 — Router LLM (ADR 0011). PURO y testeable.
//
// Dada una request + los proveedores disponibles (con key), arma la CHAIN
// ordenada (primario + fallbacks) de {provider, model} a intentar. Regla:
//   - tier de la tarea (explícito o inferido).
//   - cheap/balanced → más BARATO primero (prioridad de Aaron: costo).
//   - capable → CALIDAD primero (Anthropic al frente si está), luego por costo.
//   - provider/model forzados van primero si están disponibles.
// La sensibilidad NO excluye (ADR 0011), pero podría re-ordenar en el futuro
// sin tocar los call-sites.

import type { LlmProvider, LlmRequest, LlmTier } from './types'
import { PROVIDERS, type ProviderKind } from './registry'

export interface PlannedCall {
  provider: LlmProvider
  model: string
  kind: ProviderKind
}

/** Tier por defecto según la tarea. Ajustable sin tocar los call-sites. */
const TASK_TIER: Record<string, LlmTier> = {
  // Mecánicas / baratas.
  classify: 'cheap', extract: 'cheap', format: 'cheap', message_draft: 'cheap', tag: 'cheap',
  // Equilibradas.
  sir_chat: 'balanced', briefing_daily: 'balanced', briefing_person: 'balanced',
  // Razonamiento / síntesis.
  synthesis: 'capable', decision: 'capable', rehearse: 'capable',
}

export function tierFor(task: string, explicit?: LlmTier): LlmTier {
  return explicit ?? TASK_TIER[task] ?? 'balanced'
}

function toCall(provider: LlmProvider, tier: LlmTier, forcedModel?: string): PlannedCall {
  const cfg = PROVIDERS[provider]
  return { provider, model: forcedModel ?? cfg.models[tier], kind: cfg.kind }
}

/**
 * Arma la chain ordenada de intentos. Devuelve [] si no hay ningún proveedor
 * disponible (complete() lo traduce a un error claro).
 */
export function planChain(req: LlmRequest, available: LlmProvider[]): PlannedCall[] {
  const has = new Set(available)
  if (has.size === 0) return []
  const tier = tierFor(req.task, req.tier)

  // Orden base por costo (más barato primero).
  const byCost = [...available].sort((a, b) => PROVIDERS[a].costRank - PROVIDERS[b].costRank)

  // capable → calidad primero: Anthropic al frente si está disponible.
  let ordered: LlmProvider[]
  if (tier === 'capable' && has.has('anthropic')) {
    ordered = ['anthropic', ...byCost.filter((p) => p !== 'anthropic')]
  } else {
    ordered = byCost
  }

  // Proveedor forzado (si está disponible) va primero, sin duplicar.
  if (req.provider && has.has(req.provider)) {
    ordered = [req.provider, ...ordered.filter((p) => p !== req.provider)]
  }

  return ordered.map((p, i) =>
    // El modelId forzado solo aplica al primer intento del proveedor forzado.
    toCall(p, tier, i === 0 && req.provider === p ? req.model : undefined),
  )
}

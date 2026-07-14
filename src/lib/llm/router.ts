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

function toCall(provider: LlmProvider, tier: LlmTier, needsVision: boolean, forcedModel?: string): PlannedCall {
  const cfg = PROVIDERS[provider]
  const model = forcedModel ?? (needsVision ? cfg.vision! : cfg.models[tier])
  return { provider, model, kind: cfg.kind }
}

/** ¿La request lleva alguna imagen? (algún mensaje con bloques y ≥1 de tipo 'image'). */
export function requestHasImages(req: LlmRequest): boolean {
  return req.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'),
  )
}

/**
 * Arma la chain ordenada de intentos. Devuelve [] si no hay ningún proveedor
 * disponible/apto (complete() lo traduce a un error claro).
 *
 * Visión: si la request lleva imágenes, se filtran los proveedores SIN modelo
 * multimodal (registry.vision) y se prioriza calidad (Anthropic al frente).
 */
export function planChain(req: LlmRequest, available: LlmProvider[]): PlannedCall[] {
  if (available.length === 0) return []
  const tier = tierFor(req.task, req.tier)
  const needsVision = requestHasImages(req)

  // Solo proveedores aptos: si hay imágenes, exigimos modelo de visión.
  const candidates = needsVision ? available.filter((p) => PROVIDERS[p].vision != null) : available
  if (candidates.length === 0) return []
  const has = new Set(candidates)

  // Orden base por costo (más barato primero).
  const byCost = [...candidates].sort((a, b) => PROVIDERS[a].costRank - PROVIDERS[b].costRank)

  // Calidad primero (Anthropic al frente) para capable y para visión.
  let ordered: LlmProvider[]
  if ((tier === 'capable' || needsVision) && has.has('anthropic')) {
    ordered = ['anthropic', ...byCost.filter((p) => p !== 'anthropic')]
  } else {
    ordered = byCost
  }

  // Proveedor forzado (si está entre los aptos) va primero, sin duplicar.
  if (req.provider && has.has(req.provider)) {
    ordered = [req.provider, ...ordered.filter((p) => p !== req.provider)]
  }

  return ordered.map((p, i) =>
    // El modelId forzado solo aplica al primer intento del proveedor forzado.
    toCall(p, tier, needsVision, i === 0 && req.provider === p ? req.model : undefined),
  )
}

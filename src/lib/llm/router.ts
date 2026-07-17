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
  // Visión y texto usan el modelo del tier: Anthropic es multimodal en todos sus
  // tiers, así que cheap→Haiku / capable→Sonnet se preservan también con imágenes.
  return { provider, model: forcedModel ?? cfg.models[tier], kind: cfg.kind }
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
 * Visión: si la request lleva imágenes, se filtran los proveedores no multimodales
 * (registry.visionCapable) y se prioriza calidad (Anthropic al frente).
 *
 * `degraded`: proveedores que la telemetría marcó lentos/caídos (providerHealth).
 * Se mandan al FINAL de la chain (no se eliminan → siguen como último recurso),
 * así un proveedor barato pero enfermo no hace perder tiempo yendo primero.
 */
export function planChain(
  req: LlmRequest,
  available: LlmProvider[],
  degraded: Set<LlmProvider> = new Set(),
): PlannedCall[] {
  if (available.length === 0) return []
  const tier = tierFor(req.task, req.tier)
  const needsVision = requestHasImages(req)

  // Solo proveedores aptos: si hay imágenes, exigimos multimodalidad.
  const candidates = needsVision ? available.filter((p) => PROVIDERS[p].visionCapable) : available
  if (candidates.length === 0) return []
  const has = new Set(candidates)

  // Orden base por costo (más barato primero).
  const byCost = [...candidates].sort((a, b) => PROVIDERS[a].costRank - PROVIDERS[b].costRank)

  // Orden por tier (el "sistema que decide" qué proveedor usar):
  //  - `capable` / visión: CALIDAD primero → Anthropic al frente (fallback a los baratos).
  //  - `balanced` / `cheap`: el más barato disponible primero, con Anthropic al final
  //    como fallback automático (si el barato falla/erra, complete() reintenta con él).
  //    balanced en OpenRouter usa deepseek-chat (rápido + fiable con JSON); cheap usa
  //    llama-3.3-70b. Ahí vive el ahorro. En visión, `candidates` ya quedó a Anthropic.
  let ordered: LlmProvider[]
  if ((tier === 'capable' || needsVision) && has.has('anthropic')) {
    ordered = ['anthropic', ...byCost.filter((p) => p !== 'anthropic')]
  } else {
    ordered = byCost
  }

  // Salud: degradados (lentos/caídos) al final, preservando el orden relativo.
  // Nunca vacía la chain — siguen como fallback por si los sanos también fallan.
  if (degraded.size) {
    const healthy = ordered.filter((p) => !degraded.has(p))
    const bad = ordered.filter((p) => degraded.has(p))
    if (healthy.length) ordered = [...healthy, ...bad]
  }

  // Proveedor forzado (si está entre los aptos) va primero, sin duplicar.
  if (req.provider && has.has(req.provider)) {
    ordered = [req.provider, ...ordered.filter((p) => p !== req.provider)]
  }

  return ordered.map((p, i) =>
    // El modelId forzado solo aplica al primer intento del proveedor forzado.
    toCall(p, tier, i === 0 && req.provider === p ? req.model : undefined),
  )
}

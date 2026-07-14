// SIR V2 — Capa LLM multi-proveedor (ADR 0011). Punto de entrada.
export { complete, type CompleteOpts } from './complete'
export { planChain, tierFor, requestHasImages, type PlannedCall } from './router'
export { PROVIDERS, availableProviders, estimateCost, type ProviderConfig, type ProviderKind } from './registry'
export type {
  LlmRequest, LlmResponse, LlmMessage, LlmRole, LlmProvider, LlmTier, Sensitivity, LlmUsage,
  LlmContentBlock, LlmTextBlock, LlmImageBlock, LlmImageMediaType,
} from './types'
export { LlmError } from './types'

// SIR V2 — Self Engine (barrel)
// Re-exports all types and functions from the self engine

export type {
  SelfProfile,
  BiologicalProfile,
  EmotionalBaseline,
  SelfPattern,
  SelfInsight,
  PerformanceProfile,
  IdentityProfile,
  DecisionStyle,
  ConflictStyle,
  AttachmentStyle,
} from './types'

export {
  updateSelfProfile,
  analyzeSelfPatterns,
  generateSelfInsights,
  calculateSelfCoherence,
} from './engine'

// SIR V2 — Zustand Storage Keys
// Centralized localStorage key constants for all stores

export const STORAGE_KEYS = {
  SELF: 'sir-v2-self',
  RELATIONSHIP: 'sir-v2-relationship',
  GOAL: 'sir-v2-goal',
  OBJECTIVE_STEP: 'sir-v2-objective-step',
  FINANCE: 'sir-v2-finance',
  SIGNAL: 'sir-v2-signal',
  RECOMMENDATION: 'sir-v2-recommendation',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

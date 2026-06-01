// SIR V2 — Supabase sync layer (Sesión 20c)
// Public surface for stores to attach to.

export { attachSupabaseSync } from './engine'
export type { TableAdapter, SliceBinding, SyncOptions } from './types'

export { memoryAdapter } from './adapters/memories'
export { financeMovementAdapter } from './adapters/finance'
export { signalAdapter } from './adapters/signals'
export { goalAdapter } from './adapters/goals'
export { selfMetricAdapter, healthMetricAdapter, sleepRecordAdapter, selfDiagnosisAdapter } from './adapters/self'
export { personAdapter, relationshipAdapter } from './adapters/relationships'

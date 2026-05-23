// SIR V2 — Relationship Engine (barrel)
// Re-exports all types and functions from the relationship engine

export type { RelationshipContext, RelationshipAlert, RelationshipMap } from './types'
export { analyzeRelationshipContext, detectRelationshipAlerts, buildRelationshipMap } from './engine'

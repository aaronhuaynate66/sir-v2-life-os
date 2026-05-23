// SIR V2 — Relationship Engine Types
import type { Person, Relationship } from '@/types'

export interface RelationshipContext {
  person: Person
  relationship: Relationship
  recentActivity: string[]
  pendingActions: string[]
  alertLevel: 'none' | 'low' | 'medium' | 'high'
  nextContactRecommendation?: string
  relationshipHealthScore: number
}

export interface RelationshipAlert {
  personId: string
  personName: string
  alertType: 'no_contact' | 'conflict' | 'opportunity' | 'milestone' | 'drift'
  message: string
  urgency: 'immediate' | 'soon' | 'monitor'
  suggestedAction: string
}

export interface RelationshipMap {
  innerCircle: Person[]
  close: Person[]
  network: Person[]
  peripheral: Person[]
  needsAttention: Person[]
}

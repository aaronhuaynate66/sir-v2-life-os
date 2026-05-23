// ============================================================
// SIR V2 — Self Engine Types
// ============================================================

export interface SelfProfile {
  id: string
  name: string
  age: number
  mission: string
  coreValues: string[]
  coreBeliefs: string[]
  limitingBeliefs: string[]
  decisionStyle: DecisionStyle
  conflictStyle: ConflictStyle
  attachmentStyle: AttachmentStyle
  mbti?: string
  motivators: string[]
  stressors: string[]
  defenseMechanisms: string[]
  updatedAt: string
}

export type DecisionStyle = 'analytic' | 'intuitive' | 'collaborative' | 'decisive'
export type ConflictStyle = 'avoiding' | 'competing' | 'collaborating' | 'accommodating'
export type AttachmentStyle = 'secure' | 'anxious' | 'avoidant' | 'disorganized'

export interface BiologicalProfile {
  age: number
  weight: number
  height: number
  bloodType?: string
  chronicConditions: string[]
  medications: string[]
  allergies: string[]
  sleepBaseline: number
  energyCycleType: 'morning' | 'evening' | 'variable'
  exerciseCapacity: 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'
  nutritionApproach: string
}

export interface EmotionalBaseline {
  dominantEmotions: string[]
  emotionalRange: 'narrow' | 'moderate' | 'wide'
  regulationAbility: 'low' | 'developing' | 'good' | 'excellent'
  empathyLevel: 'low' | 'medium' | 'high' | 'empathic'
  emotionalTriggers: string[]
  emotionalAnchors: string[]
}

export interface PerformanceProfile {
  peakHours: string[]
  focusCapacity: number
  recoveryTime: number
  multitaskingTolerance: 'low' | 'medium' | 'high'
  creativePeakConditions: string[]
  decisionFatigueThreshold: number
}

export interface IdentityProfile {
  coreIdentity: string
  roles: string[]
  aspirationalIdentity: string
  identityGaps: string[]
  proudOf: string[]
  mission: string
}

export interface SelfPattern {
  id: string
  pattern: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'situational'
  isPositive: boolean
  category: string
  firstDetected: string
  lastObserved: string
  notes?: string
}

export interface SelfInsight {
  id: string
  content: string
  source: string
  confidence: number
  category: string
  timestamp: string
  validated: boolean
}

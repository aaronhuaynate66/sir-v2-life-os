// ============================================================
// SIR V2 — Global Types
// Life Operating System
// ============================================================

// ─── ENUMS ───────────────────────────────────────────────────

export type RelationshipType =
  | 'family'
  | 'friend'
  | 'romantic'
  | 'professional'
  | 'mentor'
  | 'mentee'
  | 'acquaintance'

export type PersonCategory =
  | 'inner_circle'
  | 'close'
  | 'network'
  | 'peripheral'

export type EnergyImpact = 'energizing' | 'draining' | 'neutral'

export type RelationshipStatus = 'active' | 'dormant' | 'strained' | 'ended'

export type GoalCategory =
  | 'financial'
  | 'personal'
  | 'relational'
  | 'health'
  | 'career'
  | 'spiritual'
  | 'creative'

export type GoalPriority = 'critical' | 'high' | 'medium' | 'low'

export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned'

export type SignalSource =
  | 'linkedin'
  | 'instagram'
  | 'calendar'
  | 'biological'
  | 'financial'
  | 'relational'
  | 'manual'

export type SignalType =
  | 'opportunity'
  | 'warning'
  | 'pattern'
  | 'timing'
  | 'emotional'
  | 'relational'
  | 'biological'
  | 'financial'

export type SignalUrgency = 'immediate' | 'soon' | 'monitor' | 'archive'

export type MemoryType =
  | 'episodic'
  | 'semantic'
  | 'emotional'
  | 'relational'
  | 'temporal'
  | 'predictive'

export type RecommendationType =
  | 'action'
  | 'decision'
  | 'wait'
  | 'reflect'
  | 'connect'
  | 'rest'

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low'

export type RecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed'

export type TimingType = 'now' | 'today' | 'this_week' | 'when_ready'

export type MovementType = 'income' | 'expense' | 'investment' | 'transfer' | 'debt'

export type FinancialCategory =
  | 'housing'
  | 'food'
  | 'transport'
  | 'health'
  | 'entertainment'
  | 'investment'
  | 'business'
  | 'personal'
  | 'debt'
  | 'other'

export type MetricCategory =
  | 'energy'
  | 'mood'
  | 'stress'
  | 'focus'
  | 'motivation'
  | 'confidence'

export type HealthMetricType =
  | 'weight'
  | 'blood_pressure'
  | 'heart_rate'
  | 'steps'
  | 'calories'
  | 'hydration'
  | 'custom'

export type EventCategory =
  | 'personal'
  | 'professional'
  | 'health'
  | 'relational'
  | 'financial'

export type ReflectionType = 'daily' | 'weekly' | 'monthly' | 'event' | 'spontaneous'

// ─── CORE ENTITIES ────────────────────────────────────────────

export interface Person {
  id: string
  name: string
  alias?: string
  relationship: RelationshipType
  category: PersonCategory
  importanceScore: number
  energyImpact: EnergyImpact
  trustLevel: number
  lastContact?: string
  contactFrequency: string
  location?: string
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Relationship {
  id: string
  personId: string
  type: RelationshipType
  status: RelationshipStatus
  depth: number
  reciprocity: number
  history: RelationshipEvent[]
  sharedGoals: string[]
  tensions: string[]
  strengths: string[]
  nextAction?: string
  nextActionDate?: string
}

export interface RelationshipEvent {
  id: string
  description: string
  emotionalTone: number
  date: string
  type: 'positive' | 'negative' | 'neutral' | 'milestone'
}

export interface Milestone {
  id: string
  title: string
  completed: boolean
  dueDate?: string
  completedAt?: string
}

export interface Goal {
  id: string
  title: string
  description: string
  category: GoalCategory
  priority: GoalPriority
  status: GoalStatus
  targetDate?: string
  progress: number
  milestones: Milestone[]
  relatedGoals: string[]
  relatedPersons: string[]
  peaceImpact: number
  obstacles: string[]
  nextAction: string
  createdAt: string
  updatedAt: string
}

export interface Signal {
  id: string
  source: SignalSource
  type: SignalType
  content: string
  strength: number
  urgency: SignalUrgency
  relatedPersons: string[]
  relatedGoals: string[]
  meaning?: string
  actionRequired: boolean
  suggestedAction?: string
  detectedAt: string
  expiresAt?: string
  resolved: boolean
}

export interface Memory {
  id: string
  type: MemoryType
  title: string
  content: string
  entities: string[]
  emotionalCharge: number
  importance: number
  timestamp: string
  lastAccessed: string
  decayRate: number
  tags: string[]
  relatedMemories: string[]
}

export interface SelfMetric {
  id: string
  category: MetricCategory
  value: number
  note?: string
  timestamp: string
}

export interface HealthMetric {
  id: string
  type: HealthMetricType
  value: number
  unit: string
  note?: string
  timestamp: string
}

export interface SleepRecord {
  id: string
  date: string
  bedtime: string
  wakeTime: string
  duration: number
  quality: number
  dreams?: string
  notes?: string
}

export interface FinancialMovement {
  id: string
  type: MovementType
  amount: number
  currency: string
  category: FinancialCategory
  description: string
  date: string
  recurrent: boolean
  recurrentPeriod?: string
  relatedGoal?: string
  tags: string[]
}

export interface Recommendation {
  id: string
  title: string
  description: string
  type: RecommendationType
  priority: RecommendationPriority
  timing: TimingType
  relatedGoals: string[]
  relatedPersons: string[]
  expectedPeaceImpact: number
  confidence: number
  reasoning: string
  createdAt: string
  expiresAt?: string
  status: RecommendationStatus
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  startDate: string
  endDate: string
  allDay: boolean
  category: EventCategory
  relatedPersons: string[]
  relatedGoals: string[]
  energyCost: number
  importance: number
  preparationNeeded: boolean
  followUpNeeded: boolean
}

export interface Reflection {
  id: string
  type: ReflectionType
  content: string
  mood: number
  insights: string[]
  gratitude: string[]
  challenges: string[]
  nextIntentions: string[]
  timestamp: string
  tags: string[]
}

// ─── SYSTEM TYPES ─────────────────────────────────────────────

export interface PeaceScore {
  total: number
  components: {
    biological: number
    relational: number
    financial: number
    goalProgress: number
    emotional: number
  }
  trend: 'improving' | 'stable' | 'declining'
  recoveryMode: boolean
  lastUpdated: string
}

export interface ContextSnapshot {
  timestamp: string
  peaceScore: PeaceScore
  activeSignals: Signal[]
  topRecommendation?: Recommendation
  biologicalState: BiologicalState
  financialState: FinancialState
  activeGoals: Goal[]
  keyRelationshipAlerts: string[]
}

export interface BiologicalState {
  energyLevel: number
  stressLevel: number
  sleepDebt: number
  lastSleepQuality: number
  lastSleepDuration: number
  recoveryScore: number
  timestamp: string
}

export interface FinancialState {
  stabilityScore: number
  monthlyBalance: number
  liquidityMonths: number
  activeAlerts: string[]
  timestamp: string
}

export interface SystemStatus {
  operationalMode: 'normal' | 'focused' | 'recovery' | 'strategic'
  currentBlock?: string
  nextBlock?: string
  dayQuality?: number
}

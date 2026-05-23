# 06 — DATA MODEL
# SIR V2 — Modelo de Datos

---

## Entidades Principales

### Person
```typescript
interface Person {
  id: string
  name: string
  alias?: string
  relationship: RelationshipType
  category: PersonCategory      // family | friend | professional | romantic | acquaintance
  importanceScore: number       // 0 a 10
  energyImpact: EnergyImpact   // energizing | draining | neutral
  trustLevel: number            // 0 a 10
  lastContact: Date
  contactFrequency: string      // daily | weekly | monthly | rarely
  location?: string
  tags: string[]
  notes: string
  createdAt: Date
  updatedAt: Date
}
```

### Relationship
```typescript
interface Relationship {
  id: string
  personId: string
  type: RelationshipType
  status: RelationshipStatus   // active | dormant | strained | ended
  depth: number                // 0 a 10 (superficial a profunda)
  reciprocity: number          // -1 a 1 (tomo más | equilibrio | doy más)
  history: RelationshipEvent[]
  sharedGoals: string[]
  tensions: string[]
  strengths: string[]
  nextAction?: string
  nextActionDate?: Date
}
```

### Goal
```typescript
interface Goal {
  id: string
  title: string
  description: string
  category: GoalCategory        // financial | personal | relational | health | career | spiritual
  priority: GoalPriority        // critical | high | medium | low
  status: GoalStatus            // active | paused | completed | abandoned
  targetDate?: Date
  progress: number              // 0 a 100
  milestones: Milestone[]
  relatedGoals: string[]
  relatedPersons: string[]
  peaceImpact: number           // impacto esperado en paz si se logra
  obstacles: string[]
  nextAction: string
  createdAt: Date
  updatedAt: Date
}
```

### Signal
```typescript
interface Signal {
  id: string
  source: SignalSource          // linkedin | instagram | calendar | biological | financial | relational
  type: SignalType              // opportunity | warning | pattern | timing | emotional
  content: string
  strength: number             // 0 a 10
  urgency: SignalUrgency       // immediate | soon | monitor | archive
  relatedPersons: string[]
  relatedGoals: string[]
  meaning?: string             // interpretación del sistema
  actionRequired: boolean
  suggestedAction?: string
  detectedAt: Date
  expiresAt?: Date
  resolved: boolean
}
```

### Memory
```typescript
interface Memory {
  id: string
  type: MemoryType             // episodic | semantic | emotional | relational | temporal | predictive
  title: string
  content: string
  entities: string[]
  emotionalCharge: number      // -1 a 1
  importance: number           // 0 a 10
  timestamp: Date
  lastAccessed: Date
  decayRate: number
  tags: string[]
  relatedMemories: string[]
}
```

### SelfMetric
```typescript
interface SelfMetric {
  id: string
  category: MetricCategory     // energy | mood | stress | focus | motivation | confidence
  value: number               // 0 a 10
  note?: string
  timestamp: Date
}
```

### HealthMetric
```typescript
interface HealthMetric {
  id: string
  type: HealthMetricType       // weight | bloodPressure | heartRate | steps | calories | etc
  value: number
  unit: string
  note?: string
  timestamp: Date
}
```

### SleepRecord
```typescript
interface SleepRecord {
  id: string
  date: Date
  bedtime: string
  wakeTime: string
  duration: number             // horas
  quality: number             // 0 a 10
  dreams?: string
  notes?: string
}
```

### FinancialMovement
```typescript
interface FinancialMovement {
  id: string
  type: MovementType          // income | expense | investment | transfer | debt
  amount: number
  currency: string
  category: FinancialCategory // housing | food | transport | health | entertainment | investment | etc
  description: string
  date: Date
  recurrent: boolean
  recurrentPeriod?: string
  impact: FinancialImpact     // positive | negative | neutral
  relatedGoal?: string
  tags: string[]
}
```

### Recommendation
```typescript
interface Recommendation {
  id: string
  title: string
  description: string
  type: RecommendationType    // action | decision | wait | reflect | connect | rest
  priority: RecommendationPriority // critical | high | medium | low
  timing: TimingType          // now | today | this_week | when_ready
  relatedGoals: string[]
  relatedPersons: string[]
  expectedPeaceImpact: number // -5 a +5
  confidence: number          // 0 a 1
  reasoning: string
  createdAt: Date
  expiresAt?: Date
  status: RecommendationStatus // pending | accepted | dismissed | completed
}
```

### CalendarEvent
```typescript
interface CalendarEvent {
  id: string
  title: string
  description?: string
  startDate: Date
  endDate: Date
  allDay: boolean
  category: EventCategory     // personal | professional | health | relational | financial
  relatedPersons: string[]
  relatedGoals: string[]
  energyCost: number         // 0 a 10
  importance: number         // 0 a 10
  preparationNeeded: boolean
  followUpNeeded: boolean
}
```

### Reflection
```typescript
interface Reflection {
  id: string
  type: ReflectionType        // daily | weekly | monthly | event | spontaneous
  content: string
  mood: number               // 0 a 10
  insights: string[]
  gratitude: string[]
  challenges: string[]
  nextIntentions: string[]
  timestamp: Date
  tags: string[]
}
```

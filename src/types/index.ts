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
  // 'social' agregado al CHECK de memories.type en migration 0010
  // (parity V1). Materializado por capturas WhatsApp/redes.
  | 'social'

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

export type Currency = 'PEN' | 'USD'

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
  // body composition (Migration 0005)
  | 'bmi'
  | 'body_fat_percent'
  | 'muscle_mass_kg'
  | 'bone_mass_kg'
  | 'water_percent'
  | 'protein_percent'
  | 'visceral_fat_level'
  | 'metabolic_rate_kcal'
  | 'skeletal_muscle_mass_kg'
  | 'metabolic_age'
  | 'body_score'
  | 'ideal_weight_kg'

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
  /** Slug user-facing para URLs /relaciones/[slug]. Auto-generado desde
   *  el nombre, editable. Único por user_id. Nullable durante transición
   *  (migration 0008). */
  slug?: string
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
  /** Fecha de nacimiento ISO (YYYY-MM-DD). Canonical en `people.birth_date`
   *  (migration 0010). Usado por BirthdayCountdown en el detail page. */
  birthDate?: string
  /** Inicio del último período menstrual (ISO YYYY-MM-DD). Canonical en
   *  `people.cycle_start_date` (migration 0010). Usado por CicloPanel
   *  para inferir fase actual. null/undefined → empty state. */
  cycleStartDate?: string
  /** Largo del ciclo menstrual en días (15-60, CHECK constraint en SQL).
   *  Canonical en `people.cycle_length_days` (migration 0010, default 28).
   *  Solo se interpreta junto con cycleStartDate. */
  cycleLengthDays?: number
  /** Fechas importantes de la persona (aniversarios, santos, fechas
   *  especiales). Canonical en `people.special_dates` (jsonb, migration
   *  0010, default '[]'). Renderizadas con countdown en FechasImportantes
   *  (detail page, item #9 del backlog). undefined = sin fechas. */
  specialDates?: SpecialDate[]
  /** Teléfono (formato libre, ej. "+51 999 888 777"). Canonical en
   *  `people.phone_number` (migration 0010). Habilita el botón Chat
   *  WhatsApp (wa.me) del detail page. */
  phoneNumber?: string
  /** Handle de Instagram SIN @ (ej. "diana.carolina.d"). Canonical en
   *  `people.instagram_handle` (migration 0010). */
  instagramHandle?: string
  /** URL completa del perfil de LinkedIn. Canonical en
   *  `people.linkedin_url` (migration 0010). */
  linkedinUrl?: string
  /** Handle de Twitter/X SIN @. Canonical en `people.twitter_handle`
   *  (migration 0010). */
  twitterHandle?: string
  /** Estado civil (soltero/casado/etc.). Texto libre con opciones sugeridas
   *  en el form. Canonical en `people.estado_civil` (migration 0024). */
  estadoCivil?: string
  /** Grado de instrucción / educación (texto libre, ej. "Universitario ·
   *  Ing. Industrial"). Se muestra en Vida profesional. Canonical en
   *  `people.education` (migration 0024). */
  education?: string
  createdAt: string
  updatedAt: string
}

/** Una fecha importante asociada a una persona (item #9/#13 del detail page).
 *  Vive serializada en `people.special_dates` (jsonb array). */
export interface SpecialDate {
  /** Id estable (uuid) — usado para editar/borrar dentro del array. */
  id: string
  /** Etiqueta libre: "Aniversario", "Día del santo", "Mudanza", etc. */
  label: string
  /** Fecha ISO date-only (YYYY-MM-DD). Se parsea en TZ local (parseLocalDate)
   *  para evitar el shift UTC en Lima. */
  date: string
  /** true = se repite cada año (countdown al próximo aniversario, como un
   *  cumpleaños). false = evento único (el countdown puede quedar en pasado). */
  recurring: boolean
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

/** Parentesco de una arista de familia persona↔persona. */
export type FamilyKind =
  | 'padre'
  | 'madre'
  | 'hijo'
  | 'hija'
  | 'hermano'
  | 'hermana'
  | 'pareja'
  | 'familiar'

/** Arista de familia persona↔persona (tabla `person_links`, migration 0035).
 *  personAId = sujeto (la persona de la ficha), personBId = el familiar.
 *  Se renderiza como arista 'familia' en el grafo. */
export interface PersonLink {
  id: string
  personAId: string
  personBId: string
  kind: FamilyKind
  createdAt: string
}

/** Mensaje individual de WhatsApp dentro de un capture history item. */
export interface WhatsAppMessage {
  /** "HH:mm" en formato 24h. */
  timestamp: string
  author: 'user' | 'other'
  content: string
  hasSticker?: boolean
  hasEmoji?: boolean
}

/** Estados emocionales inferidos por Vision Nivel B. */
export interface WhatsAppEmotionalStates {
  /** snake_case combinable con '+'. */
  otherPerson?: string
  user?: string
}

export interface RelationshipEvent {
  id: string
  description: string
  emotionalTone: number
  date: string
  type: 'positive' | 'negative' | 'neutral' | 'milestone' | 'whatsapp_capture'

  // ─── opcionales para items de captura WhatsApp (Migration 0009) ──
  /** Tipo de captura cuando el item viene de un upload automatizado. */
  captureKind?: 'whatsapp'
  /** ID estable de la captura (compartido si futuro agrupa N items). */
  captureId?: string
  /** Path en Storage del screenshot original. */
  sourceImagePath?: string
  /** Tags de la conversacion. */
  topics?: string[]
  /** Estados emocionales inferidos por Vision (Nivel B). */
  emotionalStates?: WhatsAppEmotionalStates
  /** Mensajes individuales extraidos para futura busqueda semantica. */
  rawMessages?: WhatsAppMessage[]
  /** Solo si Nivel C activado: 3 preguntas reflexivas. */
  reflectionQuestions?: string[]
  /** Confidence reportado por Vision. */
  confidence?: 'high' | 'medium' | 'low'
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

/** Estado de un paso de objetivo. 'hecho' cuenta como completado en el rollup. */
export type ObjectiveStepStatus = 'pendiente' | 'en_progreso' | 'hecho'

/**
 * Paso/hito accionable de un objetivo (tabla objective_steps, migración 0040).
 * Descompone un Goal en acciones concretas y ordenadas. El progreso del
 * objetivo se calcula del rollup de pasos hechos/total cuando existen pasos.
 */
export interface ObjectiveStep {
  id: string
  /** FK → Goal.id (objective_id en DB, ON DELETE CASCADE). */
  objectiveId: string
  title: string
  description?: string
  /** Fecha objetivo opcional (date-only ISO 'YYYY-MM-DD'). */
  targetDate?: string
  status: ObjectiveStepStatus
  /** Orden dentro del objetivo (0..n). Reasignado de forma densa al reordenar. */
  order: number
  createdAt: string
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
  // ─── Sesion 4 (Memorias asociadas) — campos opcionales ─────────────
  /** Persona vinculada cuando la memoria es relacional (captura WhatsApp,
   *  observation con person_id resuelto). null = memoria sin persona. */
  personId?: string
  /** De donde viene la memoria. Opcional para retro-compat con rows viejas
   *  (memories.source es nullable en DB). extract.ts solo escribe estos
   *  3 valores; el CHECK constraint se enforza en TS, no en SQL. */
  source?: 'whatsapp_capture' | 'manual' | 'inferred'
  /** Id estable del RelationshipEvent que origino la memoria — usado para
   *  el dedupe del backfill (unique index parcial en migration 0012). */
  sourceEventId?: string
}

export interface SelfMetric {
  id: string
  category: MetricCategory
  value: number
  note?: string
  timestamp: string
}

/** Tipo de captura cuando viene de un upload automatizado. Migration 0007. */
export type CaptureKind = 'scale' | 'whatsapp'

export interface HealthMetric {
  id: string
  type: HealthMetricType
  value: number
  unit: string
  note?: string
  timestamp: string
  /** ID de la captura cuando viene de un upload (báscula, etc.). Agrupa las
   *  N métricas que salieron juntas de la misma imagen. Migration 0005. */
  captureId?: string
  /** Storage path del screenshot original. Migration 0005. */
  sourceImagePath?: string
  /** Origen de la captura. Habilita el header dinamico del
   *  TimelineCardGrouped. Migration 0007. */
  captureType?: CaptureKind
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

/**
 * Diagnóstico personal del dueño de la app (Espacio personal en /yo).
 * Singleton por usuario. Data PERSONAL SENSIBLE: privada por RLS, NO se manda
 * a embeddings/IA, NO se expone fuera de /yo. Migration 0030.
 * Mezcla campos estructurados (listas) + texto libre (narrativas).
 */
export interface SelfDiagnosis {
  id: string
  /** Estado emocional actual — texto libre ("¿cómo estás hoy, de verdad?"). */
  emotionalState: string
  /** Principales ansiedades / preocupaciones. */
  anxieties: string[]
  /** Bloqueos detectados. */
  blocks: string[]
  /** "Lo que dejé de tolerar". */
  stoppedTolerating: string[]
  /** "Lo que entiendo". */
  understandings: string[]
  /** Frases ancla / valores. */
  anchors: string[]
  /** Visión de vida ideal — narrativa libre. */
  idealLifeVision: string
  /** Modelo del yo futuro — narrativa libre. */
  futureSelf: string
  /** ISO timestamp de la última edición. */
  updatedAt: string
}

/**
 * Intención del gasto (P1, Financial OS): cuán prescindible era, ortogonal a
 * la categoría (qué se compró). Es el dato accionable para detectar el "gasto
 * hormiga" y la correlación emocional↔financiera (P3).
 *   - obligatorio : fijo / inevitable (alquiler, servicios, deuda).
 *   - necesario   : necesario pero flexible (mercado, transporte).
 *   - no_esencial : discrecional (delivery, antojos, impulso).
 * Solo aplica a salidas de dinero (expense/debt). Opcional: movimientos sin
 * clasificar quedan fuera del desglose. Migration 0031.
 */
export type SpendIntent = 'obligatorio' | 'necesario' | 'no_esencial'

export interface FinancialMovement {
  id: string
  type: MovementType
  /** Amount in the original currency the user entered. */
  amount: number
  currency: Currency
  /** USD->PEN rate captured at registration time. 1.0 if currency='PEN'. */
  exchangeRate: number
  /** Always the PEN equivalent. PEN rows: equals amount. USD rows: amount * exchangeRate. */
  amountPEN: number
  category: FinancialCategory
  /** Intención del gasto. Solo en salidas (expense/debt). Migration 0031. */
  intent?: SpendIntent
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

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

export type PersonAmbito = 'personal' | 'colega' | 'lead'

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
  // actividad/salud de Apple Health (Migration 0049)
  | 'active_energy'
  | 'resting_energy'
  | 'vo2_max'
  | 'blood_oxygen'
  | 'distance_km'
  // frecuencia cardíaca: reposo va a 'heart_rate' (señal principal). La FC
  // GENERAL del día es una distribución, no un escalar → se guarda como rango
  // (mín/máx/prom), nunca como "reposo". (Migration 0049)
  | 'heart_rate_min'
  | 'heart_rate_max'
  | 'heart_rate_avg'
  | 'sleeping_heart_rate'
  // VFC / HRV (variabilidad de la FC) en MILISEGUNDOS — métrica distinta de la FC.
  | 'hrv_min'
  | 'hrv_max'
  | 'hrv_avg'
  // Alertas de FC elevada del wearable (conteo/día) — señal episódica de
  // estrés/activación, no una medición continua (Migration 0081)
  | 'heart_rate_high_alerts'
  | 'respiratory_rate'

export type EventCategory =
  | 'personal'
  | 'professional'
  | 'health'
  | 'relational'
  | 'financial'

export type ReflectionType = 'daily' | 'weekly' | 'monthly' | 'event' | 'spontaneous'

// ─── CORE ENTITIES ────────────────────────────────────────────

/** Sexo/género de una persona. 'other' cubre no-binario/otro. */
export type PersonGender = 'female' | 'male' | 'other'

export interface Person {
  id: string
  /** Slug user-facing para URLs /relaciones/[slug]. Auto-generado desde
   *  el nombre, editable. Único por user_id. Nullable durante transición
   *  (migration 0008). */
  slug?: string
  name: string
  alias?: string
  /** Sexo biológico/género. Gatea el panel de ciclo menstrual (solo 'female')
   *  y habilita mensajes gendered. Canonical en `people.gender` (migración
   *  0069). undefined = sin especificar (legacy/no declarado). */
  gender?: PersonGender
  relationship: RelationshipType
  category: PersonCategory
  /** La LÍNEA: qué tipo de persona representa para vos. 'personal' (familia/
   *  amigos/pareja → lente afectivo), 'colega' (interno de tu trabajo), 'lead'
   *  (contacto/prospecto comercial → lente de oportunidad). Canonical en
   *  `people.ambito` (migración 0087). undefined = sin clasificar (legacy). */
  ambito?: PersonAmbito
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
  /** Cargo / rol de la persona en su empresa (ej. "Jefe de Seguridad
   *  Patrimonial"). Canonical en `people.title` (migration 0083). Texto libre. */
  title?: string
  /** Empleador / empresa específica de la persona (ej. "K2 Seguridad y
   *  Resguardo"). Canonical en `people.organization` (migration 0072). */
  organization?: string
  /** Grupo / holding al que pertenece (ej. "Grupo HNG"). Clave de unión de la
   *  red profesional: dos personas con el mismo org_group quedan conectadas.
   *  Canonical en `people.org_group` (migration 0072). */
  orgGroup?: string
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

/** Parentesco de una arista de familia persona↔persona.
 *
 *  Valores gendered cuando aplica (madre/padre, hijo/hija, …) — el género del
 *  vínculo permite calcular el rol INVERSO con precisión (ver
 *  lib/relationships/family). 'familiar' es legacy (rows pre-0052 que no
 *  especificaban parentesco); se mantiene para no romper la lectura. 'amigo/a'
 *  modela vínculos no-familiares dentro del mismo grafo de personas. */
export type FamilyKind =
  | 'padre'
  | 'madre'
  | 'hijo'
  | 'hija'
  | 'hermano'
  | 'hermana'
  | 'pareja'
  | 'abuelo'
  | 'abuela'
  | 'tio'
  | 'tia'
  | 'primo'
  | 'prima'
  | 'padrastro'
  | 'madrastra'
  | 'hijastro'
  | 'hijastra'
  | 'medio_hermano'
  | 'medio_hermana'
  | 'amigo'
  | 'amiga'
  | 'otro'
  // legacy (pre-0052): parentesco genérico sin especificar.
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
  // ─── Definición SMART (migración 0042) ──────────────────────────────
  /** Measurable: la métrica/resultado objetivo (ej. "Pesar 75 kg", "Ahorrar S/5000"). */
  target?: string
  /** Measurable: dónde estás hoy respecto del target (ej. "82 kg", "S/1200"). */
  baseline?: string
  /** Relevant: por qué importa este objetivo. */
  why?: string
  // ─── Ancla del año (migración 0060) ─────────────────────────────────
  /** El "norte" del año: brújula anual en Mission Control. Solo uno a la vez
   *  (setear uno desmarca el resto). */
  isAnchor?: boolean
  /** Detalle corto del ancla (ej. "Al Khobar · Taekwondo +80kg"). Opcional:
   *  si está vacío, la brújula deriva el subtítulo del target/descripción. */
  anchorSubtitle?: string
  createdAt: string
  updatedAt: string
}

/** Estado de un paso de objetivo. 'hecho' cuenta como completado en el rollup. */
export type ObjectiveStepStatus = 'pendiente' | 'en_progreso' | 'hecho'

/**
 * Nivel de un nodo del plan OKR (migración 0041):
 *   - 'key_result': resultado clave medible, cuelga del objetivo (parentId null).
 *   - 'task': acción concreta/logística, cuelga de un KR (parentId = KR.id).
 */
export type ObjectiveStepKind = 'key_result' | 'task'

/**
 * Estado de workflow "Jira-light" de una TAREA (migración 0050). Sustituye, para
 * la vista de tarea, al binario hecho/pendiente con 4 estados. NO reemplaza a
 * `ObjectiveStep.status` (que sigue siendo la fuente de verdad del rollup): se
 * mantiene sincronizado con él (done↔hecho, in_progress↔en_progreso,
 * todo/blocked↔pendiente). 'blocked' cuenta como NO-hecho en el rollup.
 *
 * Nullable/back-compat: una tarea pre-0050 no lo trae → la UI deriva el estado
 * efectivo desde su `status` legado (ver effectiveTaskStatus en lib/objectives/steps).
 */
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'

/** Estimación de esfuerzo (camiseta), liviana — sin story points (0050). */
export type TaskEffort = 'S' | 'M' | 'L'

/** Prioridad de una tarea (0050). */
export type TaskPriority = 'low' | 'med' | 'high'

/**
 * Nodo del plan OKR de un objetivo (tabla objective_steps, migración 0040 +
 * 0041). El objetivo (Goal) se descompone en RESULTADOS CLAVE (KRs) medibles, y
 * cada KR en TAREAS concretas (las hojas accionables). El progreso del KR es el
 * rollup de sus tareas; el del objetivo, el rollup de sus KRs.
 *
 * Una misma tabla modela ambos niveles, discriminados por `kind`:
 *   - KR  : kind='key_result', parentId undefined, objectiveId = Goal.id.
 *   - tarea: kind='task',      parentId = KR.id,   objectiveId = Goal.id (denorm).
 */
export interface ObjectiveStep {
  id: string
  /** FK → Goal.id (objective_id en DB, ON DELETE CASCADE). KRs y tareas lo llevan. */
  objectiveId: string
  /** Nivel del nodo. KR vs tarea. Default histórico (0040): 'key_result'. */
  kind: ObjectiveStepKind
  /** FK self → ObjectiveStep.id del KR padre (sólo tareas). undefined = KR. */
  parentId?: string
  title: string
  description?: string
  /** Fecha objetivo opcional (date-only ISO 'YYYY-MM-DD'). Es el "due date". */
  targetDate?: string
  /**
   * Hora del día opcional ('HH:MM' 24h, reloj Lima) — columna `due_time` (0061).
   * Sólo aplica a tareas y sólo tiene sentido junto a `targetDate` (una hora sin
   * fecha no cae en ningún día). Cuando está y la tarea vence HOY, /horario la
   * ubica EN su franja del día (lib/horario/dayPlan); sin hora va a "Vencen hoy".
   */
  dueTime?: string
  status: ObjectiveStepStatus
  /** Orden dentro del grupo de hermanos (KRs entre KRs; tareas dentro de su KR). */
  order: number
  createdAt: string
  /** Fecha/hora ISO de cuándo pasó a 'hecho' (migración 0070). Se setea sola en
   *  el store al completar; null en data vieja → el calendario cae a targetDate. */
  completedAt?: string

  // ─── Campos "Jira-light" de TAREA (migración 0050, todos nullable) ──────
  // Solo aplican a kind='task'. Backward-compatible: ausentes en data vieja.
  /** Definición de hecho verificable ("visa saudí aprobada y en pasaporte"). */
  acceptanceCriteria?: string
  /** Estimación de esfuerzo (camiseta): S / M / L. */
  effort?: TaskEffort
  /** Prioridad: low / med / high. */
  priority?: TaskPriority
  /**
   * Estado de workflow de 4 valores. Si está, prevalece para la VISTA; igual se
   * mantiene `status` en sync para el rollup. Si falta, se deriva de `status`.
   */
  taskStatus?: TaskStatus
  /** IDs de otras tareas del MISMO objetivo que deben completarse antes ("depende de"). */
  blockedBy?: string[]
  // ── Métrica medible del KR (0068). Solo kind='key_result'. Si metricTarget>0,
  //    el progreso del KR = current/target (prioridad sobre el rollup de tareas). ──
  /** Meta numérica del resultado clave (ej. 5000). */
  metricTarget?: number
  /** Valor actual hacia la meta (ej. 3200). */
  metricCurrent?: number
  /** Unidad para mostrar (ej. 'S/', 'kg', 'clientes'). */
  metricUnit?: string
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
  /** Marcada privada/excluida por el usuario (memories.is_private, mig 0064).
   *  Se conserva pero queda FUERA de la vista general y de todo prompt de IA;
   *  la re-derivación suprime equivalentes por firma. Default false/undefined.
   *  getMemoriesForPerson filtra is_private=false → las lecturas de IA no la ven;
   *  sólo getPrivateMemoriesForPerson la trae (con isPrivate=true). */
  isPrivate?: boolean
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

// ─── Seguimiento / Trackers (migración 0051) ──────────────────────────
/**
 * Tipo de condición/umbral de un tracker:
 *   - 'lte'           : se cumple cuando current_value ≤ condition_value
 *                       (ej. "precio del vuelo ≤ 4500").
 *   - 'gte'           : se cumple cuando current_value ≥ condition_value
 *                       (ej. "ahorro ≥ 10000").
 *   - 'days_until_lt' : se cumple cuando faltan menos de condition_value días
 *                       para conditionDate (ej. "faltan < 30 días para el torneo").
 */
export type TrackerConditionKind = 'lte' | 'gte' | 'days_until_lt'

/** De dónde salió un punto de la serie. 'email' queda listo para fase 2 (reenvío). */
export type TrackerPointSource = 'manual_screenshot' | 'manual_text' | 'email'

/**
 * Un TRACKER monitorea en el tiempo una MÉTRICA EXTERNA (un número que no vive
 * en SIR — el precio de un vuelo, un saldo ajeno, días para una fecha) y alerta
 * cuando se cumple su condición. Se engancha a UN item del plan: un objetivo
 * (objectiveId) o un paso/KR/tarea (objectiveStepId). El último valor se
 * denormaliza acá (currentValue) para mostrar el resumen sin leer toda la serie.
 */
export interface Tracker {
  id: string
  /** FK → Goal.id. Set si cuelga de un objetivo. */
  objectiveId?: string
  /** FK → ObjectiveStep.id. Set si cuelga de un KR/tarea. */
  objectiveStepId?: string
  label: string
  /** Unidad de la métrica (ej. "PEN", "USD", "días"). Puede ser ''. */
  unit: string
  /** Último valor leído (denormalizado del último TrackerPoint). */
  currentValue?: number
  /** Fecha (date-only ISO) del último valor. */
  currentValueDate?: string
  conditionKind: TrackerConditionKind
  /** Umbral (lte/gte) o N días (days_until_lt). */
  conditionValue: number
  /** Fecha objetivo (date-only ISO), sólo para days_until_lt. */
  conditionDate?: string
  /** Si la última lectura es más vieja que esto (días), el tracker está "viejo". */
  cadenceDays?: number
  /** Última vez que se agregó/editó un punto (ISO). */
  lastUpdated?: string
  /** Idempotencia del email: última alerta notificada y cuándo. */
  lastAlertKind?: 'met' | 'stale'
  lastAlertAt?: string
  createdAt: string
}

/** Un punto de la serie temporal de un tracker. */
export interface TrackerPoint {
  id: string
  trackerId: string
  value: number
  /** Fecha de la lectura (date-only ISO 'YYYY-MM-DD'). */
  date: string
  source: TrackerPointSource
  note?: string
  createdAt: string
}


// ─── Oportunidades / Deals (pipeline comercial estructurado, migración 0084) ───

export type DealStage =
  | 'lead'          // entró, sin contacto aún
  | 'reunion'       // reunión agendada/hecha
  | 'relevamiento'  // visita técnica / dimensionar
  | 'propuesta'     // propuesta enviada
  | 'negociacion'   // negociando
  | 'ganado'        // cerrado ganado
  | 'perdido'       // cerrado perdido

export type DealStatus = 'open' | 'won' | 'lost' | 'paused'
export type DealImpactType = 'financiero' | 'profesional' | 'relacional' | 'emocional'
export type DealTier = 'chico' | 'mediano' | 'grande'

export interface Deal {
  id: string
  title: string
  /** Empresa que compra (nombre legible). */
  clientOrg?: string
  /** Slug de la empresa para linkear a /empresas/[slug]. */
  clientOrgSlug?: string
  /** person_id del contacto/decisor. */
  contactPersonId?: string
  /** Nuestra entidad que vende (ej. "K2", "Marlab"). */
  seller?: string
  stage: DealStage
  status: DealStatus
  /** Fuente del lead (ej. "Formulario web", "Referido"). */
  source?: string
  /** Ticket estimado. */
  amount?: number
  currency?: string
  tier?: DealTier
  /** Alcance (ej. "5→20 agentes armados"). */
  scope?: string
  /** Ventana de cierre en texto (permite rangos, ej. "jul-ago 2026"). */
  closeWindow?: string
  nextAction?: string
  /** ISO YYYY-MM-DD. */
  nextActionDate?: string
  relatedPersons: string[]
  /** Por qué te importa este deal (puede ser no-financiero). */
  impactTypes: DealImpactType[]
  /** Texto libre: por qué importa / qué te mueve. */
  whyMatters?: string
  /** Personas de TU lado a las que este deal te acerca (ids), distinto del
   *  contacto cliente. Habilita el plus relacional al avanzar. */
  internalStakeholders: string[]
  /** Dossier / notas completas. */
  notes?: string
  createdAt: string
  updatedAt: string
}

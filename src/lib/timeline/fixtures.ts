// SIR V2 — Timeline fixtures (Fase 3a Issue #70)
//
// Mock data realista en español con montos en PEN para validar la UI del
// /timeline sin tocar Supabase real. La conexion real se cablea en Issue #71;
// reemplazar este modulo entero por queries reales.
//
// Edge cases incluidos para validar adapters y hook:
// - Dos eventos con timestamp identico (orden secundario por id).
// - Un item de relationships.history con fecha INVALIDA (debe filtrarse en
//   relational_event adapter, no romper la pagina).
// - Un goal con updatedAt < 60s despues de createdAt (NO debe emitir
//   evento "updated" — solo "created").
// - Un goal con updatedAt > 1 dia despues (SI emite ambos).
// - Strings que matchean busqueda ("Marco", "ansiedad", "reunion").

import type {
  FinancialMovement,
  Goal,
  HealthMetric,
  Memory,
  Person,
  Relationship,
  SelfMetric,
  Signal,
  SleepRecord,
} from '@/types'

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString()
}

function dateDaysAgo(n: number): string {
  return isoDaysAgo(n).split('T')[0]
}

// ─── memories ───────────────────────────────────────────────────────
export const timelineFixtureMemories: Memory[] = [
  {
    id: 'tm_mem_001',
    type: 'episodic',
    title: 'Reunión estratégica con Marco',
    content: 'Marco propuso un acercamiento conjunto al cliente K2. Cerramos plan de 3 fases. Energia alta despues de la conversacion.',
    entities: ['person_001'],
    emotionalCharge: 6,
    importance: 8,
    timestamp: isoDaysAgo(3),
    lastAccessed: isoDaysAgo(1),
    decayRate: 0.05,
    tags: ['marco', 'estrategia', 'trabajo'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_002',
    type: 'emotional',
    title: 'Episodio de ansiedad antes de la presentación',
    content: 'Sentí ansiedad fuerte 30 min antes de la presentación al directorio. Tecnica de respiracion 4-7-8 ayudo. Performance final fue solida.',
    entities: [],
    emotionalCharge: -3,
    importance: 7,
    timestamp: isoDaysAgo(12),
    lastAccessed: isoDaysAgo(5),
    decayRate: 0.05,
    tags: ['ansiedad', 'presentacion', 'aprendizaje'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_003',
    type: 'semantic',
    title: 'Patrón: dormir <6h baja foco al día siguiente',
    content: 'Tres episodios consecutivos confirman correlacion. Cuando duermo menos de 6h, el foco profundo del dia siguiente cae a 4/10 o menos.',
    entities: [],
    emotionalCharge: 0,
    importance: 9,
    timestamp: isoDaysAgo(28),
    lastAccessed: isoDaysAgo(7),
    decayRate: 0.01,
    tags: ['sueno', 'patron', 'salud'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_004',
    type: 'relational',
    title: 'Conversación profunda con Papá sobre legado',
    content: 'Charla larga sobre el negocio familiar. Papa expreso su preocupacion por la sucesion. Quedamos en revisarlo en julio.',
    entities: ['person_003'],
    emotionalCharge: 4,
    importance: 9,
    timestamp: isoDaysAgo(45),
    lastAccessed: isoDaysAgo(20),
    decayRate: 0.02,
    tags: ['familia', 'papa', 'legado'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_005',
    type: 'episodic',
    title: 'Primera reunión con cliente nuevo (LIMA-2)',
    content: 'Reunion presencial. Cliente cauteloso pero interesado. Pidio referencias. Le envie tres contactos al dia siguiente.',
    entities: [],
    emotionalCharge: 2,
    importance: 6,
    timestamp: isoDaysAgo(62),
    lastAccessed: isoDaysAgo(40),
    decayRate: 0.05,
    tags: ['cliente', 'ventas', 'reunion'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_006',
    type: 'predictive',
    title: 'Hipótesis: si cierro Sofia, ingresos cubren 6 meses',
    content: 'Si el deal con Sofia cierra en 4 semanas a tarifa propuesta, el runway financiero mejora a 6 meses sin necesidad de capital externo.',
    entities: ['person_002'],
    emotionalCharge: 3,
    importance: 8,
    timestamp: isoDaysAgo(8),
    lastAccessed: isoDaysAgo(2),
    decayRate: 0.1,
    tags: ['sofia', 'finanzas', 'hipotesis'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_007',
    type: 'episodic',
    title: 'Almuerzo con equipo extendido',
    content: 'Lunch grupal. Buenas conversaciones sobre Q3. Sin compromisos formales, pero senales positivas para colaboraciones futuras.',
    entities: [],
    emotionalCharge: 3,
    importance: 5,
    timestamp: isoDaysAgo(18),
    lastAccessed: isoDaysAgo(10),
    decayRate: 0.05,
    tags: ['equipo', 'networking'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_008',
    type: 'emotional',
    title: 'Recuperación tras semana intensa',
    content: 'Despues de 6 dias de trabajo intenso, el domingo de descanso completo restauro energia. Repetir cada 3-4 semanas.',
    entities: [],
    emotionalCharge: 5,
    importance: 7,
    timestamp: isoDaysAgo(35),
    lastAccessed: isoDaysAgo(35),
    decayRate: 0.05,
    tags: ['descanso', 'energia', 'recuperacion'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_009',
    type: 'semantic',
    title: 'Reuniones de >90 min raramente generan decisiones',
    content: 'Observado en 5+ reuniones recientes. Despues del minuto 90 la energia colectiva cae y se posponen decisiones. Cap a 75 min con agenda clara.',
    entities: [],
    emotionalCharge: -1,
    importance: 7,
    timestamp: isoDaysAgo(55),
    lastAccessed: isoDaysAgo(15),
    decayRate: 0.02,
    tags: ['reuniones', 'patron', 'aprendizaje'],
    relatedMemories: [],
  },
  {
    id: 'tm_mem_010',
    type: 'episodic',
    title: 'Cumpleaños de Sofia',
    content: 'Mensaje breve enviado. Respondio con calidez. Mantener el contacto activo aunque deal no haya cerrado.',
    entities: ['person_002'],
    emotionalCharge: 4,
    importance: 4,
    timestamp: isoDaysAgo(72),
    lastAccessed: isoDaysAgo(72),
    decayRate: 0.05,
    tags: ['sofia', 'relaciones'],
    relatedMemories: [],
  },
]

// ─── self_metrics ───────────────────────────────────────────────────
export const timelineFixtureSelfMetrics: SelfMetric[] = [
  { id: 'tm_sm_001', category: 'energy',     value: 7, timestamp: isoDaysAgo(0),  note: 'Buena mañana de foco profundo.' },
  { id: 'tm_sm_002', category: 'stress',     value: 4, timestamp: isoDaysAgo(0)                                            },
  { id: 'tm_sm_003', category: 'energy',     value: 4, timestamp: isoDaysAgo(2),  note: 'Cansado tras la reunion larga.'   },
  { id: 'tm_sm_004', category: 'mood',       value: 6, timestamp: isoDaysAgo(5)                                            },
  { id: 'tm_sm_005', category: 'focus',      value: 3, timestamp: isoDaysAgo(13), note: 'Distraido por ansiedad.'           },
  { id: 'tm_sm_006', category: 'motivation', value: 8, timestamp: isoDaysAgo(20), note: 'Subida tras conversacion con Marco.' },
  { id: 'tm_sm_007', category: 'confidence', value: 7, timestamp: isoDaysAgo(40)                                           },
  { id: 'tm_sm_008', category: 'energy',     value: 6, timestamp: isoDaysAgo(60)                                           },
]

// ─── health_metrics ─────────────────────────────────────────────────
export const timelineFixtureHealthMetrics: HealthMetric[] = [
  { id: 'tm_hm_001', type: 'weight', value: 78.4, unit: 'kg',    timestamp: isoDaysAgo(0)                              },
  { id: 'tm_hm_002', type: 'weight', value: 79.1, unit: 'kg',    timestamp: isoDaysAgo(30)                             },
  { id: 'tm_hm_003', type: 'steps',  value: 8423, unit: 'steps', timestamp: isoDaysAgo(1), note: 'Caminata larga PM.' },
]

// ─── sleep_records ──────────────────────────────────────────────────
export const timelineFixtureSleepRecords: SleepRecord[] = [
  { id: 'tm_sl_001', date: dateDaysAgo(0),  bedtime: '23:30', wakeTime: '07:15', duration: 7.75, quality: 8, dreams: 'Volaba sobre Lima' },
  { id: 'tm_sl_002', date: dateDaysAgo(1),  bedtime: '01:00', wakeTime: '07:00', duration: 6.0,  quality: 5,                            },
  { id: 'tm_sl_003', date: dateDaysAgo(2),  bedtime: '23:00', wakeTime: '07:30', duration: 8.5,  quality: 9, notes: 'Sueño profundo.'   },
  { id: 'tm_sl_004', date: dateDaysAgo(7),  bedtime: '00:30', wakeTime: '06:00', duration: 5.5,  quality: 4, notes: 'Cansado al despertar.' },
  { id: 'tm_sl_005', date: dateDaysAgo(15), bedtime: '22:30', wakeTime: '06:45', duration: 8.25, quality: 8,                            },
  { id: 'tm_sl_006', date: dateDaysAgo(28), bedtime: '23:15', wakeTime: '07:00', duration: 7.75, quality: 7,                            },
]

// ─── finance_movements ──────────────────────────────────────────────
export const timelineFixtureFinanceMovements: FinancialMovement[] = [
  { id: 'tm_fm_001', type: 'expense',    amount: 35,    currency: 'PEN', exchangeRate: 1.0, amountPEN: 35,    category: 'food',          description: 'Almuerzo con Marco',          date: dateDaysAgo(3),  recurrent: false, tags: ['marco']         },
  { id: 'tm_fm_002', type: 'expense',    amount: 120,   currency: 'PEN', exchangeRate: 1.0, amountPEN: 120,   category: 'food',          description: 'Mercado semanal',             date: dateDaysAgo(6),  recurrent: false, tags: []                 },
  { id: 'tm_fm_003', type: 'income',     amount: 3500,  currency: 'PEN', exchangeRate: 1.0, amountPEN: 3500,  category: 'business',      description: 'Consultoria proyecto LIMA-2', date: dateDaysAgo(10), recurrent: false, tags: ['cliente']        },
  { id: 'tm_fm_004', type: 'expense',    amount: 1500,  currency: 'PEN', exchangeRate: 1.0, amountPEN: 1500,  category: 'housing',       description: 'Alquiler abril',              date: dateDaysAgo(15), recurrent: true,  recurrentPeriod: 'monthly', tags: ['fijo']  },
  { id: 'tm_fm_005', type: 'investment', amount: 800,   currency: 'PEN', exchangeRate: 1.0, amountPEN: 800,   category: 'investment',    description: 'Compra ETF mensual',          date: dateDaysAgo(20), recurrent: true,  recurrentPeriod: 'monthly', tags: ['inversion'] },
  { id: 'tm_fm_006', type: 'expense',    amount: 65,    currency: 'PEN', exchangeRate: 1.0, amountPEN: 65,    category: 'transport',     description: 'Gasolina',                    date: dateDaysAgo(25), recurrent: false, tags: []                 },
  { id: 'tm_fm_007', type: 'expense',    amount: 180,   currency: 'USD', exchangeRate: 3.75, amountPEN: 675,  category: 'business',      description: 'Suscripcion herramientas',    date: dateDaysAgo(40), recurrent: true,  recurrentPeriod: 'monthly', tags: ['saas']  },
  { id: 'tm_fm_008', type: 'expense',    amount: 95,    currency: 'PEN', exchangeRate: 1.0, amountPEN: 95,    category: 'health',        description: 'Farmacia',                    date: dateDaysAgo(50), recurrent: false, tags: []                 },
]

// ─── signals ────────────────────────────────────────────────────────
export const timelineFixtureSignals: Signal[] = [
  { id: 'tm_sig_001', source: 'linkedin', type: 'opportunity', content: 'Sofia Vega publicó: "buscamos consultor senior para Q3"', strength: 8, urgency: 'soon',      relatedPersons: ['person_002'], relatedGoals: ['goal_002'], meaning: 'Timing favorable para enviar propuesta.', actionRequired: true,  suggestedAction: 'Enviar propuesta en 48h',   detectedAt: isoDaysAgo(2),  resolved: false },
  { id: 'tm_sig_002', source: 'biological', type: 'biological', content: 'Sueño promedio últimos 7 días: 6.8h',                       strength: 6, urgency: 'monitor',   relatedPersons: [],            relatedGoals: [],            meaning: 'Acercandose a umbral de deuda de sueno.', actionRequired: false,                                  detectedAt: isoDaysAgo(5),  resolved: false },
  { id: 'tm_sig_003', source: 'manual',   type: 'pattern',     content: 'Pico de ansiedad antes de cada presentación al directorio', strength: 7, urgency: 'soon',      relatedPersons: [],            relatedGoals: [],            meaning: 'Patrón consistente. Preparar protocolo.', actionRequired: true,  suggestedAction: 'Crear ritual pre-presentacion', detectedAt: isoDaysAgo(11), resolved: true  },
  { id: 'tm_sig_004', source: 'relational', type: 'relational', content: 'Sin contacto con Marco hace 18 días',                        strength: 5, urgency: 'soon',      relatedPersons: ['person_001'], relatedGoals: [],            meaning: 'Silencio inusual en inner circle.',         actionRequired: true,                                    detectedAt: isoDaysAgo(33), resolved: false },
]

// ─── goals ──────────────────────────────────────────────────────────
// goal_001: updated >>1 dia despues de creado => adapter emite "created" + "updated"
// goal_002: updated <60s despues de creado => adapter emite SOLO "created" (R10 ADR 0005)
export const timelineFixtureGoals: Goal[] = [
  {
    id: 'tm_goal_001',
    title: 'Cerrar contrato Sofia Vega',
    description: 'Primer contrato de consultoria con Sofia.',
    category: 'career',
    priority: 'high',
    status: 'active',
    targetDate: dateDaysAgo(-14),
    progress: 45,
    milestones: [],
    relatedGoals: [],
    relatedPersons: ['person_002'],
    peaceImpact: 6,
    obstacles: ['propuesta no enviada'],
    nextAction: 'Enviar propuesta hoy',
    createdAt: isoDaysAgo(40),
    updatedAt: isoDaysAgo(5), // 35 dias despues — diff significativo
  },
  {
    id: 'tm_goal_002',
    title: 'Lanzar Fase 3a del Life OS',
    description: 'Vista timeline operativa.',
    category: 'personal',
    priority: 'medium',
    status: 'active',
    progress: 10,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 4,
    obstacles: [],
    nextAction: 'Implementar issue #70',
    createdAt: isoDaysAgo(22),
    // updatedAt = createdAt + 30s — el adapter NO debe emitir "updated"
    updatedAt: new Date(new Date(isoDaysAgo(22)).getTime() + 30_000).toISOString(),
  },
]

// ─── people ─────────────────────────────────────────────────────────
export const timelineFixturePeople: Person[] = [
  {
    id: 'tm_p_001',
    name: 'Marco Rodríguez',
    alias: 'Marco',
    relationship: 'friend',
    category: 'inner_circle',
    importanceScore: 9,
    energyImpact: 'energizing',
    trustLevel: 9,
    contactFrequency: 'weekly',
    location: 'Lima',
    tags: ['mentor'],
    notes: '',
    createdAt: isoDaysAgo(80),
    updatedAt: isoDaysAgo(3),
  },
  {
    id: 'tm_p_002',
    name: 'Sofía Vega',
    alias: 'Sofía',
    relationship: 'professional',
    category: 'close',
    importanceScore: 7,
    energyImpact: 'neutral',
    trustLevel: 6,
    contactFrequency: 'weekly',
    location: 'Lima',
    tags: ['cliente'],
    notes: '',
    createdAt: isoDaysAgo(50),
    updatedAt: isoDaysAgo(10),
  },
  {
    id: 'tm_p_003',
    name: 'Carolina Espinoza',
    alias: 'Caro',
    relationship: 'professional',
    category: 'network',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: 'monthly',
    location: 'Cusco',
    tags: ['networking'],
    notes: '',
    createdAt: isoDaysAgo(20),
    updatedAt: isoDaysAgo(20),
  },
]

// ─── relationships (history items) ─────────────────────────────────
// Incluye un history item con fecha INVALIDA — el adapter debe filtrarlo.
export const timelineFixtureRelationships: Relationship[] = [
  {
    id: 'tm_rel_001',
    personId: 'tm_p_001',
    type: 'friend',
    status: 'active',
    depth: 9,
    reciprocity: 8,
    history: [
      { id: 'evt_001', description: 'Café largo después del trabajo', emotionalTone: 7,  date: isoDaysAgo(3),  type: 'positive' },
      { id: 'evt_002', description: 'Recomendación de libro útil',     emotionalTone: 3,  date: isoDaysAgo(28), type: 'neutral'  },
      // ↓ FECHA INVALIDA — el adapter debe loggear warning y skipear
      { id: 'evt_invalid', description: 'Evento con fecha rota',       emotionalTone: 0,  date: 'hace 3 dias',  type: 'neutral'  },
    ],
    sharedGoals: [],
    tensions: [],
    strengths: ['confianza'],
    nextAction: 'Actualizar sobre K2',
  },
  {
    id: 'tm_rel_002',
    personId: 'tm_p_002',
    type: 'professional',
    status: 'active',
    depth: 5,
    reciprocity: 5,
    history: [
      { id: 'evt_003', description: 'Reunión inicial sobre proyecto Q3', emotionalTone: 4, date: isoDaysAgo(50), type: 'milestone' },
      { id: 'evt_004', description: 'Tensión sobre alcance de propuesta', emotionalTone: -4, date: isoDaysAgo(38), type: 'negative' },
    ],
    sharedGoals: ['tm_goal_001'],
    tensions: [],
    strengths: [],
    nextAction: 'Enviar propuesta',
  },
]

/**
 * Trigger de fallo deliberado para validar la UI de partial failure sin tocar
 * Supabase real. Si el `search` filtra exactamente esta string, el query layer
 * fallara los types listados aqui. Reemplazable en QA via cambio en consola.
 */
export const FIXTURE_FAILURE_TRIGGER = '__fail__'
export const FIXTURE_FAILED_TYPES_ON_TRIGGER = ['signal', 'finance'] as const

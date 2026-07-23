// SIR V2 — Tools que puede llamar Claude cuando estructura un relato en prosa.
//
// El endpoint POST /api/relato/ingest le pasa a Claude:
//   - System prompt con la lista de nombres COMPLETOS ya en la red de Aaron
//     (para que use apellidos y desambigüe).
//   - El texto crudo.
//   - Estos tools.
// Claude devuelve N `tool_use` con acciones. El plan es CANDIDATO — no se
// ejecuta hasta que Aaron aprieta "Aplicar" en la UI.
//
// Regla de oro: NUNCA hacer lookup por primer nombre suelto. El tool
// `person_full_name` es obligatorio; si Claude no sabe el apellido debe
// llamar a `flag_ambiguo` y no crear nada.

export const INGEST_TOOLS = [
  {
    name: 'crear_moment',
    description:
      'Crear un episodio relacional (pelea, encuentro, decisión, follow-up médico, etc.) ' +
      'con una persona identificada por nombre completo. Usa status="abierto" cuando queda ' +
      'algo pendiente (con follow_up_on si Aaron mencionó fecha) y "resuelto" cuando el ' +
      'evento cerró en el mismo día.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string', description: 'NOMBRE COMPLETO (nombre + al menos un apellido). Si no sabes el apellido, usa flag_ambiguo.' },
        title: { type: 'string', description: 'Título corto del episodio (≤80 chars).' },
        detail: { type: 'string', description: 'Detalle 2-4 líneas de qué pasó.' },
        occurred_on: { type: 'string', description: 'Fecha del evento, YYYY-MM-DD.' },
        status: { type: 'string', enum: ['abierto', 'resuelto'] },
        follow_up_on: { type: 'string', description: 'YYYY-MM-DD si status=abierto y hay fecha explícita para retomar. Opcional.' },
        resolution: { type: 'string', description: 'Si status=resuelto: 1-2 líneas de cómo cerró.' },
      },
      required: ['person_full_name', 'title', 'occurred_on', 'status'],
    },
  },
  {
    name: 'crear_person_log',
    description:
      'Registrar el tono / cómo se sintió Aaron durante una interacción con una persona ' +
      'específica. Escala 1..5 (1=muy mal, 3=neutro, 5=muy bien). Kind="interaction" para ' +
      'la mayoría de casos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        kind: { type: 'string', enum: ['interaction', 'mood', 'energy'] },
        value: { type: 'integer', description: 'Tono 1..5 — DISCRIMINA, NO metas 3 por defecto: 1=muy mal (pelea, corte, tensión fuerte), 2=tenso/incómodo, 3=neutro/rutinario (SOLO si de verdad no hubo carga), 4=cálido/buena, 5=excelente/muy conectados. Lee la señal en lo que Aaron cuenta: "le molestó"→2, "buena charla / buen humor"→4, "hermoso día juntos"→5, "pelea fea"→1.' },
        note: { type: 'string', description: 'Nota breve.' },
        logged_at: { type: 'string', description: 'ISO 8601 con TZ. Si Aaron dice solo la fecha, pon 20:00 Lima (-05:00).' },
      },
      required: ['person_full_name', 'kind', 'value', 'logged_at'],
    },
  },
  {
    name: 'crear_nota_manual',
    description:
      'Guardar una observación libre sobre una persona (resumen semanal, contexto general, ' +
      'algo que no es un episodio con follow-up). Usar SOLO 1 nota por relato como cierre; ' +
      'los eventos concretos van como moments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        text: { type: 'string', description: 'Resumen prosa 3-6 líneas.' },
        observed_at: { type: 'string', description: 'ISO 8601 (default: hoy).' },
      },
      required: ['person_full_name', 'text', 'observed_at'],
    },
  },
  {
    name: 'upsert_cumpleanos',
    description: 'Agregar/actualizar el cumpleaños de una persona.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD. El año puede ser cualquiera; se toma día+mes.' },
      },
      required: ['person_full_name', 'date'],
    },
  },
  {
    name: 'crear_objetivo',
    description:
      'Crear un objetivo NUEVO cuando Aaron enuncia algo que quiere lograr en el futuro ' +
      '("quiero mudarme antes de agosto", "el mundial en noviembre"). NO uses esto para ' +
      'reportar hechos ya cerrados (eso es crear_moment). Categoría según el dominio ' +
      '(personal/relational/financial/health/career/spiritual/creative).',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Título del objetivo en 2-6 palabras.' },
        category: { type: 'string', enum: ['financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative'] },
        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'critical si Aaron dice "urgente/prioritario"; high si "importante"; medium default.' },
        target_date: { type: 'string', description: 'YYYY-MM-DD si Aaron mencionó fecha.' },
        next_step: { type: 'string', description: 'Próximo paso concreto en una frase corta.' },
      },
      required: ['title', 'category'],
    },
  },
  {
    name: 'crear_persona',
    description:
      'Crear una persona nueva en la red cuando Aaron menciona a alguien que NO está en la lista de personas ya conocidas. Usa esto cuando el relato introduce a alguien con nombre completo por primera vez. NO uses esto si la persona ya existe.',
    input_schema: {
      type: 'object' as const,
      properties: {
        full_name: { type: 'string', description: 'Nombre completo (mínimo 2 tokens).' },
        relationship: { type: 'string', enum: ['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance'], description: 'Tipo de vínculo según el contexto.' },
        category: { type: 'string', enum: ['inner_circle', 'close', 'network', 'peripheral'], description: 'Cercanía. Default "network".' },
        notes: { type: 'string', description: 'Notas iniciales (1-2 líneas de contexto).' },
      },
      required: ['full_name', 'relationship'],
    },
  },
  {
    name: 'crear_recordatorio',
    description:
      'Crear un recordatorio agendado cuando Aaron dice "recordame X en Y días" / "en Z horas" / ' +
      '"el viernes a las 15" / "mañana" / "la semana que viene". SIR agenda + dispara push cuando ' +
      'llega el momento. Si menciona una persona, incluye person_full_name para deep-link.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'Qué hay que recordar, en 1-2 líneas.' },
        due_at: { type: 'string', description: 'Timestamp ISO 8601 con TZ (ej. 2026-07-05T15:00:00-05:00). Si Aaron dice "mañana a las 15" y hoy es 2026-07-03, pon 2026-07-04T15:00:00-05:00. Si dice solo "mañana" sin hora, usa 09:00 de Lima.' },
        person_full_name: { type: 'string', description: 'Opcional. Nombre completo si el recordatorio es sobre alguien.' },
      },
      required: ['text', 'due_at'],
    },
  },
  {
    name: 'registrar_ciclo',
    description:
      'Registrar UN DÍA del ciclo menstrual de una persona (típicamente la pareja) cuando Aaron ' +
      'lo menciona en el relato. Usa phase="bleeding" cuando dice "estaba con la regla", "tenía ' +
      'un resto de regla", "sangrando". "pms" cuando menciona síntomas premenstruales. "unknown" ' +
      'si Aaron dice que ella está en ciertos días sin saber la fase exacta. Un evento = un día; ' +
      'si dice "el lunes todavía tenía regla" y también "el domingo", crea 2 acciones separadas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_full_name: { type: 'string', description: 'NOMBRE COMPLETO de la persona.' },
        date: { type: 'string', description: 'YYYY-MM-DD del día registrado.' },
        phase: {
          type: 'string',
          enum: ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown'],
          description: 'Fase estimada. Default "bleeding" si Aaron habla de sangrado/regla.',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'high si Aaron confirma; medium si infiere; low si estimación gruesa. Default medium.',
        },
        note: { type: 'string', description: 'Nota corta opcional (ej. "resto de regla", "primer día").' },
      },
      required: ['person_full_name', 'date', 'phase'],
    },
  },
  {
    name: 'registrar_aprendizaje',
    description:
      'Registrar una LECCIÓN DURABLE y GENERAL sobre Aaron (no sobre otra persona, no un evento ' +
      'puntual). Úsala cuando Aaron enuncia una preferencia estable ("prefiero findes largos para ' +
      'viajar"), un patrón propio ("cuando duermo menos de 6h me irrito"), un principio o prioridad ' +
      'del período ("este año el Mundial va antes que todo") o un hecho estable sobre él. Es memoria ' +
      'que SIR va a APLICAR al aconsejar más adelante. NO la uses para hechos de una sola vez (eso es ' +
      'crear_moment) ni para cosas de otra persona. Fraséalo en tercera persona, corto y accionable.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'La lección, corta y en tercera persona ("Aaron prefiere…", "A Aaron le pasa que…").' },
        kind: {
          type: 'string',
          enum: ['preference', 'pattern', 'principle', 'fact'],
          description: 'preference (le gusta/prefiere), pattern (le pasa que…), principle (regla/prioridad que sostiene), fact (hecho estable).',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'high si Aaron lo afirma explícito; medium si lo infieres del relato. Default medium.',
        },
      },
      required: ['text', 'kind'],
    },
  },
  {
    name: 'avanzar_objetivo',
    description:
      'Avanzar/completar un PASO de una meta u objetivo EXISTENTE de Aaron cuando el relato ' +
      'muestra que un hito se cumplió o quedó agendado (ej: "ya salió la programación de mi ' +
      'examen médico para el mundial" → avanza el paso "examen médico" de la meta al mundial). ' +
      'Identifica la meta por su TÍTULO (match aproximado sobre las metas de Aaron). Si el paso ' +
      'no existe todavía, se crea ya marcado como hecho. NO uses esto para crear una meta nueva ' +
      '(eso es crear_objetivo).',
    input_schema: {
      type: 'object' as const,
      properties: {
        goal_title: { type: 'string', description: 'Título (o parte clara) de la meta existente, ej. "Mundial de Bomberos".' },
        step_title: { type: 'string', description: 'El paso/hito a avanzar, en pocas palabras, ej. "Examen médico programado".' },
        done: { type: 'boolean', description: 'true si el paso quedó CUMPLIDO; false si solo avanzó pero sigue en progreso. Default true.' },
      },
      required: ['goal_title', 'step_title'],
    },
  },
  {
    name: 'crear_evento_calendario',
    description:
      'Crear un evento REAL en el Google Calendar de Aaron cuando el relato trae una cita/fecha ' +
      'concreta con hora (examen médico, reunión, viaje, cita). Distinto de crear_recordatorio ' +
      '(que es un aviso interno): esto agenda en su calendario de Google. Usa hora exacta si la ' +
      'hay; si solo hay día, marca all_day=true. Zona horaria Lima (-05:00).',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Título del evento (≤120 chars).' },
        start: { type: 'string', description: 'Inicio: ISO 8601 con TZ (ej. 2026-08-15T09:00:00-05:00) si hay hora, o YYYY-MM-DD si es todo el día.' },
        end: { type: 'string', description: 'Fin opcional (mismo formato que start). Si falta y hay hora, se asume +1h; si es all-day, ese día.' },
        all_day: { type: 'boolean', description: 'true si es de día completo (sin hora).' },
        location: { type: 'string', description: 'Lugar opcional.' },
        description: { type: 'string', description: 'Detalle/nota opcional del evento.' },
      },
      required: ['title', 'start'],
    },
  },
  {
    name: 'flag_ambiguo',
    description:
      'Cuando Aaron menciona SOLO el primer nombre y hay ambigüedad (o no sabes el apellido), ' +
      'llama esta tool para pedirle que aclare. NO crees moments/logs/notas sin apellido — ' +
      'usar esta tool en su lugar. Aaron va a corregir el relato y reenviarlo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        short_name: { type: 'string', description: 'Nombre corto mencionado (ej. "Diana").' },
        context_hint: { type: 'string', description: 'Contexto que da Aaron (afectivo, trabajo, familiar…) — opcional.' },
        options_seen: { type: 'array', items: { type: 'string' }, description: 'Nombres completos conocidos que colisionan (si puedes listar).' },
      },
      required: ['short_name'],
    },
  },
] as const

// ─── Tipos de las acciones ya validadas (post-parse) ────────────────

export type CyclePhase = 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'
export type CycleConfidence = 'high' | 'medium' | 'low'

export type GoalCategoryEnum = 'financial' | 'personal' | 'relational' | 'health' | 'career' | 'spiritual' | 'creative'
export type GoalPriorityEnum = 'critical' | 'high' | 'medium' | 'low'
export type PersonRelationshipEnum = 'family' | 'friend' | 'romantic' | 'professional' | 'mentor' | 'mentee' | 'acquaintance'
export type PersonCategoryEnum = 'inner_circle' | 'close' | 'network' | 'peripheral'

export type IngestAction =
  | { kind: 'crear_moment'; personFullName: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; followUpOn?: string; resolution?: string }
  | { kind: 'crear_person_log'; personFullName: string; logKind: 'interaction' | 'mood' | 'energy'; value: number; note: string; loggedAt: string }
  | { kind: 'crear_nota_manual'; personFullName: string; text: string; observedAt: string }
  | { kind: 'upsert_cumpleanos'; personFullName: string; date: string }
  | { kind: 'registrar_ciclo'; personFullName: string; date: string; phase: CyclePhase; confidence: CycleConfidence; note?: string }
  | { kind: 'crear_objetivo'; title: string; category: GoalCategoryEnum; priority: GoalPriorityEnum; targetDate?: string; nextStep?: string }
  | { kind: 'crear_persona'; fullName: string; relationship: PersonRelationshipEnum; category: PersonCategoryEnum; notes?: string }
  | { kind: 'crear_recordatorio'; text: string; dueAt: string; personFullName?: string }
  | { kind: 'registrar_aprendizaje'; text: string; learningKind: LearningKind; confidence: CycleConfidence }
  | { kind: 'avanzar_objetivo'; goalTitle: string; stepTitle: string; done: boolean }
  | { kind: 'crear_evento_calendario'; title: string; start: string; end?: string; allDay: boolean; location?: string; description?: string }
  | { kind: 'flag_ambiguo'; shortName: string; contextHint?: string; optionsSeen?: string[] }

export type LearningKind = 'preference' | 'pattern' | 'principle' | 'fact'

interface RawToolUse { name: string; input: Record<string, unknown> }

function str(v: unknown, max = 400): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function ymd(v: unknown): string | null {
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}
function iso(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
function intBetween(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? Math.round(v) : Number.parseInt(String(v ?? ''), 10)
  if (Number.isNaN(n) || n < lo || n > hi) return null
  return n
}

/** Valida un tool_use crudo y devuelve la acción normalizada o null si algo
 *  falla (nombre corto, sin apellido, fecha inválida). Nunca throw. */
export function parseToolUse(raw: RawToolUse): IngestAction | null {
  const i = raw.input ?? {}
  switch (raw.name) {
    case 'crear_moment': {
      const name = requireFullName(i.person_full_name)
      const title = str(i.title, 200)
      const occurredOn = ymd(i.occurred_on)
      const status = i.status === 'abierto' || i.status === 'resuelto' ? i.status : null
      if (!name || !title || !occurredOn || !status) return null
      return {
        kind: 'crear_moment', personFullName: name, title,
        detail: str(i.detail, 2000) ?? '',
        occurredOn, status,
        followUpOn: ymd(i.follow_up_on) ?? undefined,
        resolution: str(i.resolution, 1000) ?? undefined,
      }
    }
    case 'crear_person_log': {
      const name = requireFullName(i.person_full_name)
      const kind = i.kind === 'interaction' || i.kind === 'mood' || i.kind === 'energy' ? i.kind : null
      const value = intBetween(i.value, 1, 5)
      const loggedAt = iso(i.logged_at)
      if (!name || !kind || value == null || !loggedAt) return null
      return {
        kind: 'crear_person_log', personFullName: name, logKind: kind, value,
        note: str(i.note, 500) ?? '',
        loggedAt,
      }
    }
    case 'crear_nota_manual': {
      const name = requireFullName(i.person_full_name)
      const text = str(i.text, 4000)
      const observedAt = iso(i.observed_at) ?? new Date().toISOString()
      if (!name || !text) return null
      return { kind: 'crear_nota_manual', personFullName: name, text, observedAt }
    }
    case 'upsert_cumpleanos': {
      const name = requireFullName(i.person_full_name)
      const date = ymd(i.date)
      if (!name || !date) return null
      return { kind: 'upsert_cumpleanos', personFullName: name, date }
    }
    case 'registrar_ciclo': {
      const name = requireFullName(i.person_full_name)
      const date = ymd(i.date)
      const validPhases: CyclePhase[] = ['bleeding', 'pms', 'mid_cycle', 'ovulation', 'luteal', 'unknown']
      const phase = validPhases.includes(i.phase as CyclePhase) ? (i.phase as CyclePhase) : null
      const validConf: CycleConfidence[] = ['high', 'medium', 'low']
      const confidence = validConf.includes(i.confidence as CycleConfidence) ? (i.confidence as CycleConfidence) : 'medium'
      if (!name || !date || !phase) return null
      return { kind: 'registrar_ciclo', personFullName: name, date, phase, confidence, note: str(i.note, 500) ?? undefined }
    }
    case 'crear_objetivo': {
      const title = str(i.title, 200)
      const validCats: GoalCategoryEnum[] = ['financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative']
      const category = validCats.includes(i.category as GoalCategoryEnum) ? (i.category as GoalCategoryEnum) : null
      const validPrios: GoalPriorityEnum[] = ['critical', 'high', 'medium', 'low']
      const priority = validPrios.includes(i.priority as GoalPriorityEnum) ? (i.priority as GoalPriorityEnum) : 'medium'
      if (!title || !category) return null
      return {
        kind: 'crear_objetivo', title, category, priority,
        targetDate: ymd(i.target_date) ?? undefined,
        nextStep: str(i.next_step, 400) ?? undefined,
      }
    }
    case 'crear_persona': {
      const fullName = requireFullName(i.full_name)
      const validRels: PersonRelationshipEnum[] = ['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance']
      const relationship = validRels.includes(i.relationship as PersonRelationshipEnum) ? (i.relationship as PersonRelationshipEnum) : null
      const validCats: PersonCategoryEnum[] = ['inner_circle', 'close', 'network', 'peripheral']
      const category = validCats.includes(i.category as PersonCategoryEnum) ? (i.category as PersonCategoryEnum) : 'network'
      if (!fullName || !relationship) return null
      return {
        kind: 'crear_persona', fullName, relationship, category,
        notes: str(i.notes, 500) ?? undefined,
      }
    }
    case 'crear_recordatorio': {
      const text = str(i.text, 500)
      const dueAt = iso(i.due_at)
      if (!text || !dueAt) return null
      const personFullName = requireFullName(i.person_full_name) ?? undefined
      return { kind: 'crear_recordatorio', text, dueAt, personFullName }
    }
    case 'registrar_aprendizaje': {
      const text = str(i.text, 500)
      const lk = i.kind
      const learningKind: LearningKind | null =
        lk === 'preference' || lk === 'pattern' || lk === 'principle' || lk === 'fact' ? lk : null
      if (!text || !learningKind) return null
      const confidence: CycleConfidence = i.confidence === 'high' || i.confidence === 'low' ? i.confidence : 'medium'
      return { kind: 'registrar_aprendizaje', text, learningKind, confidence }
    }
    case 'avanzar_objetivo': {
      const goalTitle = str(i.goal_title, 200)
      const stepTitle = str(i.step_title, 200)
      if (!goalTitle || !stepTitle) return null
      const done = i.done === false ? false : true // default true
      return { kind: 'avanzar_objetivo', goalTitle, stepTitle, done }
    }
    case 'crear_evento_calendario': {
      const title = str(i.title, 200)
      const start = str(i.start, 40)
      // start válido: YYYY-MM-DD (all-day) o ISO parseable (cronometrado).
      const startOk = start && (/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isNaN(new Date(start).getTime()))
      if (!title || !start || !startOk) return null
      const allDay = i.all_day === true || /^\d{4}-\d{2}-\d{2}$/.test(start)
      const end = str(i.end, 40) ?? undefined
      return {
        kind: 'crear_evento_calendario', title, start, end, allDay,
        location: str(i.location, 200) ?? undefined,
        description: str(i.description, 1000) ?? undefined,
      }
    }
    case 'flag_ambiguo': {
      const short = str(i.short_name, 100)
      if (!short) return null
      return {
        kind: 'flag_ambiguo', shortName: short,
        contextHint: str(i.context_hint, 200) ?? undefined,
        optionsSeen: Array.isArray(i.options_seen) ? (i.options_seen as unknown[]).map((x) => String(x).slice(0, 100)).filter(Boolean) : undefined,
      }
    }
    default: return null
  }
}

/** Nombre completo = 2+ tokens no genéricos. Si trae solo 1 → null. */
export function requireFullName(v: unknown): string | null {
  const s = str(v, 200)
  if (!s) return null
  const tokens = s.split(/\s+/).filter((t) => t.length >= 2)
  if (tokens.length < 2) return null
  return s
}

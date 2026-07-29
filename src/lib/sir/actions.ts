// SIR V2 — SIR conversacional (#86) · PR2 ACCIONES CON CONFIRMACIÓN.
// Módulo puro: definiciones de las tools que el modelo puede PROPONER + el
// parser/validador de la propuesta. NO ejecuta nada (la ejecución la hace el
// cliente al confirmar). Regla de oro: el chat PROPONE, Aaron CONFIRMA, recién
// ahí se escribe. Nunca escritura silenciosa.

import type { GoalCategory, GoalPriority, RelationshipType, PersonCategory } from '@/types'

const GOAL_CATEGORIES: readonly GoalCategory[] = [
  'financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative',
]
const GOAL_PRIORITIES: readonly GoalPriority[] = ['critical', 'high', 'medium', 'low']
const REL_TYPES: readonly RelationshipType[] = ['family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance']
const PERSON_CATEGORIES: readonly PersonCategory[] = ['inner_circle', 'close', 'network', 'peripheral']

/** Definiciones de tools para Anthropic (input_schema JSON Schema). */
export const SIR_ACTION_TOOLS = [
  {
    name: 'proponer_registrar_interaccion',
    description:
      'Propón registrar una interacción con una persona (NO la registres tú, solo propónla para que Aaron confirme). Usa esto cuando Aaron pide registrar/anotar que habló o se vio con alguien y cómo estuvo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        persona: { type: 'string', description: 'Nombre de la persona tal como Aaron la nombró.' },
        calidad: { type: 'integer', description: 'Calidad del encuentro 1 (muy mala) a 5 (excelente).' },
        nota: { type: 'string', description: 'Resumen breve de qué pasó.' },
      },
      required: ['persona', 'calidad'],
    },
  },
  {
    name: 'proponer_crear_objetivo',
    description:
      'Propón crear un objetivo (NO lo crees tú, solo propónlo para que Aaron confirme). Usa esto cuando Aaron quiere fijar una meta. NO inventes fecha límite.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string' },
        categoria: { type: 'string', enum: GOAL_CATEGORIES as unknown as string[] },
        prioridad: { type: 'string', enum: GOAL_PRIORITIES as unknown as string[] },
        proximo_paso: { type: 'string' },
        impacto_paz: { type: 'integer', description: '1-10: cuánta paz/alineación aporta.' },
        persona_relacionada: { type: 'string', description: 'Opcional: persona ligada al objetivo.' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'proponer_crear_persona',
    description:
      'Propón crear una persona nueva en la red de Aaron (NO la crees tú, solo propónla para que confirme). Usa esto cuando Aaron quiere agregar/dar de alta a alguien que todavía no está.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre de la persona.' },
        relacion: { type: 'string', enum: REL_TYPES as unknown as string[], description: 'Tipo de vínculo.' },
        categoria: { type: 'string', enum: PERSON_CATEGORIES as unknown as string[], description: 'Cercanía: inner_circle/close/network/peripheral.' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'proponer_marcar_habito',
    description:
      'Propón marcar un hábito del día como HECHO (NO lo marques tú, solo propónlo para que Aaron confirme). Usa esto cuando Aaron dice que hizo/completó un hábito ("ya medité", "hice la cama", "leí"). El nombre debe ser el del hábito tal como Aaron lo nombró.',
    input_schema: {
      type: 'object' as const,
      properties: {
        habito: { type: 'string', description: 'Nombre del hábito tal como Aaron lo nombró (ej. "meditar", "leer 20 min").' },
      },
      required: ['habito'],
    },
  },
  {
    name: 'proponer_marcar_tarea',
    description:
      'Propón marcar una TAREA o paso de un objetivo como HECHO (NO la marques tú, solo propónla para que Aaron confirme). Usa esto cuando Aaron dice que terminó/completó una tarea concreta ("ya saqué la visa", "terminé el informe", "mandé la cotización"). El nombre debe ser el de la tarea tal como Aaron la nombró.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarea: { type: 'string', description: 'Nombre de la tarea/paso tal como Aaron la nombró (ej. "sacar la visa", "informe trimestral").' },
      },
      required: ['tarea'],
    },
  },
  {
    name: 'proponer_crear_plan',
    description:
      'Propón AGENDAR un plan/cita/evento (NO lo agendes tú, solo propónlo para que Aaron confirme). Usa esto SIEMPRE que Aaron pida agendar/anotar una cita, salida, visita o plan a futuro (ej. "agéndame ver el depa con Diana el sábado", "anota que voy al matrimonio de Laura"). NUNCA digas que ya lo agendaste sin llamar a esta tool. `fecha` DEBE ser YYYY-MM-DD — calcúlala a partir de "Hoy es ..." del contexto (ej. "el sábado" → la fecha real). `persona` = con quién va, si Aaron la nombró.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Qué es el plan (ej. "Ver departamento", "Matrimonio de Laura").' },
        fecha: { type: 'string', description: 'Fecha del plan en formato YYYY-MM-DD (calculada desde la fecha de hoy del contexto).' },
        persona: { type: 'string', description: 'Opcional: con quién va (nombre tal como Aaron la nombró).' },
        nota: { type: 'string', description: 'Opcional: detalle (hora, lugar, etc.).' },
      },
      required: ['titulo', 'fecha'],
    },
  },
  {
    name: 'proponer_crear_recordatorio',
    description:
      'Propón AGENDAR un RECORDATORIO con FECHA Y HORA (NO lo agendes tú, solo propónlo para que Aaron confirme). Úsalo cuando Aaron pida que le recuerdes algo a una hora concreta: "recuérdame mañana 9am pedir mis pastillas", "avísame el viernes a las 3pm llamar al banco". `cuando` DEBE ser ISO 8601 CON hora y zona de Lima (-05:00), calculado desde "Hoy es ..." del contexto (ej. mañana 9am → "2026-07-22T09:00:00-05:00"). NUNCA digas que ya lo agendaste sin llamar a esta tool. SÍ puedes agendar recordatorios por hora — no digas que no puedes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        texto: { type: 'string', description: 'Qué recordar (ej. "pedir tus pastillas para la cabeza").' },
        cuando: { type: 'string', description: 'Fecha y hora en ISO 8601 con zona de Lima -05:00 (ej. "2026-07-22T09:00:00-05:00"), calculada desde la fecha/hora de hoy del contexto.' },
      },
      required: ['texto', 'cuando'],
    },
  },
  {
    name: 'proponer_registrar_estado',
    description:
      'Propón MARCAR el estado de ánimo/biológico de una persona en un día (NO lo guardes tú, solo propónlo para que Aaron confirme). Úsalo cuando Aaron dice cómo estuvo alguien un día: "Diana estuvo de mal humor hoy", "hoy anduvo tensa/renegando", "le vino la regla ayer". Esto se guarda como una MARCA CON FECHA que alimenta la detección de patrones (si se repite cada X → se puede predecir). `estado`: usa "regla" si Aaron dice que le vino el período/regla/sangrado; "animo_bajo" para mal humor / tensa / sensible / bajón / renegando. `fecha` = YYYY-MM-DD calculada desde "Hoy es ..." del contexto (default: hoy). NUNCA digas que ya lo guardaste sin llamar a esta tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        persona: { type: 'string', description: 'Nombre de la persona tal como Aaron la nombró.' },
        estado: { type: 'string', enum: ['regla', 'animo_bajo'], description: '"regla" = le vino el período; "animo_bajo" = mal humor/tensa/sensible/bajón.' },
        fecha: { type: 'string', description: 'Fecha del estado en YYYY-MM-DD (default hoy), calculada desde la fecha de hoy del contexto.' },
        nota: { type: 'string', description: 'Opcional: cómo estuvo, breve (ej. "renegando, jodiendo todo el día, tensa").' },
      },
      required: ['persona', 'estado'],
    },
  },
  {
    name: 'proponer_registrar_entrenamiento',
    description:
      'Propón registrar una SESIÓN DE ENTRENAMIENTO (NO la registres tú, solo propónla para que Aaron confirme). Úsalo cuando Aaron cuenta que entrenó: "hice pesas", "entrené técnica", "hoy hubo sparring", "fui al gym", "corrí". El plan del Mundial distingue FUERZA de técnica y sparring, así que clasifica bien: pesas/gimnasio/fuerza → "fuerza"; patadas/pao/formas/técnica → "tecnica"; combate/sparring → "sparring"; correr/bici/cardio → "acondicionamiento"; un torneo o competencia real → "competencia". Si no queda claro, usa "otro".',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: {
          type: 'string',
          enum: ['fuerza', 'tecnica', 'sparring', 'acondicionamiento', 'competencia', 'otro'],
          description: 'Tipo de sesión.',
        },
        fecha: { type: 'string', description: 'YYYY-MM-DD (default hoy), calculada desde la fecha de hoy del contexto.' },
        minutos: { type: 'integer', description: 'Duración en minutos, si Aaron la dijo.' },
        intensidad: { type: 'string', enum: ['baja', 'media', 'alta'], description: 'Si Aaron la mencionó ("suave", "pesado", "al tope").' },
        nota: { type: 'string', description: 'Qué hizo, breve y en sus palabras.' },
        ejercicios: {
          type: 'string',
          description:
            'Si Aaron dijo QUÉ ejercicios hizo con series/reps/peso, copia ESA PARTE de su mensaje TAL CUAL, un ejercicio por línea. Ej: "banca 3x12 con 80\\nsentadilla 4x8 con 100\\ndominadas 4x8". NO reformatees los números, NO los conviertas, NO inventes pesos que no dijo — el parseo lo hace código determinístico y si cambias un número queda mal guardado para siempre. Omítelo si solo dijo que entrenó sin detallar.',
        },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'proponer_agregar_hito',
    description:
      'Propón AGREGAR un sub-paso/hito a un objetivo que YA existe (NO lo agregues tú, solo propónlo para que Aaron confirme). Úsalo SIEMPRE que algo que Aaron menciona (o que aparece en el contexto) sea un PASO que AVANZA un objetivo suyo —sobre todo su NORTE, el objetivo-ancla del año— y ese objetivo hoy no lo tiene desglosado como sub-paso. No esperes a que Aaron pida "agrégalo"; si un compromiso/hecho empuja un objetivo existente, propón colgarlo de ese objetivo para cerrar el loop del norte (ej. "el examen médico me acerca al Mundial" → propón agregar "Pasar examen médico" como hito del objetivo Mundial). Si Aaron NO nombra el objetivo, se asume su NORTE (el objetivo-ancla del año). NO inventes objetivos: si ningún objetivo existente encaja de verdad, no uses esta tool. NO inventes fecha. PROHIBIDO decir que ya lo agregaste sin llamar a esta tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objetivo: { type: 'string', description: 'Título del objetivo al que se agrega el paso, tal como Aaron lo nombró. Opcional: si no lo nombra, se usa su norte (objetivo-ancla).' },
        hito: { type: 'string', description: 'Título del sub-paso/hito a agregar (ej. "Pasar examen médico IPD").' },
        fecha: { type: 'string', description: 'Opcional: fecha límite del paso en formato YYYY-MM-DD (calculada desde la fecha de hoy del contexto). NO la inventes.' },
      },
      required: ['hito'],
    },
  },
  {
    name: 'proponer_cerrar_relacion',
    description:
      'Propón CERRAR un vínculo (NO lo cierres tú, solo propónlo para que Aaron confirme). Usa esto cuando Aaron dice que una relación se terminó/rompió/acabó. Cerrar marca el vínculo como terminado y hace que SIR deje de sugerir retomar contacto. NO borra a la persona ni su historia.',
    input_schema: {
      type: 'object' as const,
      properties: {
        persona: { type: 'string', description: 'Nombre de la persona tal como Aaron la nombró.' },
        motivo: { type: 'string', description: 'Opcional: en una frase, qué pasó (para la nota de cierre).' },
      },
      required: ['persona'],
    },
  },
] as const

export interface ProposedInteraccion {
  kind: 'registrar_interaccion'
  persona: string
  calidad: number
  nota: string
}
export interface ProposedObjetivo {
  kind: 'crear_objetivo'
  titulo: string
  categoria: GoalCategory
  prioridad: GoalPriority
  proximoPaso: string
  impactoPaz: number
  personaRelacionada: string | null
}
export interface ProposedPersona {
  kind: 'crear_persona'
  nombre: string
  relacion: RelationshipType
  categoria: PersonCategory
}
export interface ProposedCierre {
  kind: 'cerrar_relacion'
  persona: string
  motivo: string
}
export interface ProposedHabito {
  kind: 'marcar_habito'
  habito: string
}
export interface ProposedTarea {
  kind: 'marcar_tarea'
  tarea: string
}
export interface ProposedPlan {
  kind: 'crear_plan'
  titulo: string
  /** YYYY-MM-DD, o '' si el modelo no dio una fecha válida. */
  fecha: string
  /** Con quién va (nombre), o null. */
  persona: string | null
  nota: string
}
export interface ProposedRecordatorio {
  kind: 'crear_recordatorio'
  texto: string
  /** ISO 8601 con hora (UTC normalizado), o '' si el modelo no dio uno válido. */
  cuando: string
}
export interface ProposedAgregarHito {
  kind: 'agregar_hito'
  /** Título del objetivo tal como el modelo lo nombró; '' si no nombró uno (→ norte al resolver). */
  objetivo: string
  hito: string
  /** YYYY-MM-DD, o '' si el modelo no dio una fecha válida (dueDate opcional). */
  fecha: string
}
export interface ProposedEstado {
  kind: 'registrar_estado'
  persona: string
  /** 'regla' → person_cycles.bleeding (ancla fuerte); 'animo_bajo' → pms (ventana sensible). */
  estado: 'regla' | 'animo_bajo'
  /** YYYY-MM-DD, o '' si el modelo no dio una fecha válida (executeAction usa hoy). */
  fecha: string
  nota: string
}
export interface ProposedEntrenamiento {
  kind: 'registrar_entrenamiento'
  /** El plan del Mundial distingue fuerza de lo demás: el tipo NO es decorativo. */
  tipo: 'fuerza' | 'tecnica' | 'sparring' | 'acondicionamiento' | 'competencia' | 'otro'
  /** YYYY-MM-DD, o '' si el modelo no dio una válida (executeAction usa hoy). */
  fecha: string
  minutos: number | null
  intensidad: 'baja' | 'media' | 'alta' | null
  nota: string
  /** Texto CRUDO de los ejercicios tal como los dictó, un ejercicio por línea.
   *  El parseo a series/reps/kg lo hace `lib/entrenamiento/ejercicios` con regex:
   *  si el modelo tocara los números, la serie histórica quedaría envenenada. */
  ejercicios: string
}
export type ProposedAction = ProposedInteraccion | ProposedObjetivo | ProposedPersona | ProposedCierre | ProposedHabito | ProposedTarea | ProposedPlan | ProposedRecordatorio | ProposedEstado | ProposedAgregarHito | ProposedEntrenamiento

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, n))
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * Normaliza/valida la entrada cruda de una tool del modelo en una acción
 * propuesta tipada. `null` si el toolName no se reconoce o falta lo mínimo.
 */
export function parseProposedAction(toolName: string, input: unknown): ProposedAction | null {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (toolName === 'proponer_registrar_interaccion') {
    const persona = str(o.persona, 120)
    if (!persona) return null
    return {
      kind: 'registrar_interaccion',
      persona,
      calidad: clampInt(o.calidad, 1, 5, 3),
      nota: str(o.nota, 500),
    }
  }
  if (toolName === 'proponer_crear_objetivo') {
    const titulo = str(o.titulo, 200)
    if (!titulo) return null
    const categoria = (GOAL_CATEGORIES as readonly string[]).includes(String(o.categoria))
      ? (o.categoria as GoalCategory)
      : 'personal'
    const prioridad = (GOAL_PRIORITIES as readonly string[]).includes(String(o.prioridad))
      ? (o.prioridad as GoalPriority)
      : 'high'
    const persona = str(o.persona_relacionada, 120)
    return {
      kind: 'crear_objetivo',
      titulo,
      categoria,
      prioridad,
      proximoPaso: str(o.proximo_paso, 240),
      impactoPaz: clampInt(o.impacto_paz, 1, 10, 5),
      personaRelacionada: persona || null,
    }
  }
  if (toolName === 'proponer_crear_persona') {
    const nombre = str(o.nombre, 120)
    if (!nombre) return null
    const relacion = (REL_TYPES as readonly string[]).includes(String(o.relacion))
      ? (o.relacion as RelationshipType)
      : 'acquaintance'
    const categoria = (PERSON_CATEGORIES as readonly string[]).includes(String(o.categoria))
      ? (o.categoria as PersonCategory)
      : 'network'
    return { kind: 'crear_persona', nombre, relacion, categoria }
  }
  if (toolName === 'proponer_registrar_estado') {
    const persona = str(o.persona, 120)
    if (!persona) return null
    const estado = o.estado === 'regla' ? 'regla' : 'animo_bajo'
    const rawFecha = str(o.fecha, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : ''
    return { kind: 'registrar_estado', persona, estado, fecha, nota: str(o.nota, 300) }
  }
  if (toolName === 'proponer_registrar_entrenamiento') {
    const TIPOS = ['fuerza', 'tecnica', 'sparring', 'acondicionamiento', 'competencia', 'otro'] as const
    const tipo = (TIPOS as readonly string[]).includes(String(o.tipo))
      ? (o.tipo as ProposedEntrenamiento['tipo'])
      : 'otro'
    const rawFecha = str(o.fecha, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : ''
    const min = typeof o.minutos === 'number' ? Math.round(o.minutos) : parseInt(String(o.minutos ?? ''), 10)
    const minutos = Number.isFinite(min) && min > 0 && min <= 600 ? min : null
    const intensidad = ['baja', 'media', 'alta'].includes(String(o.intensidad))
      ? (o.intensidad as 'baja' | 'media' | 'alta')
      : null
    return { kind: 'registrar_entrenamiento', tipo, fecha, minutos, intensidad, nota: str(o.nota, 300), ejercicios: str(o.ejercicios, 1000) }
  }
  if (toolName === 'proponer_cerrar_relacion') {
    const persona = str(o.persona, 120)
    if (!persona) return null
    return { kind: 'cerrar_relacion', persona, motivo: str(o.motivo, 280) }
  }
  if (toolName === 'proponer_marcar_habito') {
    const habito = str(o.habito, 120)
    if (!habito) return null
    return { kind: 'marcar_habito', habito }
  }
  if (toolName === 'proponer_marcar_tarea') {
    const tarea = str(o.tarea, 200)
    if (!tarea) return null
    return { kind: 'marcar_tarea', tarea }
  }
  if (toolName === 'proponer_agregar_hito') {
    const hito = str(o.hito, 200)
    if (!hito) return null
    const objetivo = str(o.objetivo, 200)
    const rawFecha = str(o.fecha, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : ''
    return { kind: 'agregar_hito', objetivo, hito, fecha }
  }
  if (toolName === 'proponer_crear_plan') {
    const titulo = str(o.titulo, 200)
    if (!titulo) return null
    const rawFecha = str(o.fecha, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : ''
    const persona = str(o.persona, 120)
    return { kind: 'crear_plan', titulo, fecha, persona: persona || null, nota: str(o.nota, 500) }
  }
  if (toolName === 'proponer_crear_recordatorio') {
    const texto = str(o.texto, 500)
    if (!texto) return null
    const raw = str(o.cuando, 40)
    const t = Date.parse(raw)
    const cuando = Number.isFinite(t) ? new Date(t).toISOString() : ''
    return { kind: 'crear_recordatorio', texto, cuando }
  }
  return null
}

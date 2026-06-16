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
      'Proponé registrar una interacción con una persona (NO la registres vos, solo proponela para que Aaron confirme). Usá esto cuando Aaron pide registrar/anotar que habló o se vio con alguien y cómo estuvo.',
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
      'Proponé crear un objetivo (NO lo crees vos, solo proponelo para que Aaron confirme). Usá esto cuando Aaron quiere fijar una meta. NO inventes fecha límite.',
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
      'Proponé crear una persona nueva en la red de Aaron (NO la crees vos, solo proponela para que confirme). Usá esto cuando Aaron quiere agregar/dar de alta a alguien que todavía no está.',
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
    name: 'proponer_cerrar_relacion',
    description:
      'Proponé CERRAR un vínculo (NO lo cierres vos, solo proponelo para que Aaron confirme). Usá esto cuando Aaron dice que una relación se terminó/rompió/acabó. Cerrar marca el vínculo como terminado y hace que SIR deje de sugerir retomar contacto. NO borra a la persona ni su historia.',
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
export type ProposedAction = ProposedInteraccion | ProposedObjetivo | ProposedPersona | ProposedCierre

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
  if (toolName === 'proponer_cerrar_relacion') {
    const persona = str(o.persona, 120)
    if (!persona) return null
    return { kind: 'cerrar_relacion', persona, motivo: str(o.motivo, 280) }
  }
  return null
}

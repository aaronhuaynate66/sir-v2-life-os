// SIR V2 — Knowledge Gap Engine · superficie INLINE (en el chat de SIR).
//
// La mitad que le faltaba a SIR: antes de responder una pregunta, si le falta
// UNA pieza clave para responder BIEN —y la pregunta es del TIPO que esa pieza
// cambiaría— SIR pregunta primero, en vez de adivinar. SIEMPRE a Aaron, NUNCA a
// terceros (= guardrail ADR 0009). Determinístico, sin llamadas extra de IA.
//
// A diferencia del panel ambiente ([[detect.ts]] → "SIR quiere saber"), acá la
// pregunta solo aparece si es MATERIAL a la consulta actual: no interrumpe con
// el cumpleaños de alguien si Aaron preguntó por su próximo paso de un objetivo.

import type { Person, Goal } from '@/types'
import { detectGaps, type KnowledgeGap } from './detect'

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * ¿La pregunta es del TIPO que este hueco cambiaría la respuesta? Por palabras
 * clave, por tipo de hueco. Para huecos de persona exige además que la persona
 * esté NOMBRADA en la pregunta (no preguntar de la nada).
 */
export function gapMatchesIntent(gap: KnowledgeGap, question: string): boolean {
  const q = norm(question)
  const firstName = norm(gap.entityName.split(/\s+/)[0] || '')
  const mentionsPerson = firstName.length >= 3 && q.includes(firstName)

  switch (gap.kind) {
    case 'cycle': {
      // El ciclo cambia cómo leer su ánimo/estado/distancia/qué le conviene.
      const kw = [
        'como esta', 'como anda', 'como la veo', 'animo', 'humor', 'distante',
        'rara', 'molesta', 'enojada', 'triste', 'sensible', 'que le pasa',
        'por que esta', 'le escribo', 'le hablo', 'que le digo', 'ciclo',
        'periodo', 'regla', 'menstrual',
      ]
      return mentionsPerson && kw.some((k) => q.includes(k))
    }
    case 'birthday': {
      const kw = ['cumple', 'cumpleanos', 'regalo', 'saludo', 'saludar', 'detalle', 'agasaj', 'felicit']
      return mentionsPerson && kw.some((k) => q.includes(k))
    }
    case 'goal_next_action': {
      // Pregunta sobre AVANZAR ese objetivo (por título o por "objetivo").
      const titleTokens = norm(gap.entityName).split(/\s+/).filter((t) => t.length >= 4)
      const mentionsGoal = titleTokens.some((t) => q.includes(t)) || q.includes('objetivo') || q.includes('meta')
      const kw = [
        'que hago', 'que deberia hacer', 'proximo paso', 'siguiente paso',
        'como avanzo', 'como sigo', 'como voy', 'que sigue', 'avanzar',
        'como progreso', 'arranco', 'empiezo', 'por donde',
      ]
      return mentionsGoal && kw.some((k) => q.includes(k))
    }
    default:
      return false
  }
}

/**
 * Elige UN hueco para preguntar inline ANTES de responder, o null si ninguno es
 * relevante. Recibe SOLO las entidades objetivo (las que la pregunta toca) para
 * no interrumpir con huecos de gente no mencionada. detectGaps ya ordena por
 * prioridad, así que el primero relevante es el de mayor prioridad.
 */
export function selectInlineGap(
  question: string,
  targetPeople: Person[],
  targetGoals: Goal[],
  dismissed: Set<string> = new Set(),
): KnowledgeGap | null {
  const gaps = detectGaps(targetPeople, targetGoals, dismissed)
  for (const g of gaps) {
    if (gapMatchesIntent(g, question)) return g
  }
  return null
}


// ─── CAPA CONTEXTUAL ────────────────────────────────────────────────────────
// A diferencia de los huecos de CAMPO (cumple/ciclo/próximo paso), un hueco
// CONTEXTUAL es una SITUACIÓN que SIR no conoce y que cambia el consejo —p.ej.
// si Aaron pregunta "¿le escribo?" y lo último que SIR sabe de esa persona fue
// una interacción tensa, falta saber si ya hablaron después. La respuesta es
// EFÍMERA: se re-inyecta en esa pregunta, NO se guarda como dato permanente
// (mañana la situación cambió). Determinístico, sobre señales que SIR ya tiene.

export interface ContextualGap {
  key: string
  kind: 'post_conflict_contact' | 'stale_knowledge'
  entity: 'person'
  entityId: string
  entityName: string
  question: string
  inputType: 'text'
  /** La respuesta NO persiste un campo: se re-inyecta como contexto de la consulta. */
  ephemeral: true
}

export interface ContextualSignal {
  id: string
  name: string
  /** Calidad (1-5) de la interacción conocida más RECIENTE, o null si no hay. */
  latestInteractionQuality: number | null
  latestInteractionAt: string | null
  /** Importancia del vínculo (1-10). Para gatear 'conocimiento viejo'. */
  importance?: number
}

const CONTACT_INTENT = [
  'le escribo', 'le hablo', 'que le digo', 'que le escribo', 'me acerco',
  'la llamo', 'lo llamo', 'le mando', 'le escribir', 'escribirle', 'hablarle',
  'deberia escribir', 'deberia hablar', 'retomo', 'retomar', 'la contacto',
  'lo contacto', 'le contesto', 'le respondo',
]

// Intención de consejo/estado sobre la persona (no solo contacto): habilita el
// hueco de "conocimiento viejo".
const ADVICE_INTENT = [
  ...CONTACT_INTENT,
  'como esta', 'como anda', 'como va', 'como sigue', 'que hago con', 'que sabes de',
  'contame de', 'que onda con', 'como la veo', 'como lo veo', 'que tal', 'novedad',
  'como esta la cosa con', 'que pasa con',
]
const STALE_DAYS = 30

function daysBetween(fromISO: string, now: Date): number {
  const t = new Date(fromISO).getTime()
  if (!Number.isFinite(t)) return NaN
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/**
 * Detecta UN hueco contextual material a la consulta, o null. Hoy cubre el caso
 * insignia: intención de contacto sobre alguien cuya última interacción conocida
 * fue tensa (quality<=2) → "¿hablaron después?". Determinístico.
 */
export function detectContextualGap(
  question: string,
  signals: ContextualSignal[],
  dismissed: Set<string> = new Set(),
  now: Date = new Date(),
): ContextualGap | null {
  const q = norm(question)
  const hasContactIntent = CONTACT_INTENT.some((k) => q.includes(k))
  const hasAdviceIntent = ADVICE_INTENT.some((k) => q.includes(k))
  if (!hasAdviceIntent) return null

  for (const s of signals) {
    const first = norm((s.name || '').split(/\s+/)[0] || '')
    if (!(first.length >= 3 && q.includes(first))) continue

    // (1) Post-conflicto: intención de CONTACTO + última interacción tensa.
    if (hasContactIntent && s.latestInteractionQuality != null && s.latestInteractionQuality <= 2) {
      const key = `ctx_postconflict:${s.id}`
      if (!dismissed.has(key)) {
        return {
          key, kind: 'post_conflict_contact', entity: 'person', entityId: s.id,
          entityName: s.name,
          question: `Lo último que tengo con ${first} fue una interacción tensa. ¿Hablaron después de eso?`,
          inputType: 'text', ephemeral: true,
        }
      }
    }

    // (2) Conocimiento viejo: vínculo importante (>=6) del que no sé nada hace
    //     >30 días → puede haber pasado algo que cambia el consejo.
    const imp = Number(s.importance) || 0
    if (imp >= 6 && s.latestInteractionAt) {
      const d = daysBetween(s.latestInteractionAt, now)
      if (Number.isFinite(d) && d >= STALE_DAYS) {
        const key = `ctx_stale:${s.id}`
        if (!dismissed.has(key)) {
          return {
            key, kind: 'stale_knowledge', entity: 'person', entityId: s.id,
            entityName: s.name,
            question: `Lo último que tengo de ${first} es de hace ${d} días. ¿Pasó algo nuevo con ${first} desde entonces?`,
            inputType: 'text', ephemeral: true,
          }
        }
      }
    }
  }
  return null
}

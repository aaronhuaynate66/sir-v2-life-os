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

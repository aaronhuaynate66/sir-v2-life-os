// SIR V2 — Gating SMART: ¿el objetivo está BIEN DEFINIDO antes de armar el plan?
//
// PURO + determinístico (cero red/LLM). El plan OKR sólo aterriza si el objetivo
// ya es SMART; si no, primero hay que DEFINIRLO (wizard guiado). Estas funciones
// son la fuente única de verdad de ese gating, usadas por la UI para decidir si
// el CTA dice "Definir objetivo" o "Generar plan con IA".
//
// Mapeo SMART → campos de Goal (migración 0042; deadline = target_date, ya existía):
//   - Specific   : title (siempre presente al existir el objetivo) → no se chequea.
//   - Measurable : target (la métrica/resultado medible).
//   - Baseline   : baseline (dónde estás hoy; el wizard lo AUTO-PROPONE de la data).
//   - Time-bound : targetDate (la fecha límite).
//   - Relevant   : why (por qué importa).

import type { Goal } from '@/types'

/** Las dimensiones SMART que el gating exige completar (Specific = title, implícito). */
export type SmartField = 'measurable' | 'baseline' | 'timeBound' | 'relevant'

/** Subconjunto de Goal del que depende el gating (facilita testear sin construir un Goal entero). */
export type SmartGoalFields = Pick<Goal, 'target' | 'baseline' | 'targetDate' | 'why'>

/** Etiqueta humana (es) de cada dimensión SMART, para hints de la UI. */
export const SMART_FIELD_LABEL: Record<SmartField, string> = {
  measurable: 'meta medible',
  baseline: 'punto de partida',
  timeBound: 'fecha límite',
  relevant: 'por qué importa',
}

function filled(v: string | undefined | null): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Campos SMART que FALTAN para considerar el objetivo bien definido. Devuelve
 * [] cuando está completo. El orden es el del wizard (measurable → baseline →
 * timeBound → relevant).
 */
export function missingSmartFields(goal: SmartGoalFields): SmartField[] {
  const missing: SmartField[] = []
  if (!filled(goal.target)) missing.push('measurable')
  if (!filled(goal.baseline)) missing.push('baseline')
  if (!filled(goal.targetDate)) missing.push('timeBound')
  if (!filled(goal.why)) missing.push('relevant')
  return missing
}

/** true si el objetivo tiene target + baseline + fecha límite + por qué. */
export function isGoalSmartComplete(goal: SmartGoalFields): boolean {
  return missingSmartFields(goal).length === 0
}

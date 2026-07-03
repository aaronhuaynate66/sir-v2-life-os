// SIR V2 — Prompt del Multi-Persona Reasoner (A1). PURO (ensamblado de strings).
//
// Toma el CognitiveAssessment (A2, el "Foco ahora") + las lentes elegidas
// (personas.ts) y arma UNA llamada estructurada: el LLM razona el momento a
// través de cada lente y sintetiza. Una sola llamada (no 12) → consciente del
// costo. El endpoint /api/reason hace la llamada y parsea el JSON.

import type { CognitiveAssessment } from '@/engines/orchestrator'
import { PERSONAS, type CognitivePersona } from './personas'

export interface LensTake {
  persona: CognitivePersona
  label: string
  /** La lectura de esa lente, 1 línea. */
  take: string
}

export interface ReasonerResult {
  perLens: LensTake[]
  /** Síntesis accionable (2-3 líneas, paz primero). */
  synthesis: string
}

export interface ReasonerPrompt {
  system: string
  user: string
}

/** Construye system+user para el reasoner. PURO. */
export function buildReasonerPrompt(assessment: CognitiveAssessment, personas: CognitivePersona[]): ReasonerPrompt {
  const lensList = personas
    .map((p) => `- ${PERSONAS[p].label} (${p}): ${PERSONAS[p].lens}`)
    .join('\n')

  const system = `Sos SIR V2, el sistema operativo cognitivo-relacional privado del usuario (Aaron).
Tu meta-objetivo es su PAZ. Razonás un mismo momento a través de VARIAS lentes a la vez y después sintetizás.

Lentes a aplicar en esta lectura:
${lensList}

Devolvé EXCLUSIVAMENTE un JSON con esta forma (sin prosa, sin markdown fences):
{
  "perLens": [ { "persona": "<id de la lente>", "take": "<1 línea: qué ve esta lente en este momento>" } ],
  "synthesis": "<2-3 líneas: la lectura unificada y ACCIONABLE, priorizando la paz. Directo, específico, sin relleno.>"
}
Reglas: una línea por lente (solo las lentes dadas), en español, concreto sobre el foco real. Empezá con { y terminá con }.`

  const focusLines = assessment.focus.length
    ? assessment.focus.slice(0, 6).map((f) => `- [${f.domainLabel}] ${f.title}${f.detail ? ` — ${f.detail}` : ''}`).join('\n')
    : '- (sin focos activos ahora mismo)'

  const user = `Foco ahora (ordenado por prioridad):
${focusLines}

Estado de paz: ${assessment.peace.total}/10 (tendencia: ${assessment.peace.trend})${assessment.peace.recoveryMode ? ' · MODO RECUPERACIÓN activo' : ''}.

Leé este momento con las lentes indicadas y sintetizá.`

  return { system, user }
}

// SIR V2 — Multi-Persona Reasoner (A1): catálogo de las 12 lentes + selección.
//
// docs/01_COGNITIVE_ARCHITECTURE.md dice que SIR "razona a través de múltiples
// lentes simultáneas". Estaba huérfano (un type en engines/ai-brain sin uso).
// Acá vive el catálogo real y la SELECCIÓN determinística de qué lentes aplican
// según el foco del momento (los dominios del CognitiveAssessment de A2). El
// razonamiento en sí lo hace el LLM (prompt.ts + /api/reason) sobre las lentes
// elegidas. PURO + determinístico.

import type { PriorityDomain } from '@/engines/priority'

export type CognitivePersona =
  | 'psychologist' | 'anthropologist' | 'historian' | 'strategist' | 'operator'
  | 'coach' | 'systems_analyst' | 'performance_coach' | 'finance_master'
  | 'tactician' | 'human_biologist' | 'identity_architect'

export interface PersonaDef {
  /** Nombre de la lente (ES). */
  label: string
  /** En qué se enfoca — se inyecta en el prompt para que el LLM adopte la lente. */
  lens: string
}

export const PERSONAS: Record<CognitivePersona, PersonaDef> = {
  psychologist: { label: 'Psicólogo', lens: 'emociones, patrones de conducta, apego y ciclos emocionales; qué motiva por debajo' },
  anthropologist: { label: 'Antropólogo', lens: 'rituales sociales, jerarquías, roles y las reglas no escritas del entorno' },
  historian: { label: 'Historiador', lens: 'conecta el presente con patrones del pasado; ciclos que se repiten' },
  strategist: { label: 'Estratega', lens: 'tablero de largo plazo; aliados/neutrales/adversarios; riesgo vs oportunidad' },
  operator: { label: 'Operador', lens: 'acción concreta sobre análisis; convierte el insight en un plan ejecutable' },
  coach: { label: 'Coach', lens: 'acompaña sin juzgar; desafía creencias limitantes; refuerza identidad y dirección' },
  systems_analyst: { label: 'Analista Sistémico', lens: 'el sistema detrás del síntoma; bucles de retroalimentación; causa→efecto' },
  performance_coach: { label: 'Entrenador', lens: 'carga, recuperación y pico de forma; el rendimiento como algo gestionable' },
  finance_master: { label: 'Maestro de Finanzas', lens: 'los flujos de dinero como flujos de energía; riesgo y oportunidad económica' },
  tactician: { label: 'Táctico', lens: 'el timing de conversaciones y decisiones en el corto plazo' },
  human_biologist: { label: 'Biólogo Humano', lens: 'sueño, energía y cuerpo como sistema; las señales biológicas como datos' },
  identity_architect: { label: 'Arquitecto de Identidad', lens: 'quién quieres ser; alinear las decisiones con tus valores y misión' },
}

/** Lentes que cada dominio "enciende". Base (coach+estratega) siempre presente. */
const DOMAIN_PERSONAS: Record<PriorityDomain, CognitivePersona[]> = {
  peace: ['coach', 'psychologist'],
  health: ['human_biologist', 'performance_coach'],
  finance: ['finance_master', 'operator'],
  personal: ['strategist', 'identity_architect'],
  relational: ['psychologist', 'anthropologist', 'tactician'],
  optimization: ['systems_analyst', 'operator'],
}

const BASE_PERSONAS: CognitivePersona[] = ['coach', 'strategist']
const MAX_PERSONAS = 5

/**
 * Elige las lentes relevantes para el momento a partir de los dominios del foco
 * (en orden de prioridad). Base (coach+estratega) + las de los dominios tocados,
 * dedup, cap a 5. Determinístico. Si no hay dominios → solo la base.
 */
export function selectPersonas(focusDomains: PriorityDomain[]): CognitivePersona[] {
  const out: CognitivePersona[] = [...BASE_PERSONAS]
  for (const d of focusDomains) {
    for (const p of DOMAIN_PERSONAS[d] ?? []) {
      if (!out.includes(p)) out.push(p)
      if (out.length >= MAX_PERSONAS) return out.slice(0, MAX_PERSONAS)
    }
  }
  return out.slice(0, MAX_PERSONAS)
}

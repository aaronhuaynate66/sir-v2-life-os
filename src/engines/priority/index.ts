// SIR V2 — Jerarquía de prioridades de dominio (base científica, PURO).
//
// docs/01_COGNITIVE_ARCHITECTURE.md define un orden que GOBIERNA los trade-offs
// entre dominios cuando dos cosas compiten:
//   NIVEL 0: Paz mental (meta-objetivo)
//   NIVEL 1: Salud biológica
//   NIVEL 2: Estabilidad financiera
//   NIVEL 3: Objetivos personales clave
//   NIVEL 4: Objetivos relacionales
//   NIVEL 5: Optimización continua
//
// Antes esto vivía solo implícito (pesos sueltos en peace, prioridades planas en
// recommendation). Acá queda como estructura única: un dominio de MENOR nivel
// gana el trade-off. Es el cimiento del orquestador (A2) y del evaluador de
// decisión (A4). Determinístico, sin deps.

export type PriorityDomain =
  | 'peace'
  | 'health'
  | 'finance'
  | 'personal'
  | 'relational'
  | 'optimization'

/** Nivel de cada dominio. MENOR = MÁS importante (gana los trade-offs). */
export const PRIORITY_LEVEL: Record<PriorityDomain, number> = {
  peace: 0,
  health: 1,
  finance: 2,
  personal: 3,
  relational: 4,
  optimization: 5,
}

/** Dominios de más a menos prioritario (para iterar/mostrar). */
export const PRIORITY_ORDER: PriorityDomain[] = ['peace', 'health', 'finance', 'personal', 'relational', 'optimization']

export const DOMAIN_LABEL: Record<PriorityDomain, string> = {
  peace: 'Paz',
  health: 'Salud',
  finance: 'Finanzas',
  personal: 'Personal',
  relational: 'Relacional',
  optimization: 'Optimización',
}

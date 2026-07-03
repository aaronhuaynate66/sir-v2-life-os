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

/** Comparador de dominios por importancia. <0 si `a` es MÁS importante que `b`. */
export function compareDomains(a: PriorityDomain, b: PriorityDomain): number {
  return PRIORITY_LEVEL[a] - PRIORITY_LEVEL[b]
}

/** Resuelve un trade-off entre dos dominios: devuelve el que GANA (más importante). */
export function resolveTradeoff(a: PriorityDomain, b: PriorityDomain): PriorityDomain {
  return compareDomains(a, b) <= 0 ? a : b
}

/** ¿`a` tiene prioridad estricta sobre `b`? */
export function outranks(a: PriorityDomain, b: PriorityDomain): boolean {
  return PRIORITY_LEVEL[a] < PRIORITY_LEVEL[b]
}

/**
 * Ordena items por la jerarquía de dominio (nivel asc). Empate de dominio → se
 * rompe con `weightOf` (mayor primero) si se provee. Estable, no muta el input.
 */
export function rankByPriority<T>(
  items: T[],
  domainOf: (t: T) => PriorityDomain,
  weightOf?: (t: T) => number,
): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((x, y) => {
      const d = PRIORITY_LEVEL[domainOf(x.item)] - PRIORITY_LEVEL[domainOf(y.item)]
      if (d !== 0) return d
      if (weightOf) {
        const w = weightOf(y.item) - weightOf(x.item)
        if (w !== 0) return w
      }
      return x.i - y.i // estable
    })
    .map((e) => e.item)
}

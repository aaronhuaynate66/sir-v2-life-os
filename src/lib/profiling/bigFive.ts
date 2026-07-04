// SIR V2 — Instrumento Big Five / OCEAN (19·M4 + 19·M5). PURO.
//
// A diferencia del perfil relacional (19·M1) que es HIPÓTESIS-por-inferencia, esto
// es el instrumento VÁLIDO: autoreporte. Lo responde la propia persona sobre sí
// misma (M4 consentido) o Aaron sobre sí mismo (M5 autoperfil). Es un BFI-10
// corto (Rammstedt & John): 2 ítems por rasgo, escala 1-5, con ítems invertidos.
// No es diagnóstico ni caja: rasgos CONTINUOS (0-100), descriptivos.

export type Trait = 'O' | 'C' | 'E' | 'A' | 'N'

export interface BigFiveItem {
  id: string
  trait: Trait
  text: string
  /** true = ítem invertido (puntaje 6 − respuesta). */
  reverse: boolean
}

/** BFI-10 adaptado (es-AR). Escala 1 (muy en desacuerdo) … 5 (muy de acuerdo). */
export const BIG_FIVE_ITEMS: BigFiveItem[] = [
  { id: 'e1', trait: 'E', text: 'Soy más bien reservado/a.', reverse: true },
  { id: 'e2', trait: 'E', text: 'Soy sociable, extrovertido/a.', reverse: false },
  { id: 'a1', trait: 'A', text: 'Tiendo a criticar a los demás.', reverse: true },
  { id: 'a2', trait: 'A', text: 'Soy considerado/a y amable con casi todos.', reverse: false },
  { id: 'c1', trait: 'C', text: 'Tiendo a ser desorganizado/a.', reverse: true },
  { id: 'c2', trait: 'C', text: 'Hago las cosas a fondo, con cuidado.', reverse: false },
  { id: 'n1', trait: 'N', text: 'Estoy relajado/a, manejo bien el estrés.', reverse: true },
  { id: 'n2', trait: 'N', text: 'Me pongo nervioso/a o ansioso/a con facilidad.', reverse: false },
  { id: 'o1', trait: 'O', text: 'Tengo poco interés artístico o por lo abstracto.', reverse: true },
  { id: 'o2', trait: 'O', text: 'Tengo imaginación activa, me atrae lo nuevo.', reverse: false },
]

export const TRAIT_LABEL: Record<Trait, string> = {
  O: 'Apertura', C: 'Responsabilidad', E: 'Extraversión', A: 'Amabilidad', N: 'Neuroticismo',
}

/** Glosa breve del extremo ALTO de cada rasgo (descriptivo, no valorativo). */
export const TRAIT_HIGH: Record<Trait, string> = {
  O: 'curioso/a, abierto/a a lo nuevo',
  C: 'organizado/a, confiable',
  E: 'sociable, con energía hacia afuera',
  A: 'cálido/a, cooperativo/a',
  N: 'más reactivo/a emocionalmente',
}

export interface BigFiveScores {
  O: number; C: number; E: number; A: number; N: number
}

const TRAITS: Trait[] = ['O', 'C', 'E', 'A', 'N']

/**
 * Puntúa el Big Five a partir de las respuestas (id → 1-5). Devuelve cada rasgo
 * en 0-100. null si falta alguna respuesta o hay valores fuera de rango. PURO.
 */
export function scoreBigFive(answers: Record<string, number>): BigFiveScores | null {
  const scores = {} as BigFiveScores
  for (const trait of TRAITS) {
    const items = BIG_FIVE_ITEMS.filter((i) => i.trait === trait)
    let sum = 0
    for (const it of items) {
      const v = answers[it.id]
      if (typeof v !== 'number' || v < 1 || v > 5) return null
      sum += it.reverse ? 6 - v : v
    }
    const mean = sum / items.length // 1..5
    scores[trait] = Math.round(((mean - 1) / 4) * 100) // 0..100
  }
  return scores
}

/** Frase-resumen descriptiva del perfil (rasgos altos primero). */
export function summarizeBigFive(s: BigFiveScores): string {
  const highs = TRAITS.filter((t) => s[t] >= 60).map((t) => `${TRAIT_LABEL[t].toLowerCase()} alta`)
  const lows = TRAITS.filter((t) => s[t] <= 40).map((t) => `${TRAIT_LABEL[t].toLowerCase()} baja`)
  const parts = [...highs, ...lows]
  return parts.length ? `Perfil: ${parts.join(', ')}.` : 'Perfil equilibrado en los cinco rasgos.'
}

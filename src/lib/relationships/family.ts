// SIR V2 — Lógica pura del grafo de familia persona↔persona (person_links).
//
// Una arista guardada es DIRIGIDA: link(personAId=A, personBId=B, kind=k) se
// lee "B es <k> de A" (A = sujeto/ficha, B = el familiar). De ahí salen dos
// vistas:
//   • En la ficha de A: "B es tu <k>"            → label directo (KIND_LABEL).
//   • En la ficha de B: "A es tu <inverso(k)>"   → label inverso (inverseRoleLabel).
//
// El género del parentesco (madre vs padre) deja calcular el inverso con la
// mayor precisión posible; cuando el género del OTRO extremo es desconocido el
// inverso cae a una forma con barra ("Hijo/a"), que es honesta, no inventa.
//
// Nada acá toca el store ni la red: son funciones puras, testeables y
// memoizables. La UI (FamiliaPanel) y el motor de sugerencias las consumen.

import type { FamilyKind } from '@/types'

/** Sentinel del nodo "yo" (Aaron) en person_links. NO es una fila de `people`:
 *  el grafo ya usa id='self' para el nodo central. Una arista con
 *  person_a_id===SELF_ID es un vínculo SELF↔persona ("X es mi <kind>"). */
export const SELF_ID = 'self'

/** Etiqueta directa de un parentesco ("B es <label> de A"). */
export const KIND_LABEL: Record<FamilyKind, string> = {
  madre: 'Madre',
  padre: 'Padre',
  hija: 'Hija',
  hijo: 'Hijo',
  hermana: 'Hermana',
  hermano: 'Hermano',
  pareja: 'Pareja',
  abuela: 'Abuela',
  abuelo: 'Abuelo',
  tia: 'Tía',
  tio: 'Tío',
  prima: 'Prima',
  primo: 'Primo',
  amiga: 'Amiga',
  amigo: 'Amigo',
  otro: 'Otro',
  familiar: 'Familiar',
}

/** Opciones del selector de parentesco (orden estable; 'familiar' es legacy y
 *  NO se ofrece para nuevos vínculos, pero KIND_LABEL lo soporta al leer). */
export const KIND_OPTIONS: { value: FamilyKind; label: string }[] = [
  { value: 'madre', label: 'Madre' },
  { value: 'padre', label: 'Padre' },
  { value: 'hermana', label: 'Hermana' },
  { value: 'hermano', label: 'Hermano' },
  { value: 'hija', label: 'Hija' },
  { value: 'hijo', label: 'Hijo' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'abuela', label: 'Abuela' },
  { value: 'abuelo', label: 'Abuelo' },
  { value: 'tia', label: 'Tía' },
  { value: 'tio', label: 'Tío' },
  { value: 'prima', label: 'Prima' },
  { value: 'primo', label: 'Primo' },
  { value: 'amiga', label: 'Amiga' },
  { value: 'amigo', label: 'Amigo' },
  { value: 'otro', label: 'Otro' },
]

/** Familias semánticas — para inverso y composición sin enumerar cada par. */
export type KindCategory =
  | 'parent'
  | 'child'
  | 'sibling'
  | 'partner'
  | 'grandparent'
  | 'grandchild'
  | 'auntuncle'
  | 'nibling' // sobrino/a
  | 'cousin'
  | 'friend'
  | 'other'

const CATEGORY_OF: Record<FamilyKind, KindCategory> = {
  madre: 'parent',
  padre: 'parent',
  hija: 'child',
  hijo: 'child',
  hermana: 'sibling',
  hermano: 'sibling',
  pareja: 'partner',
  abuela: 'grandparent',
  abuelo: 'grandparent',
  tia: 'auntuncle',
  tio: 'auntuncle',
  prima: 'cousin',
  primo: 'cousin',
  amiga: 'friend',
  amigo: 'friend',
  otro: 'other',
  familiar: 'other',
}

export function categoryOf(kind: FamilyKind): KindCategory {
  return CATEGORY_OF[kind] ?? 'other'
}

/**
 * Etiqueta del rol INVERSO para mostrar en la ficha del OTRO extremo.
 * Si link es "B es <kind> de A", devuelve cómo se lee A desde la ficha de B.
 * Las formas con barra ("Hijo/a") son a propósito: no conocemos el género del
 * sujeto inverso, así que no lo inventamos.
 */
export function inverseRoleLabel(kind: FamilyKind): string {
  switch (categoryOf(kind)) {
    case 'parent':
      return 'Hijo/a'
    case 'child':
      return 'Padre/Madre'
    case 'sibling':
      return 'Hermano/a'
    case 'partner':
      return 'Pareja'
    case 'grandparent':
      return 'Nieto/a'
    case 'grandchild':
      return 'Abuelo/a'
    case 'auntuncle':
      return 'Sobrino/a'
    case 'nibling':
      return 'Tío/a'
    case 'cousin':
      return 'Primo/a'
    case 'friend':
      return 'Amigo/a'
    default:
      return 'Familiar'
  }
}

/**
 * Composición de parentescos para INFERENCIA SUGERIDA (nunca automática).
 *
 * Lee: "B es <k1> de A" y "C es <k2> de B" ⇒ "C es compose(k1,k2) de A".
 * Solo devolvemos resultados ALTAMENTE confiables y de género determinado por
 * el parentesco de entrada (no asumimos el género del sujeto A). Devuelve null
 * cuando la composición es ambigua o arriesgada (ej. pasos políticos vía
 * pareja) — preferimos NO sugerir antes que sugerir mal.
 *
 * Reglas (todas reversibles a una sola arista nueva A→C):
 *   • hermano/a de A, y madre/padre de mi hermano/a    ⇒ mi madre/padre.
 *   • hermano/a de A, y hermano/a de mi hermano/a      ⇒ mi hermano/a.
 *   • madre/padre de A, y madre/padre de mi madre/padre⇒ mi abuela/abuelo.
 *   • madre/padre de A, y hermano/a de mi madre/padre  ⇒ mi tía/tío.
 *   • madre/padre de A, y hijo/a de mi madre/padre     ⇒ mi hermano/a.
 *     (el hijo/a de mi madre/padre, excluyéndome a mí, es mi hermano/a — habilita
 *      la inferencia inversa con el self: "María es mi madre" + "Nicolle es hija
 *      de María" ⇒ "Nicolle es tu hermana".)
 */
export function composeKinds(k1: FamilyKind, k2: FamilyKind): FamilyKind | null {
  const a = categoryOf(k1)
  const b = categoryOf(k2)

  // El hermano/a de A comparte los ascendientes y colaterales de A.
  if (a === 'sibling') {
    if (b === 'parent') return k2 // su madre/padre es mi madre/padre
    if (b === 'sibling') return k2 // su hermano/a es mi hermano/a
    return null
  }

  // El ascendiente de mi ascendiente / su colateral / su descendiente.
  if (a === 'parent') {
    if (b === 'parent') return k2 === 'madre' ? 'abuela' : 'abuelo'
    if (b === 'sibling') return k2 === 'hermana' ? 'tia' : 'tio'
    if (b === 'child') return k2 === 'hija' ? 'hermana' : 'hermano'
    return null
  }

  return null
}

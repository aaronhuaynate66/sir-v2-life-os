// SIR V2 — Esfuerzo relacional ponderado por PARENTESCO con el "yo".
//
// El motor de "a quién atender" (agenda no_contact + Daily Actions) ya mide
// esfuerzo por importancia × tiempo sin contacto. Lo que faltaba: que la
// FAMILIA DIRECTA y la PAREJA pesen más, aunque su importanceScore no esté
// seteado alto. Eso lo sabemos por las aristas SELF↔persona de person_links
// (commit f3e25d0): "X es mi madre / mi pareja / mi hijo…".
//
// Acá derivamos, de esas aristas, un MULTIPLICADOR de esfuerzo por persona y
// una etiqueta posesiva ("tu pareja", "tu madre") para humanizar la alerta.
// PURO + determinístico, sin I/O. Reusable por agenda y por Daily Actions —
// una sola fuente de verdad para "cuánto pesa este vínculo por sangre/pareja".

import type { FamilyKind, PersonLink } from '@/types'
import { SELF_ID, categoryOf, type KindCategory } from '@/lib/relationships/family'

/** Multiplicador de esfuerzo por categoría de parentesco. >1 sube la urgencia
 *  de NO descuidar a esa persona; pareja e hijos/padres pesan al máximo. El
 *  resto del grafo no-familiar (amigos / otros) queda en ~1 (sin boost). */
const WEIGHT_BY_CATEGORY: Record<KindCategory, number> = {
  partner: 2.0,
  parent: 1.8,
  child: 1.8,
  sibling: 1.5,
  grandparent: 1.4,
  grandchild: 1.4,
  auntuncle: 1.2,
  nibling: 1.2,
  cousin: 1.15,
  friend: 1.1,
  other: 1.0,
}

/** Etiqueta posesiva en 2ª persona ("tu pareja", "tu madre"). Para la copy de
 *  las alertas ("Hace tiempo no hablás con tu pareja Diana"). */
const POSSESSIVE_LABEL: Record<FamilyKind, string> = {
  madre: 'tu mamá',
  padre: 'tu papá',
  hija: 'tu hija',
  hijo: 'tu hijo',
  hermana: 'tu hermana',
  hermano: 'tu hermano',
  pareja: 'tu pareja',
  abuela: 'tu abuela',
  abuelo: 'tu abuelo',
  tia: 'tu tía',
  tio: 'tu tío',
  prima: 'tu prima',
  primo: 'tu primo',
  padrastro: 'tu padrastro',
  madrastra: 'tu madrastra',
  hijastro: 'tu hijastro',
  hijastra: 'tu hijastra',
  medio_hermano: 'tu medio hermano',
  medio_hermana: 'tu media hermana',
  amiga: 'tu amiga',
  amigo: 'tu amigo',
  otro: 'tu familiar',
  familiar: 'tu familiar',
}

export interface SelfKinship {
  /** Id de la persona vinculada al "yo". */
  personId: string
  kind: FamilyKind
  /** Multiplicador de esfuerzo (>= 1). */
  weight: number
  /** Etiqueta posesiva ("tu pareja"). */
  label: string
}

/**
 * Mapa personId → vínculo de parentesco con el "yo", derivado de las aristas
 * SELF↔persona (person_links con personAId === SELF_ID, leídas "B es mi <kind>").
 *
 * Si una persona tuviera más de una arista con el self (no debería, pero el
 * grafo no lo impide), gana la de MAYOR peso — no subestimamos el vínculo.
 * Las aristas persona↔persona (sin el self) se ignoran: acá sólo importa el
 * parentesco DIRECTO con el dueño de la app.
 */
export function buildSelfKinshipMap(links: PersonLink[]): Map<string, SelfKinship> {
  const map = new Map<string, SelfKinship>()
  for (const link of links) {
    if (link.personAId !== SELF_ID) continue
    const personId = link.personBId
    if (!personId || personId === SELF_ID) continue
    const weight = WEIGHT_BY_CATEGORY[categoryOf(link.kind)] ?? 1.0
    const existing = map.get(personId)
    if (existing && existing.weight >= weight) continue
    map.set(personId, {
      personId,
      kind: link.kind,
      weight,
      label: POSSESSIVE_LABEL[link.kind] ?? 'tu familiar',
    })
  }
  return map
}

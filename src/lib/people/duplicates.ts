// SIR V2 — Detección de personas posiblemente duplicadas. PURO + testeable.
//
// El matcher de import (searchPeople) evita crear duplicados NUEVOS, pero no
// limpia los que ya existen (p. ej. dos "Nicolle" creadas en imports viejos).
// Acá agrupamos personas que probablemente sean la MISMA, de forma CONSERVADORA
// (solo señales fuertes: mismo nombre normalizado, o alias que coincide con el
// nombre/alias de otra) para que el usuario las revise y unifique A MANO. NO
// fusiona ni borra nada — solo señala.

export interface DupPerson {
  id: string
  name: string
  slug?: string | null
  alias?: string | null
}

/** Normaliza para comparar: sin acentos, minúsculas, espacios colapsados. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Claves de identidad de una persona (nombre y alias normalizados, no vacíos). */
function keysOf(p: DupPerson): string[] {
  const ks = new Set<string>()
  const n = norm(p.name || '')
  if (n.length >= 2) ks.add(n)
  const a = norm(p.alias || '')
  if (a.length >= 2) ks.add(a)
  return [...ks]
}

/**
 * Agrupa personas que comparten al menos una clave (nombre o alias normalizado).
 * Devuelve solo los grupos con 2+ integrantes, ordenados por tamaño desc. Union-
 * find sobre las claves compartidas. PURO.
 */
export function findDuplicatePeople(people: DupPerson[]): DupPerson[][] {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as number
    // path-compression
    let c = x
    while (parent.get(c) !== r) {
      const next = parent.get(c) as number
      parent.set(c, r)
      c = next
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  people.forEach((_, i) => parent.set(i, i))

  // Primera persona que "posee" cada clave; las siguientes se unen a ella.
  const keyOwner = new Map<string, number>()
  people.forEach((p, i) => {
    for (const k of keysOf(p)) {
      const owner = keyOwner.get(k)
      if (owner === undefined) keyOwner.set(k, i)
      else union(i, owner)
    }
  })

  const groups = new Map<number, DupPerson[]>()
  people.forEach((p, i) => {
    const root = find(i)
    const arr = groups.get(root) ?? []
    arr.push(p)
    groups.set(root, arr)
  })

  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length)
}

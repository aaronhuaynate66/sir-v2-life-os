// SIR V2 — Atribución de persona por EMAIL del remitente (ingesta correo/Teams).
//
// El reader de correo trae `fromEmail`, pero la atribución hoy solo mira el
// NOMBRE del hilo (namesLooselyMatch), que falla seguido. El email es la llave
// estable del remitente → matcheamos por él PRIMERO, con fallback al nombre.
//
// PURO y testeable: recibe las filas de `people` ya cargadas y resuelve el
// person_id. La query vive en el pipeline (persist.ts); acá solo la lógica.

import { namesLooselyMatch } from './nameMatch'

/** Fila mínima de `people` para atribuir (id + señales de match). */
export interface PersonMatchRow {
  id: string
  name: string
  alias?: string | null
  email?: string | null
}

/** Normaliza un email para match exacto e insensible: trim + minúsculas. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

/**
 * person_id por email EXACTO (lower-normalizado). Solo si UNA sola persona
 * matchea (misma guarda anti-ambigüedad que el match por nombre): dos personas
 * con el mismo email → no atribuimos. '' / null → null.
 */
export function matchPersonIdByEmail(people: PersonMatchRow[], fromEmail: string | null | undefined): string | null {
  const target = normalizeEmail(fromEmail)
  if (!target) return null
  const hits = people.filter((p) => normalizeEmail(p.email) === target)
  return hits.length === 1 ? hits[0].id : null
}

/**
 * person_id por NOMBRE del hilo (match laxo, igual criterio que el reader). Solo
 * si UNA sola persona matchea (por name o alias). '' → null.
 */
export function matchPersonIdByName(people: PersonMatchRow[], threadName: string | null | undefined): string | null {
  const name = (threadName ?? '').trim()
  if (!name) return null
  const hits = people.filter(
    (p) => namesLooselyMatch(name, p.name) || (p.alias ? namesLooselyMatch(name, p.alias) : false),
  )
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0].id

  // VARIAS COINCIDENCIAS → gana la MÁS ESPECÍFICA, no "ninguna".
  //
  // Antes se devolvía null en cuanto había empate, y eso lo rompía una persona
  // registrada con un solo nombre común. Caso real (2-ago-2026): Aaron tiene un
  // colega guardado como "William" a secas, y como `namesLooselyMatch` acepta que
  // uno contenga al otro, ese registro matchea CUALQUIER hilo con "William"
  // adentro. Al conocer al Tte. William Manuel Llatance, el hilo "William Deportes
  // Nacional" pegaba con los dos → 2 hits → null → sus mensajes no se atribuían a
  // nadie. Una persona con nombre de pila suelto se volvía un imán que bloqueaba a
  // todos sus homónimos.
  //
  // La intención original (no atribuir a la ligera, bug "Carolina" del 16-jul) se
  // conserva: si el mejor puntaje está EMPATADO sigue devolviendo null. Lo que
  // cambia es que un match claramente mejor ya no queda anulado por uno vago.
  let mejor: PersonMatchRow | null = null
  let mejorPuntaje = -1
  let empatado = false
  for (const p of hits) {
    const puntaje = Math.max(especificidad(name, p.name), p.alias ? especificidad(name, p.alias) : -1)
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = p; empatado = false }
    else if (puntaje === mejorPuntaje) empatado = true
  }
  return empatado || !mejor ? null : mejor.id
}

/**
 * Cuán ESPECÍFICO es un candidato para un nombre de hilo. PURA. Mayor = mejor.
 *
 * Escala: igualdad exacta manda sobre todo; después, cuántos tokens comparten; y
 * a igualdad de tokens, gana el nombre más completo (más tokens propios), porque
 * "Tte. William Manuel Llatance" es una afirmación más fuerte que "William".
 */
export function especificidad(hilo: string, candidato: string): number {
  const a = (hilo ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  const b = (candidato ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  if (!a || !b) return 0
  if (a === b) return 1000
  const ta = new Set(a.split(/[^a-z0-9]+/).filter((t) => t.length >= 3))
  const tb = new Set(b.split(/[^a-z0-9]+/).filter((t) => t.length >= 3))
  let compartidos = 0
  for (const t of ta) if (tb.has(t)) compartidos++
  return compartidos * 10 + Math.min(tb.size, 9)
}

/**
 * Resuelve la persona de un remitente: PRIORIZA el email exacto; si no hay match
 * por email (o no hay email), cae al nombre del hilo. PURO y testeable.
 */
export function resolvePersonId(
  people: PersonMatchRow[],
  opts: { threadName?: string | null; fromEmail?: string | null },
): string | null {
  return matchPersonIdByEmail(people, opts.fromEmail) ?? matchPersonIdByName(people, opts.threadName)
}

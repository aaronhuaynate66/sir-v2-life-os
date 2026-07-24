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
  return hits.length === 1 ? hits[0].id : null
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

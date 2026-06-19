// SIR V2 — "Personas mencionadas": detecta TERCEROS referidos en las fechas
// importantes de un contacto (que el import promovió a people.special_dates,
// p.ej. "Cumpleaños del sobrino de Adrian" / "Nacimiento de Emilio (hijo de
// Adrian)") y los vuelve PROPUESTAS para crear su perfil + vínculo + cumple.
// PURO + testeable. NO escribe: el componente confirma y persiste vía el store.

import type { FamilyKind, SpecialDate } from '@/types'
import { normalizeName } from '@/lib/people/matcher'

/** Palabra de parentesco (en el label) → FamilyKind. Lo no mapeable → 'familiar'
 *  (vínculo genérico; el usuario afina con el selector). 'sobrino/a' aún no es
 *  un FamilyKind propio → 'familiar' por ahora. */
const RELATION_TO_KIND: Record<string, FamilyKind> = {
  hijo: 'hijo', hija: 'hija',
  hermano: 'hermano', hermana: 'hermana',
  padre: 'padre', papa: 'padre', papá: 'padre',
  madre: 'madre', mama: 'madre', mamá: 'madre',
  abuelo: 'abuelo', abuela: 'abuela',
  tio: 'tio', tío: 'tio', tia: 'tia', tía: 'tia',
  primo: 'primo', prima: 'prima',
  pareja: 'pareja', esposo: 'pareja', esposa: 'pareja', novio: 'pareja', novia: 'pareja',
  sobrino: 'familiar', sobrina: 'familiar',
  ahijado: 'familiar', ahijada: 'familiar', cuñado: 'familiar', cuñada: 'familiar',
  suegro: 'familiar', suegra: 'familiar', nieto: 'familiar', nieta: 'familiar',
}
const RELATION_WORDS = Object.keys(RELATION_TO_KIND)

export interface MentionedPerson {
  /** id de la SpecialDate origen (para dedupe/descartar). */
  sourceId: string
  rawLabel: string
  /** Nombre propio si el label lo trae; null si solo da la relación. */
  name: string | null
  /** Palabra de parentesco detectada (ej. "sobrino"), o null. */
  relationWord: string | null
  /** FamilyKind del tercero respecto del contacto. */
  kind: FamilyKind
  /** YYYY-MM-DD. */
  dateISO: string
  /** El label es de nacimiento/cumpleaños → la fecha es su cumple. */
  isBirthday: boolean
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Parsea las special_dates de un contacto y devuelve los TERCEROS mencionados.
 *  Excluye el cumpleaños propio del contacto (label sin parentesco). */
export function parseThirdPartyMentions(
  specialDates: SpecialDate[] | undefined,
  contactName: string,
): MentionedPerson[] {
  if (!specialDates || specialDates.length === 0) return []
  const contactFirst = (contactName || '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const out: MentionedPerson[] = []

  for (const sd of specialDates) {
    const label = (sd.label || '').trim()
    if (!label || !sd.date) continue
    const low = label.toLowerCase()
    const isBirthday = /(cumplea|nacimiento|cumple)/.test(low)
    // Quitar el prefijo "cumpleaños de/del", "nacimiento de", "aniversario de".
    const rest = label.replace(/^\s*(?:cumplea[nñ]os|nacimiento|aniversario|cumple)\s+(?:de\s+l?[oa]s?\s+|de\s+|del\s+)?/i, '').trim()
    if (!rest) continue
    const restLow = rest.toLowerCase()

    // Caso A: "{Nombre} ({rel} de {contacto})" — SOLO si el paréntesis trae una
    // palabra de PARENTESCO. Sin parentesco, "Algo (algo)" NO es una persona
    // (ej. "Llegada a Alicante (mudanza/viaje)") → no proponer.
    const paren = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (paren) {
      const name = paren[1].trim()
      const inside = paren[2].toLowerCase()
      const relW = RELATION_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(inside)) ?? null
      const nameFirst = name.split(/\s+/)[0]?.toLowerCase() ?? ''
      // Sin parentesco real, o el "nombre" es el propio contacto / una frase de
      // evento (verbo) → no es un tercero. Saltar.
      if (relW && nameFirst && nameFirst !== contactFirst) {
        out.push({
          sourceId: sd.id, rawLabel: label,
          name: name || null,
          relationWord: relW,
          kind: RELATION_TO_KIND[relW],
          dateISO: sd.date.slice(0, 10), isBirthday,
        })
      }
      continue
    }

    // Caso B: empieza con una palabra de parentesco → "{rel} de {contacto}"
    const firstWord = restLow.split(/\s+/)[0]
    const relW = RELATION_WORDS.find((w) => w === firstWord)
    if (relW) {
      out.push({
        sourceId: sd.id, rawLabel: label,
        name: null,
        relationWord: relW,
        kind: RELATION_TO_KIND[relW],
        dateISO: sd.date.slice(0, 10), isBirthday,
      })
      continue
    }

    // Caso C: "{rel} de {contacto}" en cualquier parte (ej. label sin prefijo)
    const inlineRel = RELATION_WORDS.find((w) => new RegExp(`\\b${w}\\b\\s+de\\b`, 'i').test(restLow))
    if (inlineRel) {
      out.push({
        sourceId: sd.id, rawLabel: label, name: null,
        relationWord: inlineRel, kind: RELATION_TO_KIND[inlineRel],
        dateISO: sd.date.slice(0, 10), isBirthday,
      })
      continue
    }

    // Si no hay parentesco y el nombre ES el contacto → es SU cumple, no tercero.
    // (Sin parentesco y nombre distinto: ambiguo → no lo proponemos para no inventar.)
  }
  return out
}

/** Nombre a usar si el label no traía uno: "Sobrino de {Contacto}". */
export function placeholderName(m: MentionedPerson, contactName: string): string {
  const rel = m.relationWord ? titleCase(m.relationWord) : 'Familiar'
  const first = (contactName || '').trim().split(/\s+/)[0] || contactName
  return `${rel} de ${first}`
}


/**
 * Colapsa menciones que apuntan a la MISMA persona (el import suele crear
 * special_dates duplicadas: "Nacimiento de Emilio" dos veces, sobrino dos veces).
 * Clave: nombre normalizado si lo trae; si no, el parentesco (un solo "sobrino").
 * Entre duplicados, prefiere la que tiene NOMBRE y la que es cumpleaños (dato útil).
 */
export function dedupeMentions(mentions: MentionedPerson[]): MentionedPerson[] {
  const byKey = new Map<string, MentionedPerson>()
  for (const m of mentions) {
    const key = m.name ? `name:${normalizeName(m.name).toLowerCase()}` : `rel:${m.relationWord ?? m.kind}`
    const prev = byKey.get(key)
    if (!prev) { byKey.set(key, m); continue }
    const better = (!prev.name && !!m.name) || (!prev.isBirthday && m.isBirthday)
    if (better) byKey.set(key, m)
  }
  return [...byKey.values()]
}

/** Clave estable de una mención para persistir "ya manejada" (creada/descartada). */
export function mentionKey(m: MentionedPerson): string {
  return m.name ? `name:${normalizeName(m.name).toLowerCase()}` : `rel:${m.relationWord ?? m.kind}`
}

/**
 * ¿Esta mención (con nombre) ya corresponde a una persona EXISTENTE? Match puro
 * de cliente sobre la red en memoria: exacto o subconjunto de tokens (todos los
 * tokens del nombre más corto presentes en el más largo). Solo para menciones
 * CON nombre — las genéricas ("sobrino") no se matchean para no inventar.
 */
export function findExistingByName<T extends { id: string; name: string }>(
  name: string | null,
  people: T[],
): T | null {
  if (!name) return null
  const target = normalizeName(name).toLowerCase()
  if (target.length < 2) return null
  const tt = target.split(/\s+/).filter(Boolean)
  for (const p of people) {
    const pn = normalizeName(p.name).toLowerCase()
    if (pn === target) return p
    const pt = pn.split(/\s+/).filter(Boolean)
    const [short, long] = tt.length <= pt.length ? [tt, pt] : [pt, tt]
    if (short.length >= 1 && short.every((t) => long.includes(t)) && short.some((t) => t.length >= 3)) {
      return p
    }
  }
  return null
}

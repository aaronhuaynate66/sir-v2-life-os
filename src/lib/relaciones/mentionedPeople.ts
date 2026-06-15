// SIR V2 — "Personas mencionadas": detecta TERCEROS referidos en las fechas
// importantes de un contacto (que el import promovió a people.special_dates,
// p.ej. "Cumpleaños del sobrino de Adrian" / "Nacimiento de Emilio (hijo de
// Adrian)") y los vuelve PROPUESTAS para crear su perfil + vínculo + cumple.
// PURO + testeable. NO escribe: el componente confirma y persiste vía el store.

import type { FamilyKind, SpecialDate } from '@/types'

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

    // Caso A: "{Nombre} ({rel} de {contacto})"
    const paren = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (paren) {
      const name = paren[1].trim()
      const inside = paren[2].toLowerCase()
      const relW = RELATION_WORDS.find((w) => inside.includes(w)) ?? null
      out.push({
        sourceId: sd.id, rawLabel: label,
        name: name || null,
        relationWord: relW,
        kind: relW ? RELATION_TO_KIND[relW] : 'familiar',
        dateISO: sd.date.slice(0, 10), isBirthday,
      })
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

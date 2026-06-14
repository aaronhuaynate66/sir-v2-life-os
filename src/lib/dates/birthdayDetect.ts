// SIR V2 — Detección del cumpleaños del contacto entre sus "Fechas importantes".
// PURO + testeable.
//
// El import de WhatsApp guarda el cumpleaños como SpecialDate ("Cumpleaños de
// Adrian · anual · 11 dic") pero NO en people.birth_date (que alimenta la
// tarjeta CUMPLEAÑOS). Además el chat suele dar día/mes pero NO el año de
// nacimiento, así que NO podemos rellenar birth_date con un año real sin
// inventar la edad. Solución: la tarjeta usa este cumpleaños para el countdown
// (día/mes), sin afirmar edad, y el usuario confirma el año si lo sabe.

import type { SpecialDate } from '@/types'
import { parseLocalDate } from './parseLocalDate'

const DAY_MS = 86_400_000

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** ¿La etiqueta es un cumpleaños (no un "nacimiento de [otra persona]")? */
export function isBirthdayLabel(label: string): boolean {
  const n = normalize(label)
  // "cumple"/"cumpleaños"/"natalicio". Excluimos "nacimiento de X" que es el
  // nacimiento de un tercero (un hijo), no el cumpleaños del contacto.
  return n.includes('cumple') || n.includes('natalicio')
}

/**
 * Encuentra el SpecialDate que representa el cumpleaños del contacto. Si se pasa
 * personName, prioriza la etiqueta que lo menciona (evita confundir con el
 * cumpleaños de un tercero registrado en sus fechas). null si no hay.
 */
export function findBirthdaySpecialDate(
  specialDates: SpecialDate[] | undefined | null,
  personName?: string,
): SpecialDate | null {
  const list = (specialDates ?? []).filter((d) => d && isBirthdayLabel(d.label) && !!d.date)
  if (list.length === 0) return null
  if (personName) {
    const first = normalize(personName).split(' ')[0]
    if (first.length >= 2) {
      const named = list.find((d) => normalize(d.label).includes(first))
      if (named) return named
    }
  }
  return list[0]
}

export interface BirthdayOccurrence {
  /** Próxima ocurrencia (día/mes) desde hoy, en fecha local. */
  date: Date
  /** Días enteros hasta esa fecha (0 = hoy). */
  daysUntil: number
}

/**
 * Próxima ocurrencia del día/mes de `dateStr` (ignora el año original — sirve
 * para cumpleaños sin año de nacimiento confiable). null si la fecha no parsea.
 */
export function nextOccurrence(dateStr: string, now: Date = new Date()): BirthdayOccurrence | null {
  const d = parseLocalDate(dateStr)
  if (!d) return null
  const month = d.getMonth()
  const day = d.getDate()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const build = (y: number): Date => {
    const c = new Date(y, month, day)
    if (c.getMonth() !== month) return new Date(y, month + 1, 0) // feb-29 → 28/29
    return c
  }
  let next = build(todayStart.getFullYear())
  if (next.getTime() < todayStart.getTime()) next = build(todayStart.getFullYear() + 1)
  const daysUntil = Math.round((next.getTime() - todayStart.getTime()) / DAY_MS)
  return { date: next, daysUntil }
}

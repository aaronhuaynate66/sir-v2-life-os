// SIR V2 — Countdown de "Fechas importantes" (item #9 del detail page).
//
// Calcula el countdown de cada SpecialDate de una persona:
//   - recurring=true  -> próximo aniversario (este año o el siguiente),
//     misma lógica que BirthdayCountdown (incluye ajuste feb-29 en año no
//     bisiesto). daysUntil siempre >= 0.
//   - recurring=false -> la fecha tal cual; daysUntil puede ser negativo
//     (evento ya pasado), lo señalamos con isPast.
//
// Reusa parseLocalDate (TZ local) para no correr el día en Lima (UTC-5).
// Helper PURO + determinístico salvo por el `now` que recibe (default
// new Date()), igual que el resto de utils de fecha del proyecto.

import type { SpecialDate } from '@/types'
import { parseLocalDate } from './parseLocalDate'

const DAY_MS = 86_400_000

/** Palabras (sin acentos, en minúscula) que marcan un evento INHERENTEMENTE
 *  anual. Un "Aniversario" o "cumple" se repite cada año por definición,
 *  aunque la fila vieja se haya guardado con recurring=false (default viejo
 *  del form). Mantener corto y poco ambiguo para no marcar como anual algo
 *  genuinamente único. */
const ANNUAL_LABEL_HINTS = [
  'aniversario',
  'aniver',
  'cumple', // cubre "cumpleaños", "cumple"
  'santo', // "día del santo"
  'boda', // "bodas", "aniversario de bodas"
  'natalicio',
] as const

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos combinantes
    .toLowerCase()
}

/**
 * ¿La etiqueta implica un evento anual recurrente? Pura. Se usa para:
 *   - auto-default del toggle "se repite cada año" al crear la fecha.
 *   - self-heal de filas viejas (aniversario guardado como one-time antes de
 *     que el form tuviera el default correcto).
 */
export function inferAnnualRecurrence(label: string): boolean {
  const n = normalize(label)
  return ANNUAL_LABEL_HINTS.some((h) => n.includes(h))
}

/** Recurrencia EFECTIVA de una fecha: explícita (recurring=true) o inferida
 *  de la etiqueta. Una sola fuente de verdad para ficha + agenda. */
export function isEffectivelyRecurring(sd: SpecialDate): boolean {
  return sd.recurring || inferAnnualRecurrence(sd.label)
}

export interface SpecialDateCountdown {
  sd: SpecialDate
  /** Recurrencia EFECTIVA usada para el cómputo (explícita o inferida de la
   *  etiqueta). La UI muestra el badge "anual" según esto, no según sd.recurring. */
  recurring: boolean
  /** Ocurrencia relevante: próximo aniversario (recurring) o la fecha
   *  original (one-time). */
  occurrence: Date
  /** Días enteros hasta `occurrence`. >0 futuro, 0 = hoy, <0 = pasado
   *  (solo posible cuando recurring=false). */
  daysUntil: number
  /** true si es un evento único que ya ocurrió. */
  isPast: boolean
}

/** medianoche local de hoy (a partir de `now`). */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Próxima ocurrencia anual de (month, day) >= todayStart. Maneja el
 *  desborde feb-29 → 28-feb en años no bisiestos (mismo criterio que
 *  BirthdayCountdown.computeNextBirthday). */
function nextAnnualOccurrence(month: number, day: number, todayStart: Date): Date {
  const build = (y: number): Date => {
    const candidate = new Date(y, month, day)
    // Si el mes desbordó (feb-29 en año no bisiesto rueda a mar-01),
    // caemos al último día del mes objetivo.
    if (candidate.getMonth() !== month) return new Date(y, month + 1, 0)
    return candidate
  }
  let next = build(todayStart.getFullYear())
  if (next.getTime() < todayStart.getTime()) {
    next = build(todayStart.getFullYear() + 1)
  }
  return next
}

/** Calcula el countdown de una SpecialDate. Devuelve null si la fecha es
 *  inválida (parseLocalDate ya valida por round-trip). */
export function computeSpecialDateCountdown(
  sd: SpecialDate,
  now: Date = new Date(),
): SpecialDateCountdown | null {
  const parsed = parseLocalDate(sd.date)
  if (!parsed) return null

  const todayStart = startOfDay(now)
  // Recurrencia efectiva: explícita O inferida de la etiqueta (un "Aniversario"
  // es anual aunque la fila vieja esté guardada como one-time).
  const recurring = isEffectivelyRecurring(sd)

  if (recurring) {
    const occurrence = nextAnnualOccurrence(parsed.getMonth(), parsed.getDate(), todayStart)
    const daysUntil = Math.round((occurrence.getTime() - todayStart.getTime()) / DAY_MS)
    return { sd, recurring, occurrence, daysUntil, isPast: false }
  }

  const occurrence = parsed
  const daysUntil = Math.round((occurrence.getTime() - todayStart.getTime()) / DAY_MS)
  return { sd, recurring, occurrence, daysUntil, isPast: daysUntil < 0 }
}

/**
 * Computa + ordena las fechas para render. Orden:
 *   1. Próximas (hoy + futuro) por cercanía ascendente (lo más pronto arriba).
 *   2. Pasadas (solo one-time) al final, las más recientes primero.
 * Las fechas con formato inválido se devuelven aparte para un render honesto.
 */
export function sortSpecialDates(
  dates: SpecialDate[],
  now: Date = new Date(),
): { valid: SpecialDateCountdown[]; invalid: SpecialDate[] } {
  const valid: SpecialDateCountdown[] = []
  const invalid: SpecialDate[] = []

  for (const sd of dates) {
    const cd = computeSpecialDateCountdown(sd, now)
    if (cd) valid.push(cd)
    else invalid.push(sd)
  }

  valid.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1
    // Pasadas: -1 (ayer) antes que -30 (hace un mes).
    if (a.isPast) return b.daysUntil - a.daysUntil
    // Próximas: 0/1/2... ascendente.
    return a.daysUntil - b.daysUntil
  })

  return { valid, invalid }
}

const DAY_MONTH = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'long' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

/** Fecha absoluta legible. recurring → "14 de junio"; one-time → con año.
 *  Usa la recurrencia EFECTIVA (cd.recurring), no sd.recurring. */
export function formatSpecialDate(cd: SpecialDateCountdown): string {
  return cd.recurring
    ? DAY_MONTH.format(cd.occurrence)
    : DAY_MONTH_YEAR.format(cd.occurrence)
}

/** Frase de countdown: "¡Hoy!", "en N días", "hace N días". */
export function formatCountdownPhrase(cd: SpecialDateCountdown): string {
  const { daysUntil, isPast } = cd
  if (daysUntil === 0) return '¡Hoy!'
  if (isPast) {
    const n = Math.abs(daysUntil)
    return `hace ${n} día${n === 1 ? '' : 's'}`
  }
  return `en ${daysUntil} día${daysUntil === 1 ? '' : 's'}`
}

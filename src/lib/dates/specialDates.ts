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
  return effectiveCadence(sd) !== 'once'
}

export type Cadence = 'once' | 'yearly' | 'monthly'

/** Palabras que sugieren un hito MENSUAL (aniversario del mes / "mesario").
 *  Se usa para inferir la cadencia y para proponer marcarla como mensual. */
const MONTHLY_LABEL_HINTS = [
  'mensual',
  'mes de relacion',
  'meses de relacion',
  'meses juntos',
  'mesario',
  'cada mes',
  'feliz mes',
] as const

/** ¿La etiqueta implica un hito mensual? Pura. */
export function inferMonthlyRecurrence(label: string): boolean {
  const n = normalize(label)
  return MONTHLY_LABEL_HINTS.some((h) => n.includes(h))
}

/** Cadencia EFECTIVA: explícita (`cadence`) gana; si no, se infiere de la
 *  etiqueta (mensual > anual) y del flag legacy `recurring`. Una sola fuente de
 *  verdad para ficha, agenda y brief. */
export function effectiveCadence(sd: SpecialDate): Cadence {
  if (sd.cadence) return sd.cadence
  if (inferMonthlyRecurrence(sd.label)) return 'monthly'
  if (sd.recurring || inferAnnualRecurrence(sd.label)) return 'yearly'
  return 'once'
}

export interface SpecialDateCountdown {
  sd: SpecialDate
  /** Recurrencia EFECTIVA usada para el cómputo (explícita o inferida de la
   *  etiqueta). La UI muestra el badge "anual" según esto, no según sd.recurring.
   *  true si la cadencia es anual O mensual (cualquier repetición). */
  recurring: boolean
  /** Cadencia efectiva del cómputo (once | yearly | monthly). */
  cadence: Cadence
  /** Ocurrencia relevante: próxima ocurrencia (yearly/monthly) o la fecha
   *  original (once). */
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

/** Próxima ocurrencia MENSUAL del día `day` (1-31) >= todayStart. Si el mes no
 *  tiene ese día (ej. 31 en abril, 30 en feb), cae al último día del mes. */
function nextMonthlyOccurrence(day: number, todayStart: Date): Date {
  const build = (y: number, m: number): Date => {
    const candidate = new Date(y, m, day)
    if (candidate.getMonth() !== ((m % 12) + 12) % 12) return new Date(y, m + 1, 0) // desbordó → último día
    return candidate
  }
  let next = build(todayStart.getFullYear(), todayStart.getMonth())
  if (next.getTime() < todayStart.getTime()) {
    next = build(todayStart.getFullYear(), todayStart.getMonth() + 1)
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
  // Cadencia efectiva: explícita O inferida de la etiqueta (un "Aniversario" es
  // anual, un "mes de relación" es mensual, aunque la fila vieja esté guardada
  // como one-time).
  const cadence = effectiveCadence(sd)
  const recurring = cadence !== 'once'

  if (cadence === 'monthly') {
    const occurrence = nextMonthlyOccurrence(parsed.getDate(), todayStart)
    const daysUntil = Math.round((occurrence.getTime() - todayStart.getTime()) / DAY_MS)
    return { sd, recurring, cadence, occurrence, daysUntil, isPast: false }
  }
  if (cadence === 'yearly') {
    const occurrence = nextAnnualOccurrence(parsed.getMonth(), parsed.getDate(), todayStart)
    const daysUntil = Math.round((occurrence.getTime() - todayStart.getTime()) / DAY_MS)
    return { sd, recurring, cadence, occurrence, daysUntil, isPast: false }
  }

  const occurrence = parsed
  const daysUntil = Math.round((occurrence.getTime() - todayStart.getTime()) / DAY_MS)
  return { sd, recurring, cadence, occurrence, daysUntil, isPast: daysUntil < 0 }
}

/**
 * Computa + ordena las fechas para render. Orden:
 *   1. Próximas (hoy + futuro) por cercanía ascendente (lo más pronto arriba).
 *   2. Pasadas (solo one-time) al final, las más recientes primero.
 * Las fechas con formato inválido se devuelven aparte para un render honesto.
 */
/** Normaliza un label para deduplicar (minúsculas, sin acentos, espacios colapsados). */
function normSpecialLabel(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

/** Colapsa fechas especiales duplicadas, CONSCIENTE de la cadencia efectiva:
 *   - monthly → por DÍA-DEL-MES (todas las "aniversario mensual del 13", "feliz
 *     mes", "10 meses" caen en la misma clave → una sola). Conserva la de label
 *     más informativo (la que menciona "aniversario"/"mensual").
 *   - yearly  → por MES-DÍA.
 *   - once    → por (label normalizado + fecha).
 *  Necesario porque imports viejos dejaron el mismo hito repetido con labels y
 *  fechas distintas (caso Diana: el mesario aparecía 3×). */
export function dedupeSpecialDates(dates: SpecialDate[]): SpecialDate[] {
  const chosen = new Map<string, SpecialDate>()
  const order: string[] = []
  for (const d of dates) {
    const parsed = parseLocalDate(d.date)
    // Solo el caso MENSUAL colapsa por día-del-mes (junta labels/fechas distintas
    // del mismo mesario). Anual/one-time mantienen la clave clásica (label+fecha)
    // para no fusionar aniversarios legítimos de años distintos.
    const key = parsed && effectiveCadence(d) === 'monthly'
      ? `m:${parsed.getDate()}`
      : `o:${normSpecialLabel(d.label ?? '')}|${(d.date ?? '').slice(0, 10)}`
    const prev = chosen.get(key)
    if (!prev) { chosen.set(key, d); order.push(key); continue }
    // Empate: preferir el label más específico (aniversario/mensual > genérico).
    if (labelScore(d.label) > labelScore(prev.label)) chosen.set(key, d)
  }
  return order.map((k) => chosen.get(k)!)
}

/** Puntúa cuán "canónico" es un label de hito para elegir cuál conservar. */
function labelScore(label: string | undefined): number {
  const n = normalize(label ?? '')
  let s = n.length > 0 ? 1 : 0
  if (n.includes('aniversario')) s += 3
  if (n.includes('mensual') || n.includes('cada mes')) s += 2
  if (/\bmes\b|meses/.test(n)) s += 1
  return s
}

export function sortSpecialDates(
  dates: SpecialDate[],
  now: Date = new Date(),
): { valid: SpecialDateCountdown[]; invalid: SpecialDate[] } {
  const valid: SpecialDateCountdown[] = []
  const invalid: SpecialDate[] = []

  for (const sd of dedupeSpecialDates(dates)) {
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

/** Fecha absoluta legible. monthly → "13 de cada mes"; yearly → "14 de junio";
 *  once → con año. Usa la cadencia EFECTIVA (cd.cadence), no sd.recurring. */
export function formatSpecialDate(cd: SpecialDateCountdown): string {
  if (cd.cadence === 'monthly') return `${cd.occurrence.getDate()} de cada mes`
  return cd.cadence === 'yearly'
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

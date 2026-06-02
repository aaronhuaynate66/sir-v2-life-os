// SIR V2 — Agenda "Próximo" (Feature 1, agregador determinístico).
//
// Agrega data que YA existe en los stores y hoy queda enterrada, en una
// sola lista accionable ordenada por urgencia/cercanía:
//
//   - critical_signal : señales sin resolver, accionables, urgentes.
//   - no_contact      : "no contactás a X hace N días" (umbral según
//                       importancia; usa person.lastContact).
//   - goal_target     : objetivos activos con targetDate cercana (o vencida).
//   - objective_step  : próximo paso pendiente de cada objetivo activo (el
//                       "qué hacer ahora" para avanzar; uno por objetivo).
//   - birthday        : cumpleaños próximos de TODA la red (no por-persona).
//   - special_date    : fechas especiales (people.special_dates) de TODA
//                       la red — la "agenda global de fechas" (#5 plegada acá).
//
// PURO + determinístico: cero deps, cero LLM, cero red. Recibe `now`
// explícito (default new Date()) igual que el resto de utils de fecha del
// proyecto → tests TZ-independientes.
//
// Reusa computeSpecialDateCountdown (countdown de fechas con manejo de
// feb-29 y anniversaries) para birthdays y special_dates: una sola fuente
// de verdad para "próxima ocurrencia anual" en todo el sistema.

import type { Goal, ObjectiveStep, Person, Signal, SpecialDate } from '@/types'
import {
  computeSpecialDateCountdown,
  type SpecialDateCountdown,
} from '@/lib/dates/specialDates'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { nextPendingLeaf, daysUntilStep } from '@/lib/objectives/steps'

const DAY_MS = 86_400_000

export type AgendaKind =
  | 'critical_signal'
  | 'no_contact'
  | 'goal_target'
  | 'objective_step'
  | 'birthday'
  | 'special_date'

export interface AgendaItem {
  /** Id estable derivado de la fuente (para keys de React + dedupe). */
  id: string
  kind: AgendaKind
  /** Título corto, listo para UI ("Cumpleaños de Diana"). */
  title: string
  /** Detalle contextual ("cumple 31 · en 5 días", "hace 24 días"). */
  detail: string
  /**
   * Días (con signo) relevantes para el orden:
   *   - fechas futuras (cumple/fecha/objetivo): >= 0 (0 = hoy).
   *   - objetivos vencidos: < 0.
   *   - no_contact: negativo = -(días sin contacto) → más vencido primero.
   *   - critical_signal: 0 (es "ahora").
   */
  daysUntil: number
  /** Persona vinculada, si aplica (link al detail page). */
  personId?: string
  /** Slug de la persona para construir el href, si está disponible. */
  personSlug?: string
  /** Ruta sugerida al hacer click. */
  href: string
  /** Rango de grupo para el orden (menor = más arriba). Interno pero
   *  expuesto para tests. */
  sortRank: number
}

export interface AgendaInput {
  people: Person[]
  goals: Goal[]
  signals: Signal[]
  /** Pasos de objetivos (migración 0040). Opcional: si no se pasan, no se
   *  surfacéa el "próximo paso" (compat con callers viejos). */
  objectiveSteps?: ObjectiveStep[]
}

export interface AgendaOptions {
  /** Ventana en días para considerar fechas futuras "próximas". Default 30. */
  horizonDays?: number
  /** Umbral base de días sin contacto para alertar. Default 30. */
  noContactThresholdDays?: number
  /** Umbral más corto para personas de alta importancia (>=8). Default 14. */
  highImportanceThresholdDays?: number
  /** Límite de items devueltos (tras ordenar). undefined = sin límite. */
  limit?: number
}

const RANK: Record<string, number> = {
  signal_immediate: 0,
  signal_soon: 1,
  no_contact: 2,
  dated: 3,
  // Próximo paso SIN fecha: accionable pero no time-bound → debajo de lo datado
  // (los pasos CON fecha entran como 'dated' y compiten por cercanía).
  next_step: 4,
}

/** medianoche local de hoy. */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function pluralDias(n: number): string {
  const abs = Math.abs(n)
  return `${abs} día${abs === 1 ? '' : 's'}`
}

/** Frase de cercanía a futuro: "hoy", "mañana", "en N días". */
function futurePhrase(daysUntil: number): string {
  if (daysUntil === 0) return 'hoy'
  if (daysUntil === 1) return 'mañana'
  return `en ${pluralDias(daysUntil)}`
}

function personHref(person: Person): string {
  return person.slug ? `/relaciones/${person.slug}` : `/relaciones/${person.id}`
}

/** Edad que cumple en la próxima ocurrencia, si birthDate trae año real. */
function ageTurning(birthIso: string, occurrence: Date): number | null {
  const born = parseLocalDate(birthIso)
  if (!born) return null
  const age = occurrence.getFullYear() - born.getFullYear()
  return age > 0 && age < 130 ? age : null
}

function buildBirthdays(
  people: Person[],
  horizonDays: number,
  now: Date,
): AgendaItem[] {
  const items: AgendaItem[] = []
  for (const p of people) {
    if (!p.birthDate) continue
    const cd = computeSpecialDateCountdown(
      { id: `bday_${p.id}`, label: 'Cumpleaños', date: p.birthDate, recurring: true },
      now,
    )
    if (!cd || cd.daysUntil > horizonDays) continue
    const age = ageTurning(p.birthDate, cd.occurrence)
    const detail = [age != null ? `cumple ${age}` : null, futurePhrase(cd.daysUntil)]
      .filter(Boolean)
      .join(' · ')
    items.push({
      id: `birthday_${p.id}`,
      kind: 'birthday',
      title: `Cumpleaños de ${p.name}`,
      detail,
      daysUntil: cd.daysUntil,
      personId: p.id,
      personSlug: p.slug,
      href: personHref(p),
      sortRank: RANK.dated,
    })
  }
  return items
}

function buildSpecialDates(
  people: Person[],
  horizonDays: number,
  now: Date,
): AgendaItem[] {
  const items: AgendaItem[] = []
  for (const p of people) {
    const dates: SpecialDate[] = p.specialDates ?? []
    for (const sd of dates) {
      const cd: SpecialDateCountdown | null = computeSpecialDateCountdown(sd, now)
      if (!cd) continue
      // One-time ya pasadas no entran a la agenda (no son accionables).
      if (cd.isPast) continue
      if (cd.daysUntil > horizonDays) continue
      items.push({
        id: `special_${p.id}_${sd.id}`,
        kind: 'special_date',
        title: `${sd.label} · ${p.name}`,
        detail: futurePhrase(cd.daysUntil),
        daysUntil: cd.daysUntil,
        personId: p.id,
        personSlug: p.slug,
        href: personHref(p),
        sortRank: RANK.dated,
      })
    }
  }
  return items
}

function buildNoContact(
  people: Person[],
  baseThreshold: number,
  highImportanceThreshold: number,
  now: Date,
): AgendaItem[] {
  const todayStart = startOfDay(now)
  const items: AgendaItem[] = []
  for (const p of people) {
    // Sin lastContact no clasificamos (no inventamos urgencia sobre data
    // ausente; invariante #5). El usuario verá la persona en /relaciones.
    const last = parseLocalDate(p.lastContact)
    if (!last) continue
    const daysSince = Math.floor((todayStart.getTime() - last.getTime()) / DAY_MS)
    if (daysSince < 0) continue // lastContact en el futuro: dato raro, skip.
    const threshold =
      p.importanceScore >= 8 ? highImportanceThreshold : baseThreshold
    if (daysSince < threshold) continue
    items.push({
      id: `nocontact_${p.id}`,
      kind: 'no_contact',
      title: `Hace tiempo no contactás a ${p.name}`,
      detail: `hace ${pluralDias(daysSince)}`,
      daysUntil: -daysSince, // más vencido (más negativo) ordena primero.
      personId: p.id,
      personSlug: p.slug,
      href: personHref(p),
      sortRank: RANK.no_contact,
    })
  }
  return items
}

function buildGoalTargets(
  goals: Goal[],
  horizonDays: number,
  now: Date,
): AgendaItem[] {
  const todayStart = startOfDay(now)
  const items: AgendaItem[] = []
  for (const g of goals) {
    if (g.status !== 'active' || !g.targetDate) continue
    const target = parseLocalDate(g.targetDate)
    if (!target) continue
    const daysUntil = Math.round((target.getTime() - todayStart.getTime()) / DAY_MS)
    // Incluye vencidos (daysUntil < 0): un objetivo activo vencido es lo
    // MÁS urgente de su grupo. Futuros sólo dentro del horizonte.
    if (daysUntil > horizonDays) continue
    const detail =
      daysUntil < 0 ? `vencido hace ${pluralDias(daysUntil)}` : futurePhrase(daysUntil)
    items.push({
      id: `goal_${g.id}`,
      kind: 'goal_target',
      title: `Objetivo: ${g.title}`,
      detail,
      daysUntil,
      href: '/objetivos',
      sortRank: RANK.dated,
    })
  }
  return items
}

/**
 * Próxima TAREA accionable de cada objetivo activo: el "qué hacer AHORA para
 * avanzar". Recorre el árbol OKR (KR → tareas) y devuelve la HOJA pendiente —
 * la tarea concreta, no el KR (un KR es un outcome, no una acción). Un solo
 * item por objetivo para no inundar la agenda. Complementa goal_target
 * (deadline del objetivo) con la acción concreta inmediata.
 *
 *   - Tarea CON fecha → rank 'dated' (compite por cercanía con objetivos y
 *     fechas; incluye vencidas, excluye futuras fuera del horizonte).
 *   - Tarea SIN fecha → rank 'next_step' (debajo de lo datado; daysUntil 0).
 *
 * (Un KR sin tareas todavía es su propia hoja: hasta que se descompone, surfacéa
 * el KR como acción siguiente.)
 */
function buildObjectiveSteps(
  goals: Goal[],
  steps: ObjectiveStep[],
  horizonDays: number,
  now: Date,
): AgendaItem[] {
  const items: AgendaItem[] = []
  const activeIds = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id))
  const titleById = new Map(goals.map((g) => [g.id, g.title]))

  // Agrupar nodos por objetivo (solo objetivos activos).
  const byObjective = new Map<string, ObjectiveStep[]>()
  for (const s of steps) {
    if (!activeIds.has(s.objectiveId)) continue
    const arr = byObjective.get(s.objectiveId)
    if (arr) arr.push(s)
    else byObjective.set(s.objectiveId, [s])
  }

  for (const [objectiveId, objSteps] of byObjective) {
    const next = nextPendingLeaf(objSteps)
    if (!next) continue // todo hecho → nada que surfacéar.
    const goalTitle = titleById.get(objectiveId) ?? 'Objetivo'
    const days = daysUntilStep(next, now)

    if (days != null) {
      // Paso con fecha: mismo trato que un objetivo datado.
      if (days > horizonDays) continue // futuro lejano: aún no urge.
      const datePhrase = days < 0 ? `vencido hace ${pluralDias(days)}` : futurePhrase(days)
      items.push({
        id: `step_${next.id}`,
        kind: 'objective_step',
        title: `Paso: ${next.title}`,
        detail: `${goalTitle} · ${datePhrase}`,
        daysUntil: days,
        href: '/objetivos',
        sortRank: RANK.dated,
      })
    } else {
      // Paso sin fecha: accionable, no time-bound.
      items.push({
        id: `step_${next.id}`,
        kind: 'objective_step',
        title: `Paso: ${next.title}`,
        detail: `${goalTitle} · siguiente acción`,
        daysUntil: 0,
        href: '/objetivos',
        sortRank: RANK.next_step,
      })
    }
  }
  return items
}

function buildCriticalSignals(signals: Signal[]): AgendaItem[] {
  const items: AgendaItem[] = []
  for (const s of signals) {
    if (s.resolved) continue
    if (!s.actionRequired) continue
    if (s.urgency !== 'immediate' && s.urgency !== 'soon') continue
    items.push({
      id: `signal_${s.id}`,
      kind: 'critical_signal',
      title: s.content,
      detail: s.suggestedAction ?? (s.urgency === 'immediate' ? 'Requiere atención inmediata' : 'Requiere atención pronto'),
      daysUntil: 0,
      href: '/senales',
      sortRank: s.urgency === 'immediate' ? RANK.signal_immediate : RANK.signal_soon,
    })
  }
  return items
}

/**
 * Construye la agenda "Próximo": agrega todas las fuentes, ordena por
 * urgencia/cercanía y opcionalmente recorta.
 *
 * Orden: por sortRank ascendente (señales inmediatas → pronto →
 * sin-contacto → fechas), y dentro de cada grupo por daysUntil ascendente
 * (lo más vencido/cercano primero), desempate por título.
 */
export function buildAgenda(
  input: AgendaInput,
  options: AgendaOptions = {},
  now: Date = new Date(),
): AgendaItem[] {
  const horizonDays = options.horizonDays ?? 30
  const baseThreshold = options.noContactThresholdDays ?? 30
  const highThreshold = options.highImportanceThresholdDays ?? 14

  const items: AgendaItem[] = [
    ...buildCriticalSignals(input.signals),
    ...buildNoContact(input.people, baseThreshold, highThreshold, now),
    ...buildGoalTargets(input.goals, horizonDays, now),
    ...buildObjectiveSteps(input.goals, input.objectiveSteps ?? [], horizonDays, now),
    ...buildBirthdays(input.people, horizonDays, now),
    ...buildSpecialDates(input.people, horizonDays, now),
  ]

  items.sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
    return a.title.localeCompare(b.title, 'es')
  })

  return options.limit != null ? items.slice(0, options.limit) : items
}

// SIR V2 — Cockpit operativo de /horario (Fase 1), lógica pura.
//
// /horario dejó de ser un espejo pasivo del calendario: cruza el calendario con
// la data REAL de SIR (OKRs, fechas de la red) en tres horizontes — Día, Semana
// y Mes. Este módulo es TODA la fusión determinística; la UI sólo pinta.
//
// Reusa las fuentes de verdad existentes — NO duplica lógica de fecha:
//   - computeSpecialDateCountdown (lib/dates/specialDates): próxima ocurrencia
//     anual de cumpleaños/aniversarios (maneja feb-29, infiere recurrencia por
//     etiqueta). Una sola fuente para countdowns de fechas en todo el sistema.
//   - daysUntilStep / isTask / keyResults… (lib/objectives/steps): el árbol OKR.
//   - toLimaDateOnly (lib/calendar/ics): día Lima de un evento del calendario.
//
// PURO + determinístico: `now` se inyecta (default new Date()), igual que el
// resto de utils de fecha del proyecto → tests TZ-independientes.
//
// PREPARADO PARA FASE 2 (NO implementada): los buckets ya cargan el contexto
// (eventos + tareas + estado) que un "brief de preparación por bloque" o un
// "plan del día con grounding" consumirían; se agregarían como campos nuevos
// sin reescribir esta fusión.

import type { CalendarEvent } from '@/lib/calendar/types'
import { toLimaDateOnly } from '@/lib/calendar/ics'
import type {
  Goal,
  GoalPriority,
  ObjectiveStep,
  ObjectiveStepStatus,
  Person,
  TaskEffort,
  TaskPriority,
} from '@/types'
import { computeSpecialDateCountdown } from '@/lib/dates/specialDates'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import {
  isTask,
  isKeyResult,
  keyResultsForObjective,
  tasksForKeyResult,
  computeKeyResultProgress,
  daysUntilStep,
  isStepBlocked,
} from '@/lib/objectives/steps'

const DAY_MS = 86_400_000

export type Horizon = 'dia' | 'semana' | 'mes'

/** Ventana (en días, inclusiva desde HOY) de cada horizonte para tareas/eventos.
 *  - dia   : sólo hoy.
 *  - semana: ventana MÓVIL de 7 días (hoy + 6).
 *  - mes   : ventana MÓVIL de ~31 días (overview de carga del mes próximo). */
export const HORIZON_WINDOW_DAYS: Record<Horizon, number> = { dia: 0, semana: 6, mes: 31 }

/** Lead-time de avisos de fechas de la red (cumpleaños/aniversarios): cuántos
 *  días ANTES empezamos a empujar ("comprale algo / planeá un detalle"). El
 *  pedido fue 1–2 semanas de anticipación → 14 días en Semana, el mes completo
 *  en Mes. */
export const CONTACT_LEAD_DAYS: Record<Exclude<Horizon, 'dia'>, number> = { semana: 14, mes: 31 }

// ─── Modelo del cockpit ───────────────────────────────────────────────

/** Una tarea/hoja OKR con fecha que cae en el horizonte. */
export interface CockpitTask {
  id: string
  title: string
  objectiveId: string
  objectiveTitle: string
  status: ObjectiveStepStatus
  /** Días con signo hasta la fecha (0 = hoy, <0 = vencida). */
  daysUntil: number
  overdue: boolean
  /** Bloqueada: marcada 'blocked' o con una dependencia sin completar (0050). */
  blocked: boolean
  /** Prioridad Jira-light, si la tarea la tiene (0050). */
  priority?: TaskPriority
  /** Esfuerzo Jira-light, si la tarea lo tiene (0050). */
  effort?: TaskEffort
  /**
   * Hora del día asignada ('HH:mm', reloj Lima) si `targetDate` trae componente
   * horario ('YYYY-MM-DDTHH:mm'). Hoy la columna `target_date` es date-only, así
   * que esto suele ser undefined → la tarea va a "Vencen hoy". Cuando SÍ hay
   * hora, /horario la fusiona en la línea del día (lib/horario/dayPlan).
   */
  dueTime?: string
  href: string
}

/** 'HH:mm' (reloj Lima) si `targetDate` trae componente horario; si no, undefined. */
const STEP_TIME_RE = /T(\d{2}):(\d{2})/
function parseStepTime(targetDate: string | undefined): string | undefined {
  if (!targetDate) return undefined
  const m = STEP_TIME_RE.exec(targetDate)
  if (!m) return undefined
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return undefined
  return `${m[1]}:${m[2]}`
}

/** Rank de prioridad para ordenar (high primero); ausente = lo último. */
const TASK_PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 }
function priorityRank(p: TaskPriority | undefined): number {
  return p ? TASK_PRIORITY_RANK[p] : 3
}

/** Una fecha de la red (cumpleaños o fecha especial) con aviso anticipado. */
export interface CockpitDate {
  id: string
  kind: 'birthday' | 'special_date'
  title: string
  detail: string
  /** Días hasta la próxima ocurrencia (>= 0). */
  daysUntil: number
  /** Empujón accionable según el lead-time ("Con tiempo: planeá un detalle"). */
  nudge: string
  personId?: string
  personSlug?: string
  href: string
}

/** Un Resultado Clave priorizado para el "foco de la semana". */
export interface FocusKR {
  id: string
  title: string
  objectiveId: string
  objectiveTitle: string
  goalPriority: GoalPriority
  /** Deadline más cercano (propio o de sus tareas pendientes). null = sin fecha. */
  daysUntil: number | null
  /** Progreso del KR (0..100). */
  progressPct: number
  href: string
}

/** Un hito/deadline del mes (target de objetivo, deadline de tarea, o fecha). */
export interface CockpitMilestone {
  id: string
  kind: 'goal_target' | 'step_deadline' | 'date'
  title: string
  detail: string
  daysUntil: number
  overdue: boolean
  personSlug?: string
  href: string
}

/** Un día de la vista Semana: eventos del calendario + tareas OKR que vencen. */
export interface CockpitDayBucket {
  /** 'YYYY-MM-DD' (Lima). */
  dateKey: string
  /** Offset en días desde hoy (0..6). */
  offset: number
  isToday: boolean
  /** Eventos del calendario de ese día (con hora + all-day), ordenados. */
  events: CalendarEvent[]
  /** Tareas OKR que vencen ese día (las vencidas caen en hoy). */
  tasks: CockpitTask[]
}

export interface Cockpit {
  horizon: Horizon
  /** DÍA: tareas OKR que vencen hoy (incluye vencidas: siguen siendo de hoy). */
  tasksToday: CockpitTask[]
  /** SEMANA: 1–3 KRs más prioritarios/urgentes. */
  focus: FocusKR[]
  /** SEMANA: 7 días (hoy..+6) con eventos + tareas. */
  weekDays: CockpitDayBucket[]
  /** SEMANA: fechas de la red dentro del lead-time (avisos anticipados). */
  contactDates: CockpitDate[]
  /** MES: hitos y deadlines del horizonte (targets, deadlines, fechas). */
  milestones: CockpitMilestone[]
}

export interface CockpitInput {
  goals: Goal[]
  objectiveSteps: ObjectiveStep[]
  people: Person[]
  events: CalendarEvent[]
}

// ─── Helpers de formato (locales y triviales; la lógica de fecha se reusa) ──

function pluralDias(n: number): string {
  const abs = Math.abs(n)
  return `${abs} día${abs === 1 ? '' : 's'}`
}

/** "hoy" / "mañana" / "en N días" / "vencida hace N días". */
function datePhrase(daysUntil: number): string {
  if (daysUntil < 0) return `vencida hace ${pluralDias(daysUntil)}`
  if (daysUntil === 0) return 'hoy'
  if (daysUntil === 1) return 'mañana'
  return `en ${pluralDias(daysUntil)}`
}

/** Frase de fecha futura (sin caso vencido): countdown de la red. */
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

const ANNIVERSARY_HINTS = ['aniver', 'boda', 'matrimonio', 'noviazgo']
const SAINT_HINTS = ['santo']

function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Empujón accionable, calibrado por el lead-time (cuánto falta). */
function contactNudge(kind: CockpitDate['kind'], label: string, daysUntil: number): string {
  const soon = daysUntil <= 1
  if (kind === 'birthday') {
    if (soon) return 'Es ya: escribile y saludalo'
    if (daysUntil <= 7) return 'Esta semana: conseguí un detalle'
    return 'Con tiempo: planeá un regalo'
  }
  const n = normalizeLabel(label)
  if (ANNIVERSARY_HINTS.some((h) => n.includes(h))) {
    return soon ? 'Es ya: confirmá tu plan' : 'Planeá algo especial'
  }
  if (SAINT_HINTS.some((h) => n.includes(h))) return 'Mandale un saludo'
  return soon ? 'Tenelo presente hoy' : 'Tenelo en el radar'
}

// ─── Tareas OKR con fecha en el horizonte ──────────────────────────────

/**
 * Hojas accionables del árbol OKR: las TAREAS (kind='task') y los KRs que
 * todavía no se descompusieron en tareas (un KR sin hijos ES su propia hoja).
 * No incluye KRs con tareas (el deadline relevante vive en sus tareas).
 */
function leafSteps(steps: ObjectiveStep[]): ObjectiveStep[] {
  const childCount = new Map<string, number>()
  for (const s of steps) {
    if (isTask(s) && s.parentId) childCount.set(s.parentId, (childCount.get(s.parentId) ?? 0) + 1)
  }
  return steps.filter((s) => isTask(s) || (isKeyResult(s) && (childCount.get(s.id) ?? 0) === 0))
}

export interface TaskRangeOptions {
  /** Tope superior de días (inclusivo). */
  maxDays: number
  /** Incluir tareas vencidas (días < 0). Default true. */
  includeOverdue?: boolean
}

/**
 * Tareas OKR (hojas, no 'hecho') de objetivos ACTIVOS con fecha dentro del
 * rango [includeOverdue ? -∞ : 0, maxDays]. Atraviesa TODOS los objetivos
 * (no uno por objetivo como la agenda): para "vencen hoy / esta semana"
 * queremos la lista completa. Ordena por cercanía (lo más vencido/próximo
 * primero), desempate por título.
 */
export function tasksDueInRange(
  goals: Goal[],
  steps: ObjectiveStep[],
  opts: TaskRangeOptions,
  now: Date = new Date(),
): CockpitTask[] {
  const includeOverdue = opts.includeOverdue ?? true
  const titleById = new Map(goals.filter((g) => g.status === 'active').map((g) => [g.id, g.title]))
  const out: CockpitTask[] = []
  for (const s of leafSteps(steps)) {
    const goalTitle = titleById.get(s.objectiveId)
    if (goalTitle === undefined) continue // objetivo no activo (o inexistente)
    if (s.status === 'hecho') continue
    const days = daysUntilStep(s, now)
    if (days == null) continue // sin fecha
    if (days > opts.maxDays) continue
    if (!includeOverdue && days < 0) continue
    out.push({
      id: `task_${s.id}`,
      title: s.title,
      objectiveId: s.objectiveId,
      objectiveTitle: goalTitle,
      status: s.status,
      daysUntil: days,
      overdue: days < 0,
      blocked: isStepBlocked(s, steps),
      priority: s.priority,
      effort: s.effort,
      dueTime: parseStepTime(s.targetDate),
      href: '/objetivos',
    })
  }
  // Orden: por cercanía (vencido/próximo primero), luego prioridad (alta primero),
  // desempate por título. La prioridad desempata tareas que vencen el mismo día.
  out.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      priorityRank(a.priority) - priorityRank(b.priority) ||
      a.title.localeCompare(b.title, 'es'),
  )
  return out
}

// ─── Foco de la semana: KRs prioritarios/urgentes ──────────────────────

const PRIORITY_RANK: Record<GoalPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/**
 * 1–`max` Resultados Clave más prioritarios/urgentes de los objetivos activos.
 * Un KR cuenta como candidato si NO está completo (rollup < 100%). Su urgencia
 * es el deadline más cercano entre su propia fecha y la de sus tareas pendientes.
 * Orden: primero los datados por cercanía (vencidos arriba), luego los sin fecha
 * por prioridad del objetivo; desempate por título.
 */
export function focusKeyResults(
  goals: Goal[],
  steps: ObjectiveStep[],
  now: Date = new Date(),
  max = 3,
): FocusKR[] {
  const candidates: FocusKR[] = []
  for (const g of goals) {
    if (g.status !== 'active') continue
    for (const kr of keyResultsForObjective(steps, g.id)) {
      const tasks = tasksForKeyResult(steps, kr.id)
      const prog = computeKeyResultProgress(tasks, kr)
      if (prog.percent === 100) continue // ya cumplido → no es foco
      const deadlines: number[] = []
      const krDays = daysUntilStep(kr, now)
      if (krDays != null) deadlines.push(krDays)
      for (const t of tasks) {
        if (t.status === 'hecho') continue
        const d = daysUntilStep(t, now)
        if (d != null) deadlines.push(d)
      }
      candidates.push({
        id: `kr_${kr.id}`,
        title: kr.title,
        objectiveId: g.id,
        objectiveTitle: g.title,
        goalPriority: g.priority,
        daysUntil: deadlines.length ? Math.min(...deadlines) : null,
        progressPct: prog.percent,
        href: '/objetivos',
      })
    }
  }
  candidates.sort((a, b) => {
    const aDated = a.daysUntil != null
    const bDated = b.daysUntil != null
    if (aDated !== bDated) return aDated ? -1 : 1
    if (aDated && bDated && a.daysUntil !== b.daysUntil) return a.daysUntil! - b.daysUntil!
    if (PRIORITY_RANK[a.goalPriority] !== PRIORITY_RANK[b.goalPriority]) {
      return PRIORITY_RANK[a.goalPriority] - PRIORITY_RANK[b.goalPriority]
    }
    return a.title.localeCompare(b.title, 'es')
  })
  return candidates.slice(0, max)
}

// ─── Fechas de la red con aviso anticipado ─────────────────────────────

/**
 * Cumpleaños + fechas especiales de TODA la red cuya próxima ocurrencia cae
 * dentro de `leadDays`. Cada una trae un empujón accionable calibrado por el
 * lead-time. Reusa computeSpecialDateCountdown (una sola fuente de verdad).
 * Las one-time ya pasadas se excluyen. Ordena por cercanía.
 */
export function contactDatesInRange(
  people: Person[],
  leadDays: number,
  now: Date = new Date(),
): CockpitDate[] {
  const out: CockpitDate[] = []
  for (const p of people) {
    if (p.birthDate) {
      const cd = computeSpecialDateCountdown(
        { id: `bday_${p.id}`, label: 'Cumpleaños', date: p.birthDate, recurring: true },
        now,
      )
      if (cd && cd.daysUntil <= leadDays) {
        const age = ageTurning(p.birthDate, cd.occurrence)
        const detail = [age != null ? `cumple ${age}` : null, futurePhrase(cd.daysUntil)]
          .filter(Boolean)
          .join(' · ')
        out.push({
          id: `birthday_${p.id}`,
          kind: 'birthday',
          title: `Cumpleaños de ${p.name}`,
          detail,
          daysUntil: cd.daysUntil,
          nudge: contactNudge('birthday', 'Cumpleaños', cd.daysUntil),
          personId: p.id,
          personSlug: p.slug,
          href: personHref(p),
        })
      }
    }
    for (const sd of p.specialDates ?? []) {
      const cd = computeSpecialDateCountdown(sd, now)
      if (!cd || cd.isPast || cd.daysUntil > leadDays) continue
      out.push({
        id: `special_${p.id}_${sd.id}`,
        kind: 'special_date',
        title: `${sd.label} · ${p.name}`,
        detail: futurePhrase(cd.daysUntil),
        daysUntil: cd.daysUntil,
        nudge: contactNudge('special_date', sd.label, cd.daysUntil),
        personId: p.id,
        personSlug: p.slug,
        href: personHref(p),
      })
    }
  }
  out.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title, 'es'))
  return out
}

// ─── Hitos del mes ─────────────────────────────────────────────────────

function goalTargetMilestones(goals: Goal[], maxDays: number, now: Date): CockpitMilestone[] {
  const out: CockpitMilestone[] = []
  for (const g of goals) {
    if (g.status !== 'active' || !g.targetDate) continue
    const target = parseLocalDate(g.targetDate)
    if (!target) continue
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const days = Math.round((target.getTime() - todayStart.getTime()) / DAY_MS)
    if (days > maxDays) continue
    out.push({
      id: `goal_${g.id}`,
      kind: 'goal_target',
      title: g.title,
      detail: `Objetivo · ${datePhrase(days)}`,
      daysUntil: days,
      overdue: days < 0,
      href: '/objetivos',
    })
  }
  return out
}

/**
 * Hitos y deadlines del horizonte de Mes: target dates de objetivos, deadlines
 * de tareas OKR, y fechas de la red (cumpleaños/especiales). Vista de carga
 * del mes. Ordena por cercanía (vencidos arriba), desempate por título.
 */
export function monthMilestones(
  input: CockpitInput,
  maxDays: number,
  now: Date = new Date(),
): CockpitMilestone[] {
  const out: CockpitMilestone[] = [...goalTargetMilestones(input.goals, maxDays, now)]

  for (const t of tasksDueInRange(input.goals, input.objectiveSteps, { maxDays }, now)) {
    out.push({
      id: t.id,
      kind: 'step_deadline',
      title: t.title,
      detail: `${t.objectiveTitle} · ${datePhrase(t.daysUntil)}`,
      daysUntil: t.daysUntil,
      overdue: t.overdue,
      href: '/objetivos',
    })
  }

  for (const d of contactDatesInRange(input.people, maxDays, now)) {
    out.push({
      id: d.id,
      kind: 'date',
      title: d.title,
      detail: `${d.detail} · ${d.nudge}`,
      daysUntil: d.daysUntil,
      overdue: false,
      personSlug: d.personSlug,
      href: d.href,
    })
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title, 'es'))
  return out
}

// ─── Semana: buckets por día (eventos + tareas) ────────────────────────

/** Eventos del calendario que ocurren en `dateKey` (Lima), ordenados por hora.
 *  all-day primero. */
function eventsOnDay(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  const matches = events.filter((ev) => {
    if (ev.allDay) return ev.start === dateKey
    const ms = Date.parse(ev.start)
    return !Number.isNaN(ms) && toLimaDateOnly(ms) === dateKey
  })
  return matches.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.start.localeCompare(b.start)
  })
}

/**
 * 7 días (hoy..+6) con sus eventos del calendario y tareas OKR que vencen.
 * Las tareas vencidas (días < 0) se anclan a HOY: siguen siendo trabajo del día.
 */
export function buildWeekDays(
  events: CalendarEvent[],
  tasks: CockpitTask[],
  now: Date = new Date(),
): CockpitDayBucket[] {
  const nowMs = now.getTime()
  const buckets: CockpitDayBucket[] = []
  for (let offset = 0; offset <= HORIZON_WINDOW_DAYS.semana; offset++) {
    const dateKey = toLimaDateOnly(nowMs + offset * DAY_MS)
    buckets.push({
      dateKey,
      offset,
      isToday: offset === 0,
      events: eventsOnDay(events, dateKey),
      tasks: [],
    })
  }
  for (const t of tasks) {
    const idx = t.daysUntil < 0 ? 0 : t.daysUntil
    if (idx >= 0 && idx < buckets.length) buckets[idx].tasks.push(t)
  }
  return buckets
}

// ─── Ensamblador ───────────────────────────────────────────────────────

/**
 * Arma el cockpit del horizonte pedido. Sólo computa lo que ese horizonte
 * necesita (los demás buckets quedan vacíos). El estado físico del Día se
 * construye aparte (lib/horario/physical) porque vive en otro store.
 */
export function buildCockpit(input: CockpitInput, horizon: Horizon, now: Date = new Date()): Cockpit {
  const base: Cockpit = {
    horizon,
    tasksToday: [],
    focus: [],
    weekDays: [],
    contactDates: [],
    milestones: [],
  }

  if (horizon === 'dia') {
    base.tasksToday = tasksDueInRange(input.goals, input.objectiveSteps, { maxDays: 0 }, now)
    return base
  }

  if (horizon === 'semana') {
    const tasks = tasksDueInRange(
      input.goals,
      input.objectiveSteps,
      { maxDays: HORIZON_WINDOW_DAYS.semana },
      now,
    )
    base.focus = focusKeyResults(input.goals, input.objectiveSteps, now, 3)
    base.weekDays = buildWeekDays(input.events, tasks, now)
    base.contactDates = contactDatesInRange(input.people, CONTACT_LEAD_DAYS.semana, now)
    return base
  }

  // mes
  base.milestones = monthMilestones(input, HORIZON_WINDOW_DAYS.mes, now)
  return base
}

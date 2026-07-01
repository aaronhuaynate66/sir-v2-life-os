// SIR V2 — AnduveHoy: agregador puro de "qué registré HOY across-user".
//
// Al abrir /panel a media tarde o al final del día, Aaron ve de un vistazo
// TODO lo que su SIR "sabe que hizo": hábitos marcados, self-metrics
// logueadas, movimientos financieros, KRs completados, personas anotadas,
// capturas subidas.
//
// Filosofía: reflejar, no evaluar. Sin score, sin juicio, sin "hoy hiciste
// menos que ayer". Solo el hecho fechado. La lectura emocional la hace Aaron.
//
// PURO — no toca red, no toca localStorage. Recibe todos los stores + un
// paquete opcional de eventos server-fetched (moments recientes, notes
// history) y devuelve un timeline plano con timestamps de HOY (TZ Lima).

import type {
  FinancialMovement,
  Goal,
  ObjectiveStep,
  Person,
  SelfMetric,
  SleepRecord,
  Memory,
} from '@/types'

export type AnduveEventKind =
  | 'habit'
  | 'metric'
  | 'sleep'
  | 'finance'
  | 'kr_done'
  | 'task_done'
  | 'goal_touched'
  | 'person_note'
  | 'capture'
  | 'memory_new'

export interface AnduveEvent {
  id: string
  at: string       // ISO local
  kind: AnduveEventKind
  label: string    // "Marcaste hábito · leer 20 min"
  meta?: string    // texto secundario ("+ S/45 · Rappi", "3/5")
  /** Deep-link opcional (persona, objetivo, etc.). */
  href?: string
}

/** Habits — objeto simplificado consumible desde el store `useHabits`
 *  (la lógica real vive en /api/habits/checkin; acá sólo agregamos). */
export interface HabitCheckinLite {
  id: string
  title: string
  /** ISO del checkin. */
  at: string
}

export interface AnduveInput {
  now: Date
  goals: Goal[]
  people: Person[]
  objectiveSteps: ObjectiveStep[]
  selfMetrics: SelfMetric[]
  sleepRecords: SleepRecord[]
  financialMovements: FinancialMovement[]
  memories: Memory[]
  /** Checkins de hábitos del día (opcional; si no llega, no se lista). */
  habitCheckins?: HabitCheckinLite[]
}

// ─── Helpers de fecha (Lima como default sin TZ conversion, coincide
// ─── con el patrón del proyecto: parseamos como local y comparamos
// ─── por YYYY-MM-DD del día del `now` inyectado).

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(iso: string | undefined, dayYmd: string): boolean {
  if (!iso) return false
  return iso.slice(0, 10) === dayYmd
}

const METRIC_LABEL: Record<string, string> = {
  energy: 'Energía',
  mood: 'Ánimo',
  stress: 'Estrés',
  focus: 'Enfoque',
  motivation: 'Motivación',
  confidence: 'Confianza',
}

function personName(people: Person[], id: string | undefined): string | undefined {
  if (!id) return undefined
  return people.find((p) => p.id === id)?.name
}

function goalTitle(goals: Goal[], id: string | undefined): string | undefined {
  if (!id) return undefined
  return goals.find((g) => g.id === id)?.title
}

/**
 * Devuelve el timeline de "hoy" ordenado más reciente primero.
 * Pure y determinístico. Los tests inyectan `now` y stubs.
 */
export function buildAnduveTimeline(input: AnduveInput): AnduveEvent[] {
  const day = ymdOf(input.now)
  const events: AnduveEvent[] = []

  // 1. Hábitos marcados hoy.
  for (const c of input.habitCheckins ?? []) {
    if (!isSameDay(c.at, day)) continue
    events.push({
      id: `habit:${c.id}`,
      at: c.at,
      kind: 'habit',
      label: `Hábito · ${c.title}`,
    })
  }

  // 2. Self-metrics (mood/energía/estrés/etc).
  for (const m of input.selfMetrics) {
    if (!isSameDay(m.timestamp, day)) continue
    const label = METRIC_LABEL[m.category] ?? m.category
    events.push({
      id: `sm:${m.id}`,
      at: m.timestamp,
      kind: 'metric',
      label,
      meta: `${m.value}/10`,
    })
  }

  // 3. Sueño (registro que corresponde a hoy).
  for (const s of input.sleepRecords) {
    if (!isSameDay(s.date, day)) continue
    const hrs = Math.round(s.duration * 10) / 10
    events.push({
      id: `sleep:${s.id}`,
      at: `${day}T${s.wakeTime}:00`,
      kind: 'sleep',
      label: `Sueño`,
      meta: `${hrs}h · calidad ${s.quality}/10`,
    })
  }

  // 4. Movimientos financieros.
  for (const f of input.financialMovements) {
    if (!isSameDay(f.date, day)) continue
    const sign = f.type === 'income' ? '+' : '-'
    events.push({
      id: `fin:${f.id}`,
      at: `${day}T12:00:00`, // finance es date-only; centro del día
      kind: 'finance',
      label: f.description || (f.type === 'income' ? 'Ingreso' : 'Gasto'),
      meta: `${sign}S/${Math.round(f.amountPEN)}${f.intent ? ` · ${f.intent}` : ''}`,
    })
  }

  // 5. KRs y tareas marcadas como 'hecho' HOY (via completedAt, mig 0070).
  for (const st of input.objectiveSteps) {
    if (st.status !== 'hecho') continue
    if (!isSameDay(st.completedAt, day)) continue
    const gTitle = goalTitle(input.goals, st.objectiveId)
    events.push({
      id: `step:${st.id}`,
      at: st.completedAt ?? `${day}T12:00:00`,
      kind: st.kind === 'key_result' ? 'kr_done' : 'task_done',
      label: `${st.kind === 'key_result' ? 'KR' : 'Tarea'} · ${st.title}`,
      meta: gTitle ? `de: ${gTitle}` : undefined,
      href: st.objectiveId ? `/objetivos?goal=${st.objectiveId}` : undefined,
    })
  }

  // 6. Goals cuyo updatedAt es HOY (mano visible sobre el goal).
  for (const g of input.goals) {
    if (!isSameDay(g.updatedAt, day)) continue
    // Evitar ruido: si ya emitimos un step del mismo goal hoy, no duplicar.
    const hasStepToday = events.some((e) => (e.kind === 'kr_done' || e.kind === 'task_done') && e.href === `/objetivos?goal=${g.id}`)
    if (hasStepToday) continue
    events.push({
      id: `goal:${g.id}`,
      at: g.updatedAt,
      kind: 'goal_touched',
      label: `Objetivo · ${g.title}`,
      href: `/objetivos?goal=${g.id}`,
    })
  }

  // 7. Memorias nuevas de hoy (createdAt/timestamp).
  for (const mem of input.memories) {
    const at = mem.timestamp
    if (!isSameDay(at, day)) continue
    const pName = personName(input.people, mem.personId)
    events.push({
      id: `mem:${mem.id}`,
      at,
      kind: 'memory_new',
      label: `Memoria${pName ? ` · ${pName}` : ''}`,
      meta: (mem.content || mem.title || '').slice(0, 100),
      href: pName ? undefined : undefined, // se puede hookear cuando tengamos slug
    })
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events
}

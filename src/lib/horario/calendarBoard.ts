// SIR V2 — Adapter: datos del cockpit → modelo plano del board de Horario.
//
// El calendario "Horario" (componente HorarioCalendar) consume un modelo plano
// y determinístico de eventos: cada uno con una fecha Lima ('YYYY-MM-DD') y,
// si tiene hora, minutos desde la medianoche Lima. Acá traducimos las tres
// fuentes reales de SIR a ese modelo, en TZ Lima (UTC-5 fijo):
//
//   - CalendarEvent[]  (feed .ics, 60 días)        → origin 'cal'
//   - CockpitDate[]    (cumpleaños/fechas de red)  → origin 'date' (all-day)
//   - CockpitTask[]    (tareas OKR que vencen)     → origin 'task'
//
// Función PURA (sin red, sin Date.now() interno salvo el `now` inyectado), para
// poder testearla. La conversión ISO→min Lima usa el offset fijo del proyecto.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'
import { toLimaDateOnly } from '@/lib/calendar/ics'
import type { CalendarEvent } from '@/lib/calendar/types'
import type { CockpitDate, CockpitDayBucket, CockpitTask } from '@/lib/horario/cockpit'
import type { ObjectiveStep } from '@/types'

export type BoardOrigin = 'cal' | 'date' | 'task' | 'health'

/** Un evento plano para el board. `s`/`e` = minutos desde la medianoche Lima
 *  (ignorados si allDay). */
export interface BoardEvent {
  id: string
  /** 'YYYY-MM-DD' en TZ Lima. */
  date: string
  /** Inicio en minutos desde medianoche (0..1440). */
  s: number
  /** Fin en minutos desde medianoche (0..1440). */
  e: number
  origin: BoardOrigin
  title: string
  loc?: string
  note?: string
  allDay: boolean
  /** Tarea OKR ya completada ('hecho') — se muestra tachada como "qué se hizo". */
  done?: boolean
  /** Id REAL del ObjectiveStep (solo origin 'task') — para asignarle hora. */
  stepId?: string
}

export const ORIGIN_LABEL: Record<BoardOrigin, string> = {
  cal: 'Calendario',
  date: 'Cumpleaños y fechas',
  task: 'Tareas',
  health: 'Salud',
}

const DAY_MS = 86_400_000
const MIN_BLOCK = 30 // duración por defecto de un timed sin fin / de una tarea con hora

/** Minutos desde la medianoche Lima de un instante UTC (ms). */
function limaMinutes(ms: number): number {
  const d = new Date(ms - LIMA_UTC_OFFSET_HOURS * 3600_000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** 'HH:mm' (reloj Lima) → minutos. Inválido → null. */
function parseHHmm(v: string | undefined): number | null {
  if (!v) return null
  const m = /^(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  const hh = Number(m[1]), mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return hh * 60 + mm
}

function calToBoard(ev: CalendarEvent): BoardEvent | null {
  if (ev.allDay) {
    // start ya es 'YYYY-MM-DD'
    const date = ev.start.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return { id: ev.id, date, s: 0, e: 0, origin: 'cal', title: ev.title, loc: ev.location, allDay: true }
  }
  const startMs = Date.parse(ev.start)
  if (Number.isNaN(startMs)) return null
  const date = toLimaDateOnly(startMs)
  const s = limaMinutes(startMs)
  let e = s + MIN_BLOCK
  if (ev.end) {
    const endMs = Date.parse(ev.end)
    if (!Number.isNaN(endMs)) {
      // Si el fin cae en otro día Lima, clampar al fin del día de inicio.
      e = toLimaDateOnly(endMs) === date ? limaMinutes(endMs) : 1440
    }
  }
  if (e <= s) e = Math.min(s + MIN_BLOCK, 1440)
  return { id: ev.id, date, s, e, origin: 'cal', title: ev.title, loc: ev.location, allDay: false }
}

function dateToBoard(d: CockpitDate, nowMs: number): BoardEvent {
  const date = toLimaDateOnly(nowMs + d.daysUntil * DAY_MS)
  return { id: d.id, date, s: 0, e: 0, origin: 'date', title: d.title, note: d.detail, allDay: true }
}

function taskToBoard(t: CockpitTask, dateKey: string): BoardEvent {
  const min = parseHHmm(t.dueTime)
  if (min == null) {
    return { id: t.id, date: dateKey, s: 0, e: 0, origin: 'task', title: t.title, note: t.objectiveTitle, allDay: true, stepId: t.stepId }
  }
  return { id: t.id, date: dateKey, s: min, e: Math.min(min + MIN_BLOCK, 1440), origin: 'task', title: t.title, note: t.objectiveTitle, allDay: false, stepId: t.stepId }
}

/** Tarea OKR completada → evento del board en su fecha objetivo (proxy de
 *  "cuándo se hizo": ObjectiveStep no guarda fecha de completado). Solo
 *  kind='task', status='hecho' y con targetDate. */
function completedStepToBoard(stepId: string, title: string, targetDate: string, dueTime: string | undefined): BoardEvent {
  const min = parseHHmm(dueTime)
  if (min == null) {
    return { id: `done_${stepId}`, date: targetDate, s: 0, e: 0, origin: 'task', title, allDay: true, done: true }
  }
  return { id: `done_${stepId}`, date: targetDate, s: min, e: Math.min(min + MIN_BLOCK, 1440), origin: 'task', title, allDay: false, done: true }
}

export interface BoardInput {
  events: CalendarEvent[]
  weekDays: CockpitDayBucket[]
  contactDates: CockpitDate[]
  /** Tareas OKR completadas (status 'hecho') con targetDate — "qué se hizo".
   *  Idealmente ya acotadas a la ventana visible por el llamador. */
  completedSteps?: ObjectiveStep[]
}

/** Arma los eventos del board desde las fuentes del cockpit. Determinístico:
 *  `now` se inyecta (para ubicar las fechas de red por `daysUntil`). */
export function buildBoardEvents(input: BoardInput, now: Date): BoardEvent[] {
  const nowMs = now.getTime()
  const out: BoardEvent[] = []

  for (const ev of input.events) {
    const b = calToBoard(ev)
    if (b) out.push(b)
  }
  for (const d of input.contactDates) {
    out.push(dateToBoard(d, nowMs))
  }
  for (const bucket of input.weekDays) {
    for (const t of bucket.tasks) {
      out.push(taskToBoard(t, bucket.dateKey))
    }
  }
  for (const st of input.completedSteps ?? []) {
    if (st.kind !== 'task' || st.status !== 'hecho') continue
    // Preferir la fecha REAL de completado (0070); si falta, caer al proxy de
    // la fecha objetivo.
    if (st.completedAt) {
      const ms = Date.parse(st.completedAt)
      if (!Number.isNaN(ms)) {
        out.push({ id: `done_${st.id}`, date: toLimaDateOnly(ms), s: 0, e: 0, origin: 'task', title: st.title, allDay: true, done: true })
        continue
      }
    }
    if (st.targetDate) out.push(completedStepToBoard(st.id, st.title, st.targetDate, st.dueTime))
  }
  return out
}

/** Orígenes presentes (para no mostrar chips de filtro muertos). */
export function presentOrigins(events: BoardEvent[]): BoardOrigin[] {
  const order: BoardOrigin[] = ['cal', 'date', 'task', 'health']
  const set = new Set(events.map((e) => e.origin))
  return order.filter((o) => set.has(o))
}

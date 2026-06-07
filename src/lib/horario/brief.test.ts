// SIR V2 — Tests del Brief del día (señales + resumen determinístico + prompt).
//
// buildBriefSignals es puro: arma las señales desde la DayTimeline + DayPlan ya
// construidos (reusamos los builders reales para no duplicar fixtures). TZ Lima
// = UTC-5 fijo. Cubrimos: conteo/primer-último evento, tareas con y sin hora,
// huecos, fechas, relaciones, el resumen-baseline sin IA, hasBriefContent y el
// parser tolerante del JSON del modelo.

import { describe, it, expect } from 'vitest'

import { buildDayTimeline } from '@/lib/calendar/timeline'
import type { CalendarEvent } from '@/lib/calendar/types'
import { extractJsonObject } from '@/lib/objectives/planPrompt'
import type { CockpitDate, CockpitTask } from './cockpit'
import { buildDayPlan } from './dayPlan'
import {
  buildBriefSignals,
  briefSummaryLine,
  hasBriefContent,
  buildBriefInput,
  parseBriefJson,
  type BriefRelation,
} from './brief'

const limaMs = (h: number, m = 0) => Date.UTC(2026, 5, 6, h + 5, m, 0, 0)
const NOW_08 = limaMs(8)

function ev(hStart: number, hEnd: number, title: string): CalendarEvent {
  const p = (h: number) => `2026-06-06T${String(h + 5).padStart(2, '0')}:00:00.000Z`
  return { id: title, uid: title, title, start: p(hStart), end: p(hEnd), allDay: false, recurring: false }
}

function allDay(title: string): CalendarEvent {
  return { id: title, uid: title, title, start: '2026-06-06', end: '2026-06-06', allDay: true, recurring: false }
}

function task(id: string, over: Partial<CockpitTask> = {}): CockpitTask {
  return {
    id: `task_${id}`,
    stepId: id,
    title: over.title ?? id,
    objectiveId: 'g1',
    objectiveTitle: over.objectiveTitle ?? 'Boticas',
    status: 'pendiente',
    daysUntil: 0,
    overdue: false,
    blocked: false,
    href: '/objetivos',
    ...over,
  }
}

function cdate(over: Partial<CockpitDate> & { title: string; daysUntil: number }): CockpitDate {
  return {
    id: over.id ?? over.title,
    kind: over.kind ?? 'birthday',
    detail: over.detail ?? '',
    nudge: over.nudge ?? 'Tenelo en el radar',
    href: over.href ?? '/relaciones/x',
    ...over,
  }
}

describe('buildBriefSignals — armado de señales', () => {
  it('cuenta eventos, primer/último, y all-day', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Standup'), ev(15, 16, 'Cierre'), allDay('Feriado')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const s = buildBriefSignals({ timeline, plan, contactDates: [] })
    expect(s.date).toBe('2026-06-06')
    expect(s.eventCount).toBe(2)
    expect(s.firstEvent).toEqual({ title: 'Standup', time: '09:00' })
    expect(s.lastEvent).toEqual({ title: 'Cierre', time: '15:00' })
    expect(s.allDayTitles).toEqual(['Feriado'])
  })

  it('cuenta tareas con hora + sin hora y marca vencidas', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'A')], NOW_08)
    const tasks = [
      task('t1', { title: 'Con hora', dueTime: '11:00' }),
      task('t2', { title: 'Sin hora' }),
      task('t3', { title: 'Vencida', daysUntil: -1, overdue: true }),
    ]
    const plan = buildDayPlan(timeline, tasks, NOW_08)
    const s = buildBriefSignals({ timeline, plan, contactDates: [] })
    expect(s.tasksDueCount).toBe(3)
    expect(s.overdueCount).toBe(1)
    expect(s.tasks.map((t) => t.title).sort()).toEqual(['Con hora', 'Sin hora', 'Vencida'])
  })

  it('toma los huecos del plan', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'A'), ev(13, 14, 'B')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const s = buildBriefSignals({ timeline, plan, contactDates: [] })
    expect(s.gaps).toHaveLength(1)
    expect(s.gaps[0]).toMatchObject({ from: '10:00', to: '13:00', duration: '3h', minutes: 180 })
  })

  it('incluye fechas (cap 3) y relaciones (cap 3)', () => {
    const timeline = buildDayTimeline([], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const contactDates = [
      cdate({ title: 'Cumpleaños de Diana', daysUntil: 11, nudge: 'Con tiempo: planeá un regalo' }),
      cdate({ title: 'B', daysUntil: 2 }),
      cdate({ title: 'C', daysUntil: 3 }),
      cdate({ title: 'D (se cae)', daysUntil: 4 }),
    ]
    const relations: BriefRelation[] = [
      { name: 'Marco', headline: 'Sin hablar hace 34 días', urgency: 'high' },
      { name: 'Lucía', headline: 'Enfriándose', urgency: 'medium' },
      { name: 'Pep', headline: 'x', urgency: 'low' },
      { name: 'Extra', headline: 'se cae', urgency: 'low' },
    ]
    const s = buildBriefSignals({ timeline, plan, contactDates, relations })
    expect(s.upcomingDates.map((d) => d.title)).toEqual(['Cumpleaños de Diana', 'B', 'C'])
    expect(s.relations.map((r) => r.name)).toEqual(['Marco', 'Lucía', 'Pep'])
  })

  it('día vacío → sin firstEvent ni overload', () => {
    const timeline = buildDayTimeline([], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const s = buildBriefSignals({ timeline, plan, contactDates: [] })
    expect(s.firstEvent).toBeUndefined()
    expect(s.overload).toBeUndefined()
    expect(hasBriefContent(s)).toBe(false)
  })
})

describe('briefSummaryLine — baseline sin IA', () => {
  it('arma una línea escaneable de hechos', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'A'), ev(13, 14, 'B'), ev(16, 17, 'C')], NOW_08)
    const plan = buildDayPlan(timeline, [task('t1', { title: 'X' }), task('t2', { title: 'Y' })], NOW_08)
    const s = buildBriefSignals({
      timeline,
      plan,
      contactDates: [cdate({ title: 'Cumple Diana', daysUntil: 11 })],
    })
    const line = briefSummaryLine(s)
    expect(line).toContain('3 eventos')
    expect(line).toContain('2 tareas vencen hoy')
    expect(line).toContain('libre')
    expect(line).toContain('en 11d')
  })

  it('singular y vencidas', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'A')], NOW_08)
    const plan = buildDayPlan(timeline, [task('t1', { daysUntil: -1, overdue: true })], NOW_08)
    const s = buildBriefSignals({ timeline, plan, contactDates: [] })
    const line = briefSummaryLine(s)
    expect(line).toContain('1 evento ')
    expect(line).toContain('1 tarea vence hoy (1 vencida)')
  })

  it('día despejado', () => {
    const timeline = buildDayTimeline([], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    expect(briefSummaryLine(buildBriefSignals({ timeline, plan, contactDates: [] }))).toContain('despejado')
  })
})

describe('buildBriefInput — render del prompt', () => {
  it('lista las señales presentes y omite las vacías', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Standup'), ev(13, 14, 'Cierre')], NOW_08)
    const plan = buildDayPlan(timeline, [task('t1', { title: 'Cerrar Boticas', priority: 'high' })], NOW_08)
    const s = buildBriefSignals({
      timeline,
      plan,
      contactDates: [cdate({ title: 'Cumple Diana', daysUntil: 11, nudge: 'planeá un regalo' })],
      relations: [{ name: 'Marco', headline: 'Sin hablar hace 34 días', urgency: 'high' }],
    })
    const input = buildBriefInput(s)
    expect(input).toContain('2026-06-06')
    expect(input).toContain('Cerrar Boticas')
    expect(input).toContain('prioridad alta')
    expect(input).toContain('Cumple Diana')
    expect(input).toContain('Marco')
    expect(input).not.toContain('Todo el día') // no había all-day
  })
})

describe('parseBriefJson — parser tolerante', () => {
  it('parsea brief + focus', () => {
    const r = parseBriefJson('```json\n{"brief":"Hoy 3 reuniones.","focus":"Cerrar Boticas"}\n```', extractJsonObject)
    expect(r).toEqual({ brief: 'Hoy 3 reuniones.', focus: 'Cerrar Boticas' })
  })

  it('brief sin focus → focus vacío', () => {
    const r = parseBriefJson('{"brief":"Día tranquilo."}', extractJsonObject)
    expect(r).toEqual({ brief: 'Día tranquilo.', focus: '' })
  })

  it('sin brief → null', () => {
    expect(parseBriefJson('{"focus":"algo"}', extractJsonObject)).toBeNull()
    expect(parseBriefJson('basura', extractJsonObject)).toBeNull()
  })
})

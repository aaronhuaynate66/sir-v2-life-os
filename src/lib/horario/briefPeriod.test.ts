// SIR V2 — Tests del Brief de la SEMANA y del MES (señales + resumen + prompt).
//
// buildWeekBriefSignals / buildMonthBriefSignals son puros: agregan la data YA
// computada por el cockpit (weekDays/focus/contactDates para semana; milestones
// + ancla para mes). TZ Lima = UTC-5 fijo. Cubrimos: agregados (eventos/tareas/
// días libres), focos, fechas, conteos por tipo de hito, ancla, los resúmenes
// baseline sin IA, hasWeekContent/hasMonthContent y los buckets de ventana.

import { describe, it, expect } from 'vitest'

import type { CalendarEvent } from '@/lib/calendar/types'
import type { CockpitDate, CockpitDayBucket, CockpitMilestone, CockpitTask, FocusKR } from './cockpit'
import {
  buildWeekBriefSignals,
  weekSummaryLine,
  hasWeekContent,
  buildWeekBriefInput,
  buildMonthBriefSignals,
  monthSummaryLine,
  hasMonthContent,
  buildMonthBriefInput,
  periodStartKey,
  periodEndKey,
  type MonthBriefAnchor,
} from './briefPeriod'

// ─── Helpers de fixtures ───────────────────────────────────────────────

function calEv(id: string): CalendarEvent {
  return { id, uid: id, title: id, start: '2026-06-06T14:00:00.000Z', end: '2026-06-06T15:00:00.000Z', allDay: false, recurring: false }
}

function task(id: string, over: Partial<CockpitTask> = {}): CockpitTask {
  return {
    id: `task_${id}`,
    stepId: id,
    title: over.title ?? id,
    objectiveId: 'g1',
    objectiveTitle: over.objectiveTitle ?? 'Boticas',
    status: 'pendiente',
    daysUntil: over.daysUntil ?? 0,
    overdue: over.overdue ?? false,
    blocked: false,
    href: '/objetivos',
    ...over,
  }
}

function dayBucket(offset: number, events: CalendarEvent[], tasks: CockpitTask[]): CockpitDayBucket {
  return { dateKey: `2026-06-${String(6 + offset).padStart(2, '0')}`, offset, isToday: offset === 0, events, tasks }
}

function focusKR(over: Partial<FocusKR> & { title: string }): FocusKR {
  return {
    id: `kr_${over.title}`,
    title: over.title,
    objectiveId: 'g1',
    objectiveTitle: over.objectiveTitle ?? 'Boticas',
    goalPriority: over.goalPriority ?? 'high',
    daysUntil: over.daysUntil ?? null,
    progressPct: over.progressPct ?? 0,
    href: '/objetivos',
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

function milestone(over: Partial<CockpitMilestone> & { title: string; kind: CockpitMilestone['kind'] }): CockpitMilestone {
  return {
    id: over.id ?? over.title,
    detail: over.detail ?? '',
    daysUntil: over.daysUntil ?? 5,
    overdue: over.overdue ?? false,
    href: over.href ?? '/objetivos',
    ...over,
  }
}

// ─── Buckets ────────────────────────────────────────────────────────────

describe('periodStartKey / periodEndKey — ventana Lima', () => {
  it('arranca hoy (Lima) y termina hoy + windowDays', () => {
    const nowMs = Date.UTC(2026, 5, 6, 13, 0, 0) // 08:00 Lima
    expect(periodStartKey(nowMs)).toBe('2026-06-06')
    expect(periodEndKey(nowMs, 6)).toBe('2026-06-12')
    expect(periodEndKey(nowMs, 31)).toBe('2026-07-07')
  })
})

// ─── Semana ───────────────────────────────────────────────────────────

describe('buildWeekBriefSignals — agregados de la semana', () => {
  const weekDays: CockpitDayBucket[] = [
    dayBucket(0, [calEv('a'), calEv('b')], [task('t1', { daysUntil: -1, overdue: true })]),
    dayBucket(1, [], []),
    dayBucket(2, [calEv('c')], [task('t2', { daysUntil: 2 })]),
    dayBucket(3, [], []),
    dayBucket(4, [], []),
    dayBucket(5, [], []),
    dayBucket(6, [], []),
  ]

  it('suma eventos, tareas, vencidas y cuenta días libres', () => {
    const s = buildWeekBriefSignals({
      weekStart: '2026-06-06',
      weekEnd: '2026-06-12',
      weekDays,
      focus: [],
      contactDates: [],
    })
    expect(s.eventCount).toBe(3)
    expect(s.tasksDueCount).toBe(2)
    expect(s.overdueCount).toBe(1)
    expect(s.freeDays).toBe(5) // offsets 1,3,4,5,6
    expect(s.days[0]).toEqual({ offset: 0, eventCount: 2, taskCount: 1 })
  })

  it('toma foco (cap 3) y fechas (cap 4)', () => {
    const s = buildWeekBriefSignals({
      weekStart: '2026-06-06',
      weekEnd: '2026-06-12',
      weekDays,
      focus: [
        focusKR({ title: 'KR1', daysUntil: 3, progressPct: 40 }),
        focusKR({ title: 'KR2' }),
        focusKR({ title: 'KR3' }),
        focusKR({ title: 'KR4 (se cae)' }),
      ],
      contactDates: [
        cdate({ title: 'Cumple Diana', daysUntil: 3 }),
        cdate({ title: 'B', daysUntil: 5 }),
        cdate({ title: 'C', daysUntil: 7 }),
        cdate({ title: 'D', daysUntil: 9 }),
        cdate({ title: 'E (se cae)', daysUntil: 10 }),
      ],
    })
    expect(s.focus.map((f) => f.title)).toEqual(['KR1', 'KR2', 'KR3'])
    expect(s.focus[0]).toMatchObject({ title: 'KR1', objective: 'Boticas', daysUntil: 3, progressPct: 40 })
    expect(s.upcomingDates.map((d) => d.title)).toEqual(['Cumple Diana', 'B', 'C', 'D'])
  })

  it('semana vacía → sin contenido', () => {
    const empty = Array.from({ length: 7 }, (_, i) => dayBucket(i, [], []))
    const s = buildWeekBriefSignals({ weekStart: '2026-06-06', weekEnd: '2026-06-12', weekDays: empty, focus: [], contactDates: [] })
    expect(hasWeekContent(s)).toBe(false)
    expect(weekSummaryLine(s)).toContain('despejada')
  })
})

describe('weekSummaryLine — baseline sin IA', () => {
  it('arma una línea escaneable de hechos', () => {
    const s = buildWeekBriefSignals({
      weekStart: '2026-06-06',
      weekEnd: '2026-06-12',
      weekDays: [
        dayBucket(0, [calEv('a'), calEv('b')], [task('t1', { daysUntil: -1, overdue: true }), task('t2')]),
        dayBucket(1, [], []),
        dayBucket(2, [], []),
        dayBucket(3, [], []),
        dayBucket(4, [], []),
        dayBucket(5, [], []),
        dayBucket(6, [], []),
      ],
      focus: [focusKR({ title: 'KR1', daysUntil: 3 })],
      contactDates: [cdate({ title: 'Cumple Diana', daysUntil: 3 })],
    })
    const line = weekSummaryLine(s)
    expect(line).toContain('2 eventos')
    expect(line).toContain('2 tareas esta semana (1 vencida)')
    expect(line).toContain('6 días libres')
    expect(line).toContain('1 en foco')
    expect(line).toContain('próxima fecha en 3d')
  })
})

describe('buildWeekBriefInput — render del prompt', () => {
  it('lista carga por día, foco y fechas; omite vacías', () => {
    const s = buildWeekBriefSignals({
      weekStart: '2026-06-06',
      weekEnd: '2026-06-12',
      weekDays: [
        dayBucket(0, [calEv('a')], []),
        dayBucket(1, [], [task('t1', { title: 'Cerrar deal' })]),
        dayBucket(2, [], []),
        dayBucket(3, [], []),
        dayBucket(4, [], []),
        dayBucket(5, [], []),
        dayBucket(6, [], []),
      ],
      focus: [focusKR({ title: 'Subir ventas', objectiveTitle: 'Boticas', daysUntil: 3, progressPct: 40 })],
      contactDates: [cdate({ title: 'Cumple Diana', daysUntil: 3, nudge: 'planeá un regalo' })],
    })
    const input = buildWeekBriefInput(s)
    expect(input).toContain('2026-06-06 a 2026-06-12')
    expect(input).toContain('Hoy: 1 ev')
    expect(input).toContain('Mañana: 1 tareas')
    expect(input).toContain('Subir ventas')
    expect(input).toContain('40%')
    expect(input).toContain('Cumple Diana')
  })
})

// ─── Mes ──────────────────────────────────────────────────────────────

describe('buildMonthBriefSignals — agregados del mes', () => {
  const milestones: CockpitMilestone[] = [
    milestone({ title: 'Lanzar tienda', kind: 'goal_target', daysUntil: 12 }),
    milestone({ title: 'Cerrar Boticas', kind: 'step_deadline', daysUntil: 3 }),
    milestone({ title: 'Entregar informe', kind: 'step_deadline', daysUntil: 18 }),
    milestone({ title: 'Cumpleaños de Diana', kind: 'date', daysUntil: 11 }),
  ]

  it('cuenta por tipo y recorta los hitos (cap 6)', () => {
    const s = buildMonthBriefSignals({ monthStart: '2026-06-06', monthEnd: '2026-07-07', milestones, anchor: null })
    expect(s.milestoneCount).toBe(4)
    expect(s.goalTargetCount).toBe(1)
    expect(s.deadlineCount).toBe(2)
    expect(s.dateCount).toBe(1)
    expect(s.milestones).toHaveLength(4)
    expect(s.anchor).toBeNull()
  })

  it('mes vacío sin ancla → sin contenido', () => {
    const s = buildMonthBriefSignals({ monthStart: '2026-06-06', monthEnd: '2026-07-07', milestones: [], anchor: null })
    expect(hasMonthContent(s)).toBe(false)
    expect(monthSummaryLine(s)).toContain('despejado')
  })

  it('mes vacío pero con ancla → sí hay contenido', () => {
    const anchor: MonthBriefAnchor = { title: 'Mundial WFG26', subtitle: 'noviembre', monthLabel: 'NOV', daysUntil: 160 }
    const s = buildMonthBriefSignals({ monthStart: '2026-06-06', monthEnd: '2026-07-07', milestones: [], anchor })
    expect(hasMonthContent(s)).toBe(true)
    expect(monthSummaryLine(s)).toContain('ancla: Mundial WFG26')
  })
})

describe('monthSummaryLine — baseline sin IA', () => {
  it('arma una línea de alto nivel', () => {
    const anchor: MonthBriefAnchor = { title: 'WFG26', subtitle: null, monthLabel: 'NOV', daysUntil: 160 }
    const s = buildMonthBriefSignals({
      monthStart: '2026-06-06',
      monthEnd: '2026-07-07',
      milestones: [
        milestone({ title: 'A', kind: 'goal_target' }),
        milestone({ title: 'B', kind: 'step_deadline' }),
        milestone({ title: 'C', kind: 'date' }),
      ],
      anchor,
    })
    const line = monthSummaryLine(s)
    expect(line).toContain('1 objetivo')
    expect(line).toContain('1 deadline')
    expect(line).toContain('1 fecha')
    expect(line).toContain('ancla: WFG26')
  })
})

describe('buildMonthBriefInput — render del prompt', () => {
  it('lista los hitos cercanos y el ancla', () => {
    const anchor: MonthBriefAnchor = { title: 'Mundial WFG26', subtitle: 'Las Vegas', monthLabel: 'NOV', daysUntil: 160 }
    const s = buildMonthBriefSignals({
      monthStart: '2026-06-06',
      monthEnd: '2026-07-07',
      milestones: [
        milestone({ title: 'Cerrar Boticas', kind: 'step_deadline', detail: 'Boticas · en 3 días', daysUntil: 3 }),
        milestone({ title: 'Vencido viejo', kind: 'step_deadline', detail: 'X · vencida', daysUntil: -2, overdue: true }),
      ],
      anchor,
    })
    const input = buildMonthBriefInput(s)
    expect(input).toContain('2026-06-06 a 2026-07-07')
    expect(input).toContain('Cerrar Boticas — Boticas · en 3 días (en 3 días)')
    expect(input).toContain('vencido hace 2d')
    expect(input).toContain('Mundial WFG26')
    expect(input).toContain('Las Vegas')
    expect(input).toContain('en 160 días')
  })
})

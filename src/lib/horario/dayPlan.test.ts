// SIR V2 — Tests del plan del día de /horario (fusión calendario + tareas + huecos).
//
// buildDayPlan es puro: `nowMs` se inyecta. TZ Lima = UTC-5 fijo, así que los
// eventos del calendario se construyen en UTC y un reloj de pared Lima HH:00 =
// (HH+5):00 UTC. Cubrimos: fusión de tareas con hora en su franja, partición de
// tareas sin hora / vencidas hacia "Vencen hoy", y el cálculo de huecos libres
// (interiores, ≥30min, dentro de la ventana activa, sin madrugada, sin pasados).

import { describe, it, expect } from 'vitest'

import { buildDayTimeline } from '@/lib/calendar/timeline'
import type { CalendarEvent } from '@/lib/calendar/types'
import type { CockpitTask } from './cockpit'
import { buildDayPlan } from './dayPlan'

const H = 3_600_000

// Lima = UTC-5. 2026-06-01 HH:00 Lima = (HH+5):00 UTC.
function ev(hStartLima: number, hEndLima: number, title: string): CalendarEvent {
  const p = (h: number) => `2026-06-01T${String(h + 5).padStart(2, '0')}:00:00.000Z`
  return { id: title, uid: title, title, start: p(hStartLima), end: p(hEndLima), allDay: false, recurring: false }
}

function task(over: Partial<CockpitTask> & { id: string }): CockpitTask {
  return {
    title: over.title ?? 'Tarea',
    objectiveId: 'g1',
    objectiveTitle: 'Objetivo',
    status: 'pendiente',
    daysUntil: 0,
    overdue: false,
    blocked: false,
    href: '/objetivos',
    ...over,
  }
}

// ms del reloj de pared Lima del 2026-06-01.
const limaMs = (h: number, m = 0) => Date.UTC(2026, 5, 1, h + 5, m, 0, 0)

// "ahora" temprano (08:00 Lima) → nada pasado salvo lo que probemos explícito.
const NOW_08 = limaMs(8)

describe('buildDayPlan — fusión de tareas con hora', () => {
  it('una tarea con hora cae en su franja, ordenada entre los eventos', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Reunión'), ev(13, 14, 'Almuerzo')], NOW_08)
    const plan = buildDayPlan(timeline, [task({ id: 'task_t1', title: 'Llamar proveedor', dueTime: '11:00' })], NOW_08)

    // Orden esperado: evento 09, hueco 10–11, tarea 11, hueco 11:30–13, evento 13.
    expect(plan.rows.map((r) => r.type)).toEqual(['event', 'gap', 'task', 'gap', 'event'])
    const taskRow = plan.rows.find((r) => r.type === 'task')
    expect(taskRow?.type === 'task' && taskRow.startMs).toBe(limaMs(11))
    expect(plan.untimedTasks).toHaveLength(0)
  })

  it('tarea de hoy SIN hora → "Vencen hoy", no entra a la línea', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Reunión')], NOW_08)
    const plan = buildDayPlan(timeline, [task({ id: 'task_t1', title: 'Pendiente' })], NOW_08)

    expect(plan.rows.some((r) => r.type === 'task')).toBe(false)
    expect(plan.untimedTasks.map((t) => t.title)).toEqual(['Pendiente'])
  })

  it('tarea VENCIDA con hora → "Vencen hoy" (no se inventa franja para hoy)', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Reunión')], NOW_08)
    const plan = buildDayPlan(
      timeline,
      [task({ id: 'task_t1', title: 'Atrasada', daysUntil: -2, overdue: true, dueTime: '11:00' })],
      NOW_08,
    )

    expect(plan.rows.some((r) => r.type === 'task')).toBe(false)
    expect(plan.untimedTasks.map((t) => t.title)).toEqual(['Atrasada'])
  })

  it('sin eventos ni tareas con hora → rows vacío; las sin hora quedan listadas', () => {
    const timeline = buildDayTimeline([], NOW_08)
    const plan = buildDayPlan(timeline, [task({ id: 'task_t1', title: 'Algo' })], NOW_08)
    expect(plan.rows).toHaveLength(0)
    expect(plan.untimedTasks).toHaveLength(1)
  })
})

describe('buildDayPlan — huecos libres', () => {
  it('hueco interior relevante entre dos eventos', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'A'), ev(13, 14, 'B')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const gaps = plan.rows.filter((r) => r.type === 'gap')
    expect(gaps).toHaveLength(1)
    const g = gaps[0]
    expect(g.type === 'gap' && g.startMs).toBe(limaMs(10))
    expect(g.type === 'gap' && g.endMs).toBe(limaMs(13))
    expect(g.type === 'gap' && g.minutes).toBe(180)
  })

  it('hueco < 30 min se ignora', () => {
    // Eventos 09:00–10:00 y 10:20–11:00 → hueco de sólo 20 min (15:20 UTC = 10:20 Lima).
    const timeline = buildDayTimeline(
      [
        ev(9, 10, 'A'),
        { id: 'B', uid: 'B', title: 'B', start: '2026-06-01T15:20:00.000Z', end: '2026-06-01T16:00:00.000Z', allDay: false, recurring: false },
      ],
      NOW_08,
    )
    const plan = buildDayPlan(timeline, [], NOW_08)
    expect(plan.rows.some((r) => r.type === 'gap')).toBe(false)
  })

  it('no marca la madrugada: hueco recortado a la ventana activa (07:00)', () => {
    // Evento 05–06 (madrugada) y 09–10 → el hueco interior 06–09 se recorta a 07–09.
    const timeline = buildDayTimeline([ev(5, 6, 'Madrugón'), ev(9, 10, 'Mañana')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const gap = plan.rows.find((r) => r.type === 'gap')
    expect(gap?.type === 'gap' && gap.startMs).toBe(limaMs(7))
    expect(gap?.type === 'gap' && gap.endMs).toBe(limaMs(9))
  })

  it('eventos solapados se unen: sin hueco espurio en el solape', () => {
    const timeline = buildDayTimeline([ev(9, 11, 'A'), ev(10, 12, 'B'), ev(14, 15, 'C')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    const gaps = plan.rows.filter((r) => r.type === 'gap')
    expect(gaps).toHaveLength(1) // sólo 12–14
    expect(gaps[0].type === 'gap' && gaps[0].startMs).toBe(limaMs(12))
    expect(gaps[0].type === 'gap' && gaps[0].endMs).toBe(limaMs(14))
  })

  it('un hueco ya pasado se descarta', () => {
    // now = 13:00 Lima; eventos 08–09 y 11–12 → hueco 09–11 ya pasó por completo.
    const now13 = limaMs(13)
    const timeline = buildDayTimeline([ev(8, 9, 'A'), ev(11, 12, 'B')], now13)
    const plan = buildDayPlan(timeline, [], now13)
    expect(plan.rows.some((r) => r.type === 'gap')).toBe(false)
  })

  it('un solo bloque → sin huecos (no inventa hueco líder ni de cierre)', () => {
    const timeline = buildDayTimeline([ev(9, 10, 'Único')], NOW_08)
    const plan = buildDayPlan(timeline, [], NOW_08)
    expect(plan.rows.map((r) => r.type)).toEqual(['event'])
  })

  it('una tarea con hora cuenta como bloque ocupado: parte el hueco en dos', () => {
    // Eventos 09–10 y 17–18 → sin tareas sería un único hueco 10–17. Una tarea
    // con hora a las 13:00 (dura DEFAULT_TASK_MINUTES=30 → 13:00–13:30) lo parte.
    const timeline = buildDayTimeline([ev(9, 10, 'A'), ev(17, 18, 'B')], NOW_08)
    const plan = buildDayPlan(
      timeline,
      [task({ id: 'task_t1', title: 'Llamada', dueTime: '13:00' })],
      NOW_08,
    )
    const gaps = plan.rows.filter((r) => r.type === 'gap')
    expect(gaps).toHaveLength(2)
    expect(gaps[0].type === 'gap' && gaps[0].startMs).toBe(limaMs(10))
    expect(gaps[0].type === 'gap' && gaps[0].endMs).toBe(limaMs(13))
    expect(gaps[1].type === 'gap' && gaps[1].startMs).toBe(limaMs(13, 30))
    expect(gaps[1].type === 'gap' && gaps[1].endMs).toBe(limaMs(17))
  })
})

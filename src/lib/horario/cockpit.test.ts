// SIR V2 — Tests del cockpit de /horario (Fase 1).
//
// buildCockpit y sus helpers reciben `now` explícito → determinístico y
// TZ-independiente (las fechas date-only se parsean con parseLocalDate; los
// eventos del calendario se agrupan con toLimaDateOnly / UTC-5 fijo).
//
// Cubrimos la FUSIÓN OKR (vencen hoy / esta semana / vencidas), el foco de la
// semana (ranking KR), las fechas de la red con lead-time + nudge, los hitos
// del mes y el bucketing de la semana (eventos del calendario + tareas por día).

import { describe, it, expect } from 'vitest'

import type { CalendarEvent } from '@/lib/calendar/types'
import type { Goal, ObjectiveStep, Person, SpecialDate } from '@/types'
import {
  buildCockpit,
  tasksDueInRange,
  focusKeyResults,
  contactDatesInRange,
  monthMilestones,
  buildWeekDays,
} from './cockpit'

// 1-jun-2026, medianoche local. La TZ del runner es la local del proyecto
// (Lima en prod). Los eventos del calendario usan ISO con Z explícito.
const NOW = new Date(2026, 5, 1)

function goal(over: Partial<Goal>): Goal {
  return {
    id: over.id ?? 'g1',
    title: over.title ?? 'Objetivo',
    description: '',
    category: 'personal',
    priority: over.priority ?? 'medium',
    status: over.status ?? 'active',
    targetDate: over.targetDate,
    progress: 0,
    milestones: [],
    relatedGoals: [],
    relatedPersons: [],
    peaceImpact: 0,
    obstacles: [],
    nextAction: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function ostep(over: Partial<ObjectiveStep>): ObjectiveStep {
  return {
    id: over.id ?? 'os1',
    objectiveId: over.objectiveId ?? 'g1',
    kind: over.kind ?? 'task',
    parentId: over.parentId,
    title: over.title ?? 'Paso',
    description: over.description,
    targetDate: over.targetDate,
    status: over.status ?? 'pendiente',
    order: over.order ?? 0,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00Z',
    ...over,
  }
}

function person(over: Partial<Person>): Person {
  return {
    id: over.id ?? 'p1',
    name: over.name ?? 'Persona',
    slug: over.slug,
    relationship: 'friend',
    category: 'close',
    importanceScore: over.importanceScore ?? 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    lastContact: over.lastContact,
    contactFrequency: 'weekly',
    tags: [],
    notes: '',
    birthDate: over.birthDate,
    specialDates: over.specialDates,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function event(over: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: over.id ?? 'e1',
    uid: over.uid ?? over.id ?? 'e1',
    title: over.title ?? 'Evento',
    start: over.start ?? '2026-06-01T15:00:00.000Z',
    end: over.end,
    allDay: over.allDay ?? false,
    location: over.location,
    recurring: over.recurring ?? false,
    calendarId: over.calendarId,
    calendarLabel: over.calendarLabel,
    calendarColor: over.calendarColor,
  }
}

const EMPTY = { goals: [], objectiveSteps: [], people: [], events: [] }

// ─── tasksDueInRange ───────────────────────────────────────────────────

describe('tasksDueInRange — fusión OKR', () => {
  it('tarea de objetivo activo que vence hoy → incluida (maxDays 0)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1', title: 'Mundial' })],
      [ostep({ id: 't1', kind: 'task', parentId: 'kr1', title: 'Pagar inscripción', targetDate: '2026-06-01' })],
      { maxDays: 0 },
      NOW,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Pagar inscripción')
    expect(tasks[0].objectiveTitle).toBe('Mundial')
    expect(tasks[0].daysUntil).toBe(0)
    expect(tasks[0].overdue).toBe(false)
  })

  it('tarea vencida → incluida por default (sigue siendo trabajo de hoy)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [ostep({ id: 't1', targetDate: '2026-05-28' })],
      { maxDays: 0 },
      NOW,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].daysUntil).toBe(-4)
    expect(tasks[0].overdue).toBe(true)
  })

  it('includeOverdue=false excluye vencidas', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [ostep({ id: 't1', targetDate: '2026-05-28' })],
      { maxDays: 0, includeOverdue: false },
      NOW,
    )
    expect(tasks).toHaveLength(0)
  })

  it('atraviesa TODOS los objetivos activos (no uno por objetivo)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1', title: 'A' }), goal({ id: 'g2', title: 'B' })],
      [
        ostep({ id: 't1', objectiveId: 'g1', targetDate: '2026-06-01' }),
        ostep({ id: 't2', objectiveId: 'g1', targetDate: '2026-06-01' }),
        ostep({ id: 't3', objectiveId: 'g2', targetDate: '2026-06-01' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks).toHaveLength(3)
  })

  it('objetivo no-activo → sus tareas no aparecen', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1', status: 'paused' })],
      [ostep({ id: 't1', targetDate: '2026-06-01' })],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks).toHaveLength(0)
  })

  it('tarea hecha → excluida; tarea sin fecha → excluida', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 't1', status: 'hecho', targetDate: '2026-06-01' }),
        ostep({ id: 't2', status: 'pendiente' }), // sin fecha
      ],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks).toHaveLength(0)
  })

  it('fecha fuera del horizonte (maxDays) → excluida', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [ostep({ id: 't1', targetDate: '2026-06-20' })], // +19 días
      { maxDays: 6 },
      NOW,
    )
    expect(tasks).toHaveLength(0)
  })

  it('un KR sin tareas hijas ES su propia hoja accionable', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [ostep({ id: 'kr1', kind: 'key_result', title: 'KR suelto', targetDate: '2026-06-01' })],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('KR suelto')
  })

  it('un KR CON tareas no entra como hoja (su deadline vive en las tareas)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 'kr1', kind: 'key_result', title: 'KR padre', targetDate: '2026-06-01' }),
        ostep({ id: 't1', kind: 'task', parentId: 'kr1', title: 'Tarea hija', targetDate: '2026-06-02' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks.map((t) => t.title)).toEqual(['Tarea hija'])
  })

  it('ordena por cercanía ascendente (vencidas arriba)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 't1', title: 'C', targetDate: '2026-06-05' }),
        ostep({ id: 't2', title: 'A', targetDate: '2026-05-30' }),
        ostep({ id: 't3', title: 'B', targetDate: '2026-06-01' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks.map((t) => t.title)).toEqual(['A', 'B', 'C'])
  })

  // ─── Jira-light (0050): blocked / priority / effort ──────────────────
  it('marca blocked por taskStatus explícito y por dependencia incompleta', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 'dep', title: 'Dep', status: 'pendiente', targetDate: '2026-06-01' }),
        ostep({ id: 't1', title: 'Explícita', taskStatus: 'blocked', targetDate: '2026-06-01' }),
        ostep({ id: 't2', title: 'Por dep', blockedBy: ['dep'], targetDate: '2026-06-01' }),
        ostep({ id: 't3', title: 'Libre', targetDate: '2026-06-01' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t.blocked]))
    expect(byTitle['Explícita']).toBe(true)
    expect(byTitle['Por dep']).toBe(true)
    expect(byTitle['Libre']).toBe(false)
  })

  it('expone priority y effort de la tarea', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [ostep({ id: 't1', priority: 'high', effort: 'L', targetDate: '2026-06-01' })],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks[0].priority).toBe('high')
    expect(tasks[0].effort).toBe('L')
  })

  it('desempata por prioridad cuando vencen el mismo día (alta primero)', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 't1', title: 'baja', priority: 'low', targetDate: '2026-06-03' }),
        ostep({ id: 't2', title: 'alta', priority: 'high', targetDate: '2026-06-03' }),
        ostep({ id: 't3', title: 'media', priority: 'med', targetDate: '2026-06-03' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    expect(tasks.map((t) => t.title)).toEqual(['alta', 'media', 'baja'])
  })
})

// ─── focusKeyResults ───────────────────────────────────────────────────

describe('focusKeyResults — foco de la semana', () => {
  it('prioriza KRs con deadline más cercano sobre los sin fecha', () => {
    const focus = focusKeyResults(
      [goal({ id: 'g1', priority: 'low' })],
      [
        ostep({ id: 'krA', kind: 'key_result', title: 'Sin fecha', order: 0 }),
        ostep({ id: 'krB', kind: 'key_result', title: 'Con fecha', order: 1, targetDate: '2026-06-03' }),
      ],
      NOW,
    )
    expect(focus.map((k) => k.title)).toEqual(['Con fecha', 'Sin fecha'])
    expect(focus[0].daysUntil).toBe(2)
    expect(focus[1].daysUntil).toBeNull()
  })

  it('la urgencia de un KR es el deadline más cercano entre sus tareas pendientes', () => {
    const focus = focusKeyResults(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 'kr1', kind: 'key_result', title: 'KR' }),
        ostep({ id: 't1', kind: 'task', parentId: 'kr1', status: 'pendiente', targetDate: '2026-06-10' }),
        ostep({ id: 't2', kind: 'task', parentId: 'kr1', status: 'pendiente', targetDate: '2026-06-04' }),
      ],
      NOW,
    )
    expect(focus[0].daysUntil).toBe(3) // la tarea más cercana (06-04)
  })

  it('KR completo (todas sus tareas hechas) → no es foco', () => {
    const focus = focusKeyResults(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 'kr1', kind: 'key_result', title: 'Cumplido' }),
        ostep({ id: 't1', kind: 'task', parentId: 'kr1', status: 'hecho' }),
      ],
      NOW,
    )
    expect(focus).toHaveLength(0)
  })

  it('sin fechas, desempata por prioridad del objetivo', () => {
    const focus = focusKeyResults(
      [goal({ id: 'g1', title: 'Baja', priority: 'low' }), goal({ id: 'g2', title: 'Crítica', priority: 'critical' })],
      [
        ostep({ id: 'krLow', objectiveId: 'g1', kind: 'key_result', title: 'KR baja' }),
        ostep({ id: 'krCrit', objectiveId: 'g2', kind: 'key_result', title: 'KR crítica' }),
      ],
      NOW,
    )
    expect(focus[0].objectiveTitle).toBe('Crítica')
  })

  it('respeta el tope (max=3 por default)', () => {
    const steps: ObjectiveStep[] = []
    for (let i = 0; i < 5; i++) {
      steps.push(ostep({ id: `kr${i}`, kind: 'key_result', title: `KR${i}`, order: i, targetDate: '2026-06-05' }))
    }
    const focus = focusKeyResults([goal({ id: 'g1' })], steps, NOW)
    expect(focus).toHaveLength(3)
  })
})

// ─── contactDatesInRange ───────────────────────────────────────────────

describe('contactDatesInRange — fechas de la red con aviso anticipado', () => {
  it('cumpleaños dentro del lead-time → item con edad, frase y nudge', () => {
    const dates = contactDatesInRange(
      [person({ name: 'Diana', birthDate: '1995-06-06' })],
      14,
      NOW,
    )
    expect(dates).toHaveLength(1)
    expect(dates[0].kind).toBe('birthday')
    expect(dates[0].title).toBe('Cumpleaños de Diana')
    expect(dates[0].daysUntil).toBe(5)
    expect(dates[0].detail).toContain('cumple 31')
    expect(dates[0].detail).toContain('en 5 días')
    expect(dates[0].nudge).toBe('Esta semana: conseguí un detalle')
  })

  it('cumpleaños lejano (con tiempo) → nudge de planear regalo', () => {
    const dates = contactDatesInRange([person({ birthDate: '1990-06-12' })], 14, NOW)
    expect(dates[0].daysUntil).toBe(11)
    expect(dates[0].nudge).toBe('Con tiempo: planeá un regalo')
  })

  it('fuera del lead-time → excluido', () => {
    const dates = contactDatesInRange([person({ birthDate: '1990-06-20' })], 14, NOW)
    expect(dates).toHaveLength(0)
  })

  it('aniversario (fecha especial) trae nudge de "algo especial"', () => {
    const sd: SpecialDate = { id: 'a1', label: 'Aniversario', date: '2020-06-10', recurring: true }
    const dates = contactDatesInRange(
      [person({ name: 'Diana', slug: 'diana', specialDates: [sd] })],
      14,
      NOW,
    )
    expect(dates).toHaveLength(1)
    expect(dates[0].kind).toBe('special_date')
    expect(dates[0].title).toBe('Aniversario · Diana')
    expect(dates[0].daysUntil).toBe(9)
    expect(dates[0].nudge).toBe('Planeá algo especial')
    expect(dates[0].href).toBe('/relaciones/diana')
  })

  it('fecha especial one-time ya pasada → excluida', () => {
    const sd: SpecialDate = { id: 'x', label: 'Mudanza', date: '2026-05-01', recurring: false }
    const dates = contactDatesInRange([person({ specialDates: [sd] })], 31, NOW)
    expect(dates).toHaveLength(0)
  })

  it('agrega fechas de TODA la red, ordenadas por cercanía', () => {
    const dates = contactDatesInRange(
      [
        person({ id: 'a', name: 'Lejos', birthDate: '1990-06-12' }),
        person({ id: 'b', name: 'Cerca', birthDate: '1990-06-03' }),
      ],
      14,
      NOW,
    )
    expect(dates.map((d) => d.title)).toEqual(['Cumpleaños de Cerca', 'Cumpleaños de Lejos'])
  })
})

// ─── monthMilestones ───────────────────────────────────────────────────

describe('monthMilestones — hitos del mes', () => {
  it('mezcla target de objetivo, deadline de tarea y fecha de la red, ordenados', () => {
    const milestones = monthMilestones(
      {
        ...EMPTY,
        goals: [goal({ id: 'g1', title: 'Lanzar', targetDate: '2026-06-25' })],
        objectiveSteps: [ostep({ id: 't1', objectiveId: 'g1', title: 'Inscripción', targetDate: '2026-06-08' })],
        people: [person({ name: 'Diana', birthDate: '1995-06-06' })],
      },
      31,
      NOW,
    )
    expect(milestones.map((m) => m.kind)).toEqual(['date', 'step_deadline', 'goal_target'])
    expect(milestones[0].title).toBe('Cumpleaños de Diana') // +5
    expect(milestones[1].title).toBe('Inscripción') // +7
    expect(milestones[2].title).toBe('Lanzar') // +24
  })

  it('objetivo vencido (activo) → incluido como hito vencido', () => {
    const milestones = monthMilestones(
      { ...EMPTY, goals: [goal({ id: 'g1', title: 'Tarde', targetDate: '2026-05-20' })] },
      31,
      NOW,
    )
    expect(milestones).toHaveLength(1)
    expect(milestones[0].overdue).toBe(true)
    expect(milestones[0].detail).toContain('vencida')
  })

  it('objetivo sin fecha o no-activo → no es hito', () => {
    const milestones = monthMilestones(
      {
        ...EMPTY,
        goals: [goal({ id: 'g1' }), goal({ id: 'g2', status: 'completed', targetDate: '2026-06-10' })],
      },
      31,
      NOW,
    )
    expect(milestones).toHaveLength(0)
  })
})

// ─── buildWeekDays ─────────────────────────────────────────────────────

describe('buildWeekDays — bucketing de la semana', () => {
  it('arma 7 buckets (hoy..+6) con isToday en el primero', () => {
    const week = buildWeekDays([], [], NOW)
    expect(week).toHaveLength(7)
    expect(week[0].isToday).toBe(true)
    expect(week[0].offset).toBe(0)
    expect(week[6].offset).toBe(6)
  })

  it('agrupa eventos del calendario por día Lima', () => {
    const week = buildWeekDays(
      [
        event({ id: 'hoy', title: 'Reunión Teams', start: '2026-06-01T15:00:00.000Z' }),
        event({ id: 'man', title: 'Dentista', start: '2026-06-02T14:00:00.000Z' }),
        event({ id: 'allday', title: 'Feriado', start: '2026-06-03', allDay: true }),
      ],
      [],
      NOW,
    )
    expect(week[0].events.map((e) => e.title)).toEqual(['Reunión Teams'])
    expect(week[1].events.map((e) => e.title)).toEqual(['Dentista'])
    expect(week[2].events.map((e) => e.title)).toEqual(['Feriado'])
  })

  it('tarea futura va a su día; tarea vencida se ancla a hoy', () => {
    const tasks = tasksDueInRange(
      [goal({ id: 'g1' })],
      [
        ostep({ id: 't1', title: 'Mañana', targetDate: '2026-06-02' }),
        ostep({ id: 't2', title: 'Vencida', targetDate: '2026-05-29' }),
      ],
      { maxDays: 6 },
      NOW,
    )
    const week = buildWeekDays([], tasks, NOW)
    expect(week[0].tasks.map((t) => t.title)).toContain('Vencida') // anclada a hoy
    expect(week[1].tasks.map((t) => t.title)).toEqual(['Mañana'])
  })

  it('all-day primero dentro del mismo día', () => {
    const week = buildWeekDays(
      [
        event({ id: 'timed', title: 'Call', start: '2026-06-01T15:00:00.000Z' }),
        event({ id: 'ad', title: 'Cumple equipo', start: '2026-06-01', allDay: true }),
      ],
      [],
      NOW,
    )
    expect(week[0].events.map((e) => e.title)).toEqual(['Cumple equipo', 'Call'])
  })
})

// ─── buildCockpit (ensamblador) ────────────────────────────────────────

describe('buildCockpit — ensamblador por horizonte', () => {
  const input = {
    goals: [goal({ id: 'g1', title: 'Mundial', targetDate: '2026-06-20' })],
    objectiveSteps: [
      ostep({ id: 'kr1', kind: 'key_result', title: 'Clasificar' }),
      ostep({ id: 't_hoy', kind: 'task', parentId: 'kr1', title: 'Entrenar', targetDate: '2026-06-01' }),
      ostep({ id: 't_sem', kind: 'task', parentId: 'kr1', title: 'Comprar pasaje', targetDate: '2026-06-04' }),
    ],
    people: [person({ name: 'Diana', birthDate: '1995-06-06' })],
    events: [event({ id: 'e1', title: 'Teams', start: '2026-06-02T15:00:00.000Z' })],
  }

  it('dia → sólo tareas que vencen hoy, resto vacío', () => {
    const c = buildCockpit(input, 'dia', NOW)
    expect(c.horizon).toBe('dia')
    expect(c.tasksToday.map((t) => t.title)).toEqual(['Entrenar'])
    expect(c.focus).toEqual([])
    expect(c.weekDays).toEqual([])
    expect(c.milestones).toEqual([])
  })

  it('semana → foco + 7 días + fechas de la red', () => {
    const c = buildCockpit(input, 'semana', NOW)
    expect(c.focus.length).toBeGreaterThan(0)
    expect(c.weekDays).toHaveLength(7)
    expect(c.contactDates.map((d) => d.title)).toContain('Cumpleaños de Diana')
    // El evento Teams cae en +1 (martes).
    expect(c.weekDays[1].events.map((e) => e.title)).toEqual(['Teams'])
    // La tarea de la semana (06-04) cae en +3.
    expect(c.weekDays[3].tasks.map((t) => t.title)).toEqual(['Comprar pasaje'])
  })

  it('mes → hitos, resto vacío', () => {
    const c = buildCockpit(input, 'mes', NOW)
    expect(c.milestones.length).toBeGreaterThan(0)
    expect(c.tasksToday).toEqual([])
    expect(c.focus).toEqual([])
    // El target del objetivo (06-20) aparece como hito.
    expect(c.milestones.some((m) => m.kind === 'goal_target' && m.title === 'Mundial')).toBe(true)
  })

  it('input vacío → cockpit vacío en cualquier horizonte', () => {
    for (const h of ['dia', 'semana', 'mes'] as const) {
      const c = buildCockpit(EMPTY, h, NOW)
      expect(c.tasksToday).toEqual([])
      expect(c.focus).toEqual([])
      expect(c.contactDates).toEqual([])
      expect(c.milestones).toEqual([])
    }
  })
})

import { describe, it, expect } from 'vitest'

import { buildLifeDirection, type LifeDirectionInput } from './lifeDirection'
import type { TrajectoryArc } from './trajectoryArc'
import type { LifeSeasons, LifeSeason } from './lifeSeasons'
import type { LifeCoherence } from './coherence'
import type { YearCompass } from '../year-compass/build'

// ── Fixtures mínimas: cada motor devuelve objetos ya computados; acá los fabrico
//    con defaults neutros y overrides puntuales por caso. ─────────────────────

function arc(over: Partial<TrajectoryArc> = {}): TrajectoryArc {
  return {
    total: 6, active: 3, completed: 2, paused: 0, abandoned: 1,
    resolved: 3, followThrough: 0.66, recentCompleted: 2, priorCompleted: 1,
    momentum: 'estable', pattern: 'building', byCategory: [],
    strongestArea: null, weakestArea: null, message: '', ...over,
  }
}

function season(over: Partial<LifeSeason> = {}): LifeSeason {
  return {
    id: 's1', startDate: '2026-01-01', endDate: '2026-03-01', spanDays: 60,
    isCurrent: false, set: 2, done: 1, paused: 0, letGo: 0,
    categories: [], goals: [], label: 'Capítulo', summary: 'resumen', ...over,
  }
}

function seasons(over: Partial<LifeSeasons> = {}): LifeSeasons {
  return { seasons: [], current: null, message: '', ...over }
}

function coherence(over: Partial<LifeCoherence> = {}): LifeCoherence {
  return {
    state: 'coherent', trend: 'estable', declared: [], anchorTitle: null,
    windowDays: 90, recentDeclaredDone: 3, recentTotalDone: 4,
    priorDeclaredDone: 1, priorTotalDone: 2, recentShare: 0.75, priorShare: 0.5,
    declaredIdle: [], topActivityArea: null, topActivityAreaDeclared: false, message: '', ...over,
  }
}

function compass(anchorTitle: string | null): YearCompass {
  return {
    year: 2026, currentMonthIndex: 6, months: [], upcoming: [],
    anchor: anchorTitle
      ? { id: 'g1', title: anchorTitle, subtitle: 'Taekwondo +80kg', monthIndex: 10, monthLabel: 'noviembre', daysUntil: 120 }
      : null,
  }
}

function input(over: Partial<LifeDirectionInput> = {}): LifeDirectionInput {
  return { arc: arc(), seasons: seasons(), thread: [], coherence: coherence(), compass: compass('Mundial'), ...over }
}

describe('buildLifeDirection', () => {
  it('hasThread=false sin objetivos ni capítulos', () => {
    const d = buildLifeDirection(input({ arc: arc({ total: 0, resolved: 0, completed: 0, abandoned: 0 }), seasons: seasons() }))
    expect(d.hasThread).toBe(false)
  })

  it('hasThread=true con objetivos', () => {
    expect(buildLifeDirection(input()).hasThread).toBe(true)
  })

  it('futuro insufficient cuando hay poco recorrido resuelto (aunque haya norte)', () => {
    const d = buildLifeDirection(input({ arc: arc({ resolved: 1, completed: 1, abandoned: 0 }) }))
    expect(d.future.outlook).toBe('insufficient')
  })

  it('on_track: señales buenas + norte declarado → el norte está en tu línea', () => {
    const d = buildLifeDirection(input({
      arc: arc({ pattern: 'building', momentum: 'acelera' }),
      coherence: coherence({ state: 'coherent', trend: 'convergiendo' }),
      compass: compass('Mundial'),
    }))
    expect(d.future.outlook).toBe('on_track')
    expect(d.future.rationale).toMatch(/en tu línea/i)
  })

  it('at_risk: soltás más + foco fuera → pide reenganche, sin culpa', () => {
    const d = buildLifeDirection(input({
      arc: arc({ pattern: 'releasing', momentum: 'desacelera' }),
      coherence: coherence({ state: 'diverging', trend: 'alejandose' }),
      compass: compass('Mundial'),
    }))
    expect(d.future.outlook).toBe('at_risk')
    expect(d.future.rationale).toMatch(/reenganche/i)
    expect(d.future.rationale).not.toMatch(/culpa|fracas|mal\b/i)
  })

  it('steady_no_anchor: vas sostenido pero sin norte declarado', () => {
    const d = buildLifeDirection(input({
      arc: arc({ pattern: 'building', momentum: 'acelera' }),
      coherence: coherence({ state: 'coherent', trend: 'convergiendo' }),
      compass: compass(null),
    }))
    expect(d.future.outlook).toBe('steady_no_anchor')
  })

  it('pasado: previousSeasonLabel = el capítulo cerrado más reciente', () => {
    const cur = season({ id: 'cur', isCurrent: true, label: 'Mudanza + Mundial' })
    const prev = season({ id: 'prev', isCurrent: false, label: 'Arranque HNG', startDate: '2025-06-01', endDate: '2025-09-01' })
    // seasons van de la más reciente a la más antigua; current primero.
    const d = buildLifeDirection(input({ seasons: seasons({ seasons: [cur, prev], current: cur }) }))
    expect(d.present.currentSeasonLabel).toBe('Mudanza + Mundial')
    expect(d.past.previousSeasonLabel).toBe('Arranque HNG')
    expect(d.past.closedSeasons).toBe(1)
  })

  it('message hilvana pasado → presente → futuro', () => {
    const cur = season({ id: 'cur', isCurrent: true, label: 'Mundial' })
    const prev = season({ id: 'prev', isCurrent: false, label: 'Arranque' })
    const d = buildLifeDirection(input({
      seasons: seasons({ seasons: [cur, prev], current: cur }),
      compass: compass('Mundial'),
    }))
    expect(d.message).toMatch(/Venís de/)
    expect(d.message).toMatch(/hoy estás en/)
  })

  it('message sin redundancia cuando el capítulo actual es el primero', () => {
    const cur = season({ id: 'cur', isCurrent: true, label: 'Mundial' })
    const d = buildLifeDirection(input({ seasons: seasons({ seasons: [cur], current: cur }) }))
    // No debe decir "primer capítulo" y "estás en X" a la vez.
    expect(d.message).toMatch(/Estás en tu primer capítulo/)
    expect(d.message).not.toMatch(/hoy estás en/)
  })

  it('firstMilestoneDate = el hito más antiguo del hilo (ordena por fecha)', () => {
    const d = buildLifeDirection(input({
      thread: [
        { id: 'm2', date: '2026-05-01', kind: 'done', title: 'B', label: 'x' },
        { id: 'm1', date: '2025-01-10', kind: 'set', title: 'A', label: 'y' },
      ],
    }))
    expect(d.past.firstMilestoneDate).toBe('2025-01-10')
    expect(d.past.milestoneCount).toBe(2)
  })
})

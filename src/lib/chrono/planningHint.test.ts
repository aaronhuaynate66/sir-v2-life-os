// SIR V2 — Tests de la sugerencia de planificación (11·M5 → /horario).

import { describe, it, expect } from 'vitest'
import { formatHourRanges, buildPlanningHint } from './planningHint'
import type { FocusWindow } from './focusWindow'
import type { Chronotype } from './chronotype'

const chrono = (p: Chronotype['position']): Chronotype => ({
  midSleepMinutes: 180, midSleepLabel: '03:00', position: p, nights: 20, unstable: false, sufficient: true,
})
const focus = (focusHours: number[], restHours: number[], sufficient = true): FocusWindow => ({
  focusHours, restHours, message: sufficient ? 'x' : null, sufficient,
})

describe('formatHourRanges', () => {
  it('devuelve vacío sin horas', () => {
    expect(formatHourRanges([])).toBe('')
  })

  it('colapsa horas contiguas en un rango', () => {
    expect(formatHourRanges([9, 10, 11])).toBe('9–11h')
  })

  it('una sola hora no lleva rango', () => {
    expect(formatHourRanges([14])).toBe('14h')
  })

  it('NO infla huecos: horas no contiguas quedan separadas', () => {
    expect(formatHourRanges([9, 10, 14, 15])).toBe('9–10h y 14–15h')
  })

  it('ordena y deduplica antes de agrupar', () => {
    expect(formatHourRanges([15, 9, 10, 15])).toBe('9–10h y 15h')
  })

  it('tres bloques usan coma y "y" final', () => {
    expect(formatHourRanges([9, 12, 18, 19])).toBe('9h, 12h y 18–19h')
  })

  it('ignora horas fuera de rango', () => {
    expect(formatHourRanges([25, -1, 10])).toBe('10h')
  })
})

describe('buildPlanningHint', () => {
  it('no emite si la ventana es insufficient', () => {
    const r = buildPlanningHint(focus([], [], false), chrono('intermedio'))
    expect(r.sufficient).toBe(false)
    expect(r.headline).toBeNull()
  })

  it('no emite sin horas de foco aunque diga suficiente', () => {
    const r = buildPlanningHint(focus([], [15], true), chrono('intermedio'))
    expect(r.sufficient).toBe(false)
  })

  it('arma la línea con foco y bajón', () => {
    const r = buildPlanningHint(focus([9, 10, 11], [14, 15]), chrono('intermedio'))
    expect(r.sufficient).toBe(true)
    expect(r.focusLabel).toBe('9–11h')
    expect(r.restLabel).toBe('14–15h')
    expect(r.headline).toContain('9–11h')
    expect(r.headline).toContain('14–15h')
  })

  it('omite la parte del bajón si no hay restHours', () => {
    const r = buildPlanningHint(focus([9, 10], []), chrono('intermedio'))
    expect(r.restLabel).toBeNull()
    expect(r.headline).not.toContain('mecánico')
  })

  it('agrega la nota de búho', () => {
    const r = buildPlanningHint(focus([16, 17], [9]), chrono('búho'))
    expect(r.headline).toMatch(/búho/i)
  })

  it('agrega la nota de alondra', () => {
    const r = buildPlanningHint(focus([8, 9], [15]), chrono('alondra'))
    expect(r.headline).toMatch(/alondra/i)
  })
})

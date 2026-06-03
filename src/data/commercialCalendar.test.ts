// SIR V2 — Tests del calendario comercial de Perú.
//
// nextCommercialOccurrence recibe `now` explícito → determinístico y
// TZ-independiente. Cubrimos fixed, nthWeekday, el roll-over al año siguiente
// y el caso "hoy es el día".

import { describe, it, expect } from 'vitest'

import {
  PERU_COMMERCIAL_CALENDAR,
  nextCommercialOccurrence,
  type CommercialDateSpec,
} from './commercialCalendar'

describe('nextCommercialOccurrence — fixed', () => {
  const navidad: CommercialDateSpec = { type: 'fixed', month: 11, day: 25 }

  it('devuelve la ocurrencia de este año si aún no pasó', () => {
    const { date, daysUntil } = nextCommercialOccurrence(navidad, new Date(2026, 11, 1))
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(11)
    expect(date.getDate()).toBe(25)
    expect(daysUntil).toBe(24)
  })

  it('rueda al año siguiente si la de este año ya pasó', () => {
    const { date } = nextCommercialOccurrence(navidad, new Date(2026, 11, 26))
    expect(date.getFullYear()).toBe(2027)
  })

  it('hoy es el día → daysUntil 0', () => {
    const { daysUntil } = nextCommercialOccurrence(navidad, new Date(2026, 11, 25))
    expect(daysUntil).toBe(0)
  })
})

describe('nextCommercialOccurrence — nthWeekday', () => {
  it('Día de la Madre 2026 = 2° domingo de mayo = 10-may', () => {
    const diaMadre: CommercialDateSpec = { type: 'nthWeekday', month: 4, weekday: 0, n: 2 }
    const { date } = nextCommercialOccurrence(diaMadre, new Date(2026, 0, 1))
    expect(date.getMonth()).toBe(4)
    expect(date.getDate()).toBe(10) // 1-may-2026 es viernes → 1er dom = 3, 2° = 10
  })

  it('Black Friday 2026 = 4° viernes de noviembre = 27-nov', () => {
    const blackFriday: CommercialDateSpec = { type: 'nthWeekday', month: 10, weekday: 5, n: 4 }
    const { date } = nextCommercialOccurrence(blackFriday, new Date(2026, 9, 1))
    expect(date.getMonth()).toBe(10)
    expect(date.getDate()).toBe(27) // 1-nov-2026 es domingo → 1er vie = 6, 4° = 27
  })

  it('Día del Padre 2026 = 3er domingo de junio = 21-jun', () => {
    const diaPadre: CommercialDateSpec = { type: 'nthWeekday', month: 5, weekday: 0, n: 3 }
    const { date } = nextCommercialOccurrence(diaPadre, new Date(2026, 0, 1))
    expect(date.getMonth()).toBe(5)
    expect(date.getDate()).toBe(21)
  })
})

describe('PERU_COMMERCIAL_CALENDAR', () => {
  it('tiene ids únicos y leadDays positivos', () => {
    const ids = PERU_COMMERCIAL_CALENDAR.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of PERU_COMMERCIAL_CALENDAR) {
      expect(e.leadDays).toBeGreaterThan(0)
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.hint.length).toBeGreaterThan(0)
    }
  })
})

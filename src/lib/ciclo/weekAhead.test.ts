// SIR V2 — Tests del detector de "semana con carga afectiva" (weekAhead).

import { describe, it, expect } from 'vitest'
import { buildCycleWeekAhead, buildCycleWeekAheadLine, type WomanCycleInput } from './weekAhead'

const NOW = new Date('2026-07-24T12:00:00Z')

describe('buildCycleWeekAhead — proyección e intersección con el horizonte', () => {
  it('detecta ventana menstrual cuando el período empieza hoy', () => {
    const women: WomanCycleInput[] = [
      { personId: 'p1', name: 'Amira Laguna', cycleStartDate: '2026-07-24', cycleLengthDays: 28 },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(1)
    expect(wa.women[0].kind).toBe('menstrual')
    expect(wa.women[0].activeNow).toBe(true)
    expect(wa.women[0].windowStart).toBe('2026-07-24')
    expect(wa.women[0].basis).toBe('proyectado')
  })

  it('una ventana lejana (fuera del horizonte) NO se reporta', () => {
    // Período empezó hace 10 días (ciclo 28) → próxima ventana sensible recién en ~2 semanas.
    const women: WomanCycleInput[] = [
      { personId: 'p1', name: 'Lejana', cycleStartDate: '2026-07-14', cycleLengthDays: 28 },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(0)
    expect(buildCycleWeekAheadLine(wa)).toBeNull()
  })

  it('proyecta la ventana premenstrual del próximo período dentro del horizonte', () => {
    // Período empezó el 2026-07-04 (ciclo 28) → próximo período ~2026-08-01 →
    // premenstrual ~[07-27, 07-31], interseca el horizonte de 7 días desde el 24.
    const women: WomanCycleInput[] = [
      { personId: 'p1', name: 'Proyectada', cycleStartDate: '2026-07-04', cycleLengthDays: 28 },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(1)
    expect(wa.women[0].kind).toBe('premenstrual')
    expect(wa.women[0].activeNow).toBe(false)
  })
})

describe('anclas observadas', () => {
  it('un ancla "pms" reciente cuenta como ventana premenstrual AHORA', () => {
    const women: WomanCycleInput[] = [
      { personId: 'd', name: 'Diana Cencaro', anchors: [{ date: '2026-07-23', phase: 'pms' }] },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(1)
    expect(wa.women[0].kind).toBe('premenstrual')
    expect(wa.women[0].basis).toBe('observado')
    expect(wa.women[0].activeNow).toBe(true)
  })

  it('un ancla "bleeding" reciente cuenta como ventana menstrual AHORA', () => {
    const women: WomanCycleInput[] = [
      { personId: 'b', name: 'Bea', anchors: [{ date: '2026-07-24', phase: 'bleeding' }] },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women[0].kind).toBe('menstrual')
    expect(wa.women[0].basis).toBe('observado')
  })

  it('un ancla vieja (fuera del lookback) NO cuenta como ventana ahora', () => {
    const women: WomanCycleInput[] = [
      { personId: 'x', name: 'Vieja', anchors: [{ date: '2026-07-10', phase: 'pms' }] },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(0)
  })
})

describe('sincronía (clúster)', () => {
  it('marca el clúster cuando ≥2 mujeres coinciden en la ventana', () => {
    const women: WomanCycleInput[] = [
      { personId: 'a', name: 'Amira Laguna', cycleStartDate: '2026-07-24', cycleLengthDays: 28 },
      { personId: 'e', name: 'Aeylin Ocampo', cycleStartDate: '2026-07-22', cycleLengthDays: 28 },
      { personId: 'd', name: 'Diana Cencaro', anchors: [{ date: '2026-07-23', phase: 'pms' }] },
    ]
    const wa = buildCycleWeekAhead(women, NOW, 7)
    expect(wa.women).toHaveLength(3)
    expect(wa.synced).toBe(true)
    expect(wa.syncedNames).toEqual(expect.arrayContaining(['Amira Laguna', 'Aeylin Ocampo', 'Diana Cencaro']))
  })

  it('NO marca sincronía si las ventanas no se solapan en el tiempo', () => {
    const women: WomanCycleInput[] = [
      { personId: 'a', name: 'Ahora', cycleStartDate: '2026-07-24', cycleLengthDays: 28 }, // menstrual [24-28]
      { personId: 'b', name: 'Despues', cycleStartDate: '2026-07-06', cycleLengthDays: 28 }, // premenstrual ~[07-29,08-02]
    ]
    const wa = buildCycleWeekAhead(women, NOW, 10)
    expect(wa.women.length).toBeGreaterThanOrEqual(2)
    expect(wa.synced).toBe(false)
    expect(wa.syncedNames).toEqual([])
  })
})

describe('confianza (honestidad con poca data)', () => {
  it('proyección desde una sola fecha → confianza baja', () => {
    const wa = buildCycleWeekAhead(
      [{ personId: 'p', name: 'Sola', cycleStartDate: '2026-07-24', cycleLengthDays: 28 }],
      NOW,
      7,
    )
    expect(wa.women[0].confidence).toBe('baja')
  })

  it('ancla observada → confianza media', () => {
    const wa = buildCycleWeekAhead(
      [{ personId: 'd', name: 'Diana', anchors: [{ date: '2026-07-23', phase: 'pms' }] }],
      NOW,
      7,
    )
    expect(wa.women[0].confidence).toBe('media')
  })
})

describe('línea de alerta — MARCO ÉTICO de cuidado', () => {
  const FORBIDDEN = /insoportable|insufrible|cuidado con ella|viene dif[ií]cil|est[aá] terrible|aguant|manej[aá]rla|gestionarla/i

  it('clúster: nombra a las mujeres, marca estimación y NO descalifica', () => {
    const women: WomanCycleInput[] = [
      { personId: 'a', name: 'Amira Laguna', cycleStartDate: '2026-07-24', cycleLengthDays: 28 },
      { personId: 'e', name: 'Aeylin Ocampo', cycleStartDate: '2026-07-22', cycleLengthDays: 28 },
      { personId: 'd', name: 'Diana Cencaro', anchors: [{ date: '2026-07-23', phase: 'pms' }] },
    ]
    const line = buildCycleWeekAheadLine(buildCycleWeekAhead(women, NOW, 7))
    expect(line).toBeTruthy()
    expect(line!).toMatch(/Amira/)
    expect(line!).toMatch(/Aeylin/)
    expect(line!).toMatch(/Diana/)
    expect(line!).toMatch(/suavidad|presencia|espacio/i)
    expect(line!).toMatch(/estimaci[oó]n|tendencia/i)
    expect(line!).not.toMatch(FORBIDDEN)
  })

  it('una sola mujer: tono de cuidado, sin veredicto', () => {
    const line = buildCycleWeekAheadLine(
      buildCycleWeekAhead([{ personId: 'd', name: 'Diana Cencaro', anchors: [{ date: '2026-07-23', phase: 'pms' }] }], NOW, 7),
    )
    expect(line!).toMatch(/Diana/)
    expect(line!).toMatch(/sin tratarla distinto/i)
    expect(line!).not.toMatch(FORBIDDEN)
  })

  it('sin ventanas → sin línea (no inventa ruido)', () => {
    expect(buildCycleWeekAheadLine(buildCycleWeekAhead([], NOW, 7))).toBeNull()
  })

  it('desambigua primeros nombres repetidos (dos "Diana") con el apellido', () => {
    const women: WomanCycleInput[] = [
      { personId: '1', name: 'Diana Cencaro', anchors: [{ date: '2026-07-23', phase: 'pms' }] },
      { personId: '2', name: 'Diana Carolina Díaz', cycleStartDate: '2026-07-24', cycleLengthDays: 28 },
    ]
    const line = buildCycleWeekAheadLine(buildCycleWeekAhead(women, NOW, 7))!
    expect(line).toMatch(/Diana Cencaro/)
    expect(line).toMatch(/Diana Carolina/)
    expect(line).not.toMatch(/Diana, Diana|Diana y Diana/)
  })
})

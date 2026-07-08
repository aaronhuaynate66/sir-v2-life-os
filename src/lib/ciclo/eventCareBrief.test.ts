// SIR V2 — Tests del briefing de cuidado por evento.

import { describe, it, expect } from 'vitest'
import { buildEventCareBrief } from './eventCareBrief'

// Último período 26-may, ciclo 28 → períodos proyectados: 26may, 23jun, 21jul…
// El 18-jul cae en el ciclo que arrancó 23jun → día 26 → SPM (premenstrual).
const BASE = { lastPeriodStart: '2026-05-26', cycleLengthDays: 28, bandDays: 4, now: new Date(2026, 6, 8) }

describe('buildEventCareBrief — caso boda de Laura (SPM)', () => {
  const b = buildEventCareBrief({ ...BASE, eventLabel: 'Matrimonio de Laura', eventDateIso: '2026-07-18' })!
  it('ubica el evento en día 26, fase premenstrual (SPM)', () => {
    expect(b.cycleDay).toBe(26)
    expect(b.phase).toBe('luteal')
    expect(b.isPms).toBe(true)
  })
  it('lee el estado con cuidado (menos resto, sensibilidad) y da el countdown', () => {
    expect(b.daysUntilEvent).toBe(10)
    expect(b.stateRead).toMatch(/menos resto|sensibilidad|cansada/i)
    expect(b.headline).toMatch(/premenstrual|SPM/i)
  })
  it('sugiere cuidado concreto: detalle/flores + no sobrecargar (evento social) + intimidad como ternura', () => {
    const joined = b.suggestions.join(' · ')
    expect(joined).toMatch(/flores|detalle/i)
    expect(joined).toMatch(/plan de salida|no sobrecargar|sin apuro/i) // boda = social largo
    expect(joined).toMatch(/ternura|cercanía/i)
    expect(joined).toMatch(/migraña|medicación/i)
  })
  it('trae la línea de honestidad (tendencia, no certeza) + confianza', () => {
    expect(b.caveat).toMatch(/tendencia, no su estado real/i)
    expect(['alta', 'media', 'baja']).toContain(b.confidence)
    expect(b.energyCurve).toHaveLength(28)
    expect(b.energy).toBeGreaterThan(0)
  })
})

describe('buildEventCareBrief — fase fértil propone plan lindo', () => {
  it('en ovulación/fértil sugiere el momento para algo especial', () => {
    // 26may + 13 días = 8jun → día 14 → ovulación (28-14=14).
    const b = buildEventCareBrief({ ...BASE, eventLabel: 'Cita', eventDateIso: '2026-06-08' })!
    expect(['ovulation']).toContain(b.phase)
    expect(b.suggestions.join(' ')).toMatch(/especial|sorpresa|cita|momento/i)
  })
})

describe('buildEventCareBrief — bordes', () => {
  it('fecha inválida → null', () => {
    expect(buildEventCareBrief({ ...BASE, eventLabel: 'x', eventDateIso: 'nope' })).toBeNull()
  })
})

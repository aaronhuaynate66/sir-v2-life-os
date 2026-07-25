import { describe, it, expect } from 'vitest'
import { crossAgendaWithCycles, renderCycleAgendaLine, type AgendaEventLite } from './agendaCross'
import type { SensitiveWindow } from './weekAhead'

const HOY = '2026-07-28'

const win = (over: Partial<SensitiveWindow> = {}): SensitiveWindow => ({
  personId: 'per_diana', name: 'Diana Carolina', kind: 'premenstrual',
  windowStart: '2026-07-28', windowEnd: '2026-07-31',
  confidence: 'media', basis: 'proyectado', activeNow: true, ...over,
})
const ev = (over: Partial<AgendaEventLite> = {}): AgendaEventLite => ({
  date: '2026-07-29', title: 'Cena de aniversario', personId: 'per_diana', ...over,
})

describe('crossAgendaWithCycles', () => {
  it('cruza el plan que cae dentro de la ventana de ESA persona', () => {
    const hits = crossAgendaWithCycles([ev()], [win()])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ name: 'Diana Carolina', kind: 'premenstrual', title: 'Cena de aniversario' })
  })

  it('ignora el plan fuera de la ventana', () => {
    expect(crossAgendaWithCycles([ev({ date: '2026-08-05' })], [win()])).toHaveLength(0)
  })

  it('ignora eventos sin persona (un almuerzo suelto no dice nada de nadie)', () => {
    expect(crossAgendaWithCycles([ev({ personId: null })], [win()])).toHaveLength(0)
  })

  it('no cruza con la ventana de OTRA persona', () => {
    expect(crossAgendaWithCycles([ev({ personId: 'per_otra' })], [win()])).toHaveLength(0)
  })

  it('respeta el horizonte', () => {
    expect(crossAgendaWithCycles([ev()], [win()], { from: '2026-07-30' })).toHaveLength(0)
    expect(crossAgendaWithCycles([ev()], [win()], { to: '2026-07-28' })).toHaveLength(0)
  })

  it('ordena por fecha', () => {
    const hits = crossAgendaWithCycles(
      [ev({ date: '2026-07-31', title: 'B' }), ev({ date: '2026-07-29', title: 'A' })],
      [win()],
    )
    expect(hits.map((h) => h.title)).toEqual(['A', 'B'])
  })

  it('sin ventanas o sin eventos no revienta', () => {
    expect(crossAgendaWithCycles([], [win()])).toEqual([])
    expect(crossAgendaWithCycles([ev()], [])).toEqual([])
  })
})

describe('renderCycleAgendaLine', () => {
  it('nombra el plan, el día y sugiere margen — sin adjetivar a nadie', () => {
    const line = renderCycleAgendaLine(crossAgendaWithCycles([ev()], [win()]), HOY)!
    expect(line).toContain('Cena de aniversario')
    expect(line).toContain('Diana')
    expect(line).toContain('mañana')
    expect(line).toContain('estimación')
    expect(line).toMatch(/suave|margen/)
  })

  it('NUNCA usa lenguaje de gestión ni descalificación', () => {
    const line = renderCycleAgendaLine(crossAgendaWithCycles([ev()], [win({ kind: 'menstrual' })]), HOY)!
    for (const prohibido of ['aprovecha', 'evita', 'difícil', 'insoportable', 'cuidado con', 'hormonal']) {
      expect(line.toLowerCase()).not.toContain(prohibido)
    }
  })

  it('dice "hoy" cuando es hoy y cuenta los demás planes', () => {
    const hits = crossAgendaWithCycles(
      [ev({ date: HOY, title: 'Conversar lo del depa' }), ev({ date: '2026-07-30', title: 'Cine' })],
      [win()],
    )
    const line = renderCycleAgendaLine(hits, HOY)!
    expect(line).toContain('hoy')
    expect(line).toContain('1 plan más')
  })

  it('sin cruces no dice nada', () => {
    expect(renderCycleAgendaLine([], HOY)).toBeNull()
  })
})

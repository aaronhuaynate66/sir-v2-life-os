import { describe, it, expect } from 'vitest'
import { extractDayRef, renderDayContext, limaDayUtcWindow, type DaySlices } from './dayContext'

const TODAY = '2026-06-19'

describe('extractDayRef', () => {
  it('hoy/ayer/anteayer', () => {
    expect(extractDayRef('¿qué pasó hoy?', TODAY)).toBe('2026-06-19')
    expect(extractDayRef('y ayer?', TODAY)).toBe('2026-06-18')
    expect(extractDayRef('anteayer cómo venía', TODAY)).toBe('2026-06-17')
  })
  it('ISO y D/M/Y', () => {
    expect(extractDayRef('mostrame el 2026-06-16', TODAY)).toBe('2026-06-16')
    expect(extractDayRef('qué pasó el 16/06/2026', TODAY)).toBe('2026-06-16')
    expect(extractDayRef('el 16/06', TODAY)).toBe('2026-06-16')
  })
  it('D de mes', () => {
    expect(extractDayRef('qué pasó el 16 de junio', TODAY)).toBe('2026-06-16')
    expect(extractDayRef('el 1 de abril de 2026', TODAY)).toBe('2026-04-01')
  })
  it('"el D" suelto: mes actual; si es futuro, mes anterior', () => {
    expect(extractDayRef('qué pasó el 16', TODAY)).toBe('2026-06-16')
    expect(extractDayRef('qué pasó el 25', TODAY)).toBe('2026-05-25') // 25>19 → mes anterior
  })
  it('sin fecha → null', () => {
    expect(extractDayRef('cómo está mi relación con Diana', TODAY)).toBeNull()
  })
})

describe('limaDayUtcWindow', () => {
  it('día Lima D = [D 05:00Z, D+1 05:00Z)', () => {
    expect(limaDayUtcWindow('2026-06-18')).toEqual({
      startUtc: '2026-06-18T05:00:00.000Z', endUtc: '2026-06-19T05:00:00.000Z',
    })
  })
})

describe('renderDayContext', () => {
  const base: DaySlices = { date: '2026-06-18', moonLabel: 'Luna llena', interactions: [], observations: [], deals: [], steps: [], health: [], scoreMoves: [], finances: [], signals: [], weather: null }
  it('vacío → dice sin registros', () => {
    expect(renderDayContext(base)).toContain('Sin registros')
  })
  it('arma bloques con lo que hay + luna', () => {
    const out = renderDayContext({ ...base,
      interactions: [{ person: 'Mamá', quality: 2, note: 'pelea por el Mundial' }],
      health: [{ label: 'Energía', value: '8/10' }],
      scoreMoves: [{ person: 'Mamá', global: 55, delta: -6 }],
    })
    expect(out).toContain('Luna llena')
    expect(out).toContain('Mamá (tensa): pelea por el Mundial')
    expect(out).toContain('Energía: 8/10')
    expect(out).toContain('-6 vs día previo')
  })
})

import { dayMood } from './dayContext'

const base = (over: Partial<DaySlices> = {}): DaySlices => ({
  date: '2026-06-18', moonLabel: null, interactions: [], observations: [],
  deals: [], steps: [], health: [], scoreMoves: [], finances: [], signals: [], weather: null, ...over,
})

describe('dayMood', () => {
  it('vacío sin registros', () => {
    expect(dayMood(base()).tone).toBe('empty')
  })
  it('tenso si hubo roce (calidad<=2)', () => {
    const m = dayMood(base({ interactions: [{ person: 'Maria Isabel', quality: 2, note: 'Conversación reciente TENSA — pelea por el Mundial' }] }))
    expect(m.tone).toBe('tense')
    expect(m.headline).toMatch(/Roce con Maria/)
    expect(m.headline).not.toMatch(/Conversación reciente TENSA/)
  })
  it('cálido si hubo momento pleno sin roce', () => {
    expect(dayMood(base({ interactions: [{ person: 'Pablo', quality: 5, note: null }] })).tone).toBe('warm')
  })
  it('tranquilo si hubo registro pero nada marcado', () => {
    expect(dayMood(base({ health: [{ label: 'Sueño', value: '7h' }] })).tone).toBe('calm')
  })
})

import { describe, it, expect } from 'vitest'
import { habitNudge } from './nudge'

const TODAY = new Date('2026-06-08T12:00:00Z')

describe('habitNudge', () => {
  it('sin hábitos → null', () => {
    expect(habitNudge([], TODAY)).toBeNull()
  })

  it('todos marcados hoy → win', () => {
    const r = habitNudge([{ title: 'meditar', checkinDates: ['2026-06-08'] }], TODAY)
    expect(r?.tone).toBe('win')
  })

  it('ninguno marcado hoy → nudge de arranque', () => {
    const r = habitNudge(
      [
        { title: 'meditar', checkinDates: [] },
        { title: 'leer', checkinDates: [] },
      ],
      TODAY,
    )
    expect(r?.tone).toBe('nudge')
    expect(r?.text).toContain('Arrancá')
  })

  it('algunos pendientes → cuenta los que faltan', () => {
    const r = habitNudge(
      [
        { title: 'meditar', checkinDates: ['2026-06-08'] },
        { title: 'leer', checkinDates: [] },
      ],
      TODAY,
    )
    expect(r?.tone).toBe('nudge')
    expect(r?.text).toContain('falta 1 hábito')
  })

  it('racha real rota (>=3, hoy 0) tiene prioridad sobre pendientes → recover', () => {
    const r = habitNudge(
      [{ title: 'meditar', checkinDates: ['2026-06-03', '2026-06-04', '2026-06-05'] }],
      TODAY,
    )
    expect(r?.tone).toBe('recover')
    expect(r?.text).toContain('meditar')
  })

  it('racha corta rota (<3) NO dispara recover, cae a nudge', () => {
    const r = habitNudge([{ title: 'meditar', checkinDates: ['2026-06-05'] }], TODAY)
    expect(r?.tone).toBe('nudge')
  })
})

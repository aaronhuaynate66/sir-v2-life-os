import { describe, it, expect } from 'vitest'
import { buildEveningHabitsPush } from './eveningPush'

const TODAY = new Date('2026-06-24T23:00:00Z')
const iso = '2026-06-24'

describe('buildEveningHabitsPush', () => {
  it('null si no hay diarios pendientes', () => {
    expect(buildEveningHabitsPush([{ title: 'meditar', cadence: 'daily', checkinDates: [iso] }], TODAY)).toBeNull()
  })
  it('lista los diarios pendientes', () => {
    const p = buildEveningHabitsPush([
      { title: 'meditar', cadence: 'daily', checkinDates: [] },
      { title: 'leer', cadence: 'daily', checkinDates: [] },
    ], TODAY)
    expect(p?.body).toContain('meditar')
    expect(p?.body).toContain('leer')
    expect(p?.title).toContain('cerrar el día')
  })
  it('ignora los semanales (no se naggean de noche)', () => {
    expect(buildEveningHabitsPush([{ title: 'entrenar', cadence: 'weekly', checkinDates: [] }], TODAY)).toBeNull()
  })
  it('resume con +N si hay más de 3', () => {
    const p = buildEveningHabitsPush(
      ['a', 'b', 'c', 'd'].map((t) => ({ title: t, cadence: 'daily' as const, checkinDates: [] })),
      TODAY,
    )
    expect(p?.body).toContain('+1')
  })
})

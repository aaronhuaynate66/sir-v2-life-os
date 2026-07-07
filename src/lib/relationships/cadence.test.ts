import { describe, it, expect } from 'vitest'
import { suggestedCadenceDays, cadenceStatus } from './cadence'

const NOW = Date.parse('2026-07-06T12:00:00Z')
const DAY = 86_400_000
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10)

describe('suggestedCadenceDays', () => {
  it('más importante → más frecuente', () => {
    expect(suggestedCadenceDays(10)).toBe(7)
    expect(suggestedCadenceDays(8)).toBe(14)
    expect(suggestedCadenceDays(5)).toBe(30)
    expect(suggestedCadenceDays(3)).toBe(60)
    expect(suggestedCadenceDays(1)).toBe(120)
  })
})

describe('cadenceStatus', () => {
  it('al día si el silencio no superó el target', () => {
    const r = cadenceStatus(9, iso(5), NOW) // target 7, silencio 5
    expect(r.state).toBe('al_dia')
    expect(r.overdueDays).toBe(0)
  })
  it('atrasado con días de atraso', () => {
    const r = cadenceStatus(9, iso(20), NOW) // target 7, silencio 20 → atraso 13
    expect(r.state).toBe('atrasado')
    expect(r.overdueDays).toBe(13)
  })
  it('sin registro si no hay último contacto', () => {
    expect(cadenceStatus(5, null, NOW).state).toBe('sin_registro')
    expect(cadenceStatus(5, '', NOW).state).toBe('sin_registro')
  })
})

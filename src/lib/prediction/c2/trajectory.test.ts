import { describe, it, expect } from 'vitest'
import { forecastTrajectories, coolingSoon } from './trajectory'

const NOW = Date.parse('2026-07-06T12:00:00Z')
const DAY = 86_400_000
const daysAgo = (d: number) => NOW - d * DAY

describe('forecastTrajectories (C2)', () => {
  it('insuficiente con menos de 3 contactos', () => {
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: [daysAgo(2), daysAgo(9)] }], NOW)
    expect(r[0].status).toBe('insufficient')
    expect(r[0].weeksToDormant).toBeNull()
  })

  it('steady si está al día con su cadencia (~cada 7d)', () => {
    // contactos cada ~7 días, último hace 5d → dentro del ritmo
    const ints = [40, 33, 26, 19, 12, 5].map(daysAgo)
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: ints }], NOW)
    expect(r[0].status).toBe('steady')
    expect(r[0].cadenceDays).toBeGreaterThan(5)
  })

  it('cooling cuando el silencio supera la cadencia pero falta para el umbral', () => {
    // cadencia ~7d, pero último contacto hace 30d → enfriándose, umbral 60 → ~4+ sem
    const ints = [72, 65, 58, 51, 44, 37, 30].map(daysAgo)
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: ints }], NOW)
    expect(['cooling', 'going_dormant']).toContain(r[0].status)
    expect(r[0].weeksToDormant).not.toBeNull()
    expect(r[0].weeksToDormant!).toBeGreaterThan(0)
  })

  it('dormant cuando el silencio superó el umbral', () => {
    // cadencia corta, último contacto hace 90d → dormido
    const ints = [110, 103, 96, 90].map(daysAgo)
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: ints }], NOW)
    expect(r[0].status).toBe('dormant')
    expect(r[0].weeksToDormant).toBeNull()
  })

  it('going_dormant cuando está cerca del umbral', () => {
    // cadencia ~7d (umbral 60), silencio ~55d → ~0.7 sem para dormir
    const ints = [76, 69, 62, 55].map(daysAgo)
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: ints }], NOW)
    expect(r[0].status).toBe('going_dormant')
    expect(r[0].weeksToDormant!).toBeLessThanOrEqual(3)
  })

  it('usa lastContactMs si es más reciente que el último log', () => {
    const ints = [40, 33, 26].map(daysAgo) // último log hace 26d
    const r = forecastTrajectories([{ id: 'a', name: 'A', interactionsMs: ints, lastContactMs: daysAgo(2) }], NOW)
    expect(r[0].silenceDays).toBeLessThanOrEqual(3) // toma el contacto de hace 2d
  })

  it('coolingSoon filtra y ordena por urgencia', () => {
    const trajs = forecastTrajectories(
      [
        { id: 'steady', name: 'Steady', interactionsMs: [21, 14, 7, 2].map(daysAgo) },
        { id: 'cool', name: 'Cool', interactionsMs: [72, 65, 58, 51, 44, 37, 30].map(daysAgo) },
        { id: 'urgent', name: 'Urgent', interactionsMs: [76, 69, 62, 55].map(daysAgo) },
      ],
      NOW,
    )
    const soon = coolingSoon(trajs)
    expect(soon.every((t) => t.status === 'cooling' || t.status === 'going_dormant')).toBe(true)
    // el más urgente (menos semanas) primero
    expect(soon[0].id).toBe('urgent')
  })
})

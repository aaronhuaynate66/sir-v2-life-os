import { describe, it, expect } from 'vitest'
import { buildBondEvolution } from './bondEvolution'

const NOW = new Date('2026-06-11T12:00:00Z')
const snap = (dateBucket: string, global: number) => ({ dateBucket, global })

describe('buildBondEvolution', () => {
  it('score plano → sin quiebres, tendencia stable', () => {
    const e = buildBondEvolution([snap('2026-06-08', 70), snap('2026-06-09', 70), snap('2026-06-10', 70)], NOW)
    expect(e.shifts).toHaveLength(0)
    expect(e.trend.direction).toBe('stable')
  })

  it('detecta quiebres ≥ umbral, más reciente primero', () => {
    const e = buildBondEvolution(
      [snap('2026-06-05', 70), snap('2026-06-07', 76), snap('2026-06-08', 75), snap('2026-06-10', 82)],
      NOW,
    )
    expect(e.shifts).toHaveLength(2)
    expect(e.shifts[0].to).toBe(82)
    expect(e.shifts[0].direction).toBe('up')
    expect([e.shifts[1].from, e.shifts[1].to]).toEqual([70, 76])
  })

  it('detecta bajada y calcula el span', () => {
    const e = buildBondEvolution([snap('2026-05-28', 80), snap('2026-05-29', 79), snap('2026-06-02', 72)], NOW)
    expect(e.shifts).toHaveLength(1)
    expect(e.shifts[0].direction).toBe('down')
    expect(e.shifts[0].spanDays).toBe(5)
  })

  it('movimientos chicos (< umbral) son ruido, no quiebres', () => {
    const e = buildBondEvolution([snap('2026-06-08', 70), snap('2026-06-09', 73), snap('2026-06-10', 71)], NOW)
    expect(e.shifts).toHaveLength(0)
  })

  it('un solo snapshot → sin quiebres, insufficient_data', () => {
    const e = buildBondEvolution([snap('2026-06-10', 70)], NOW)
    expect(e.shifts).toHaveLength(0)
    expect(e.trend.direction).toBe('insufficient_data')
  })
})

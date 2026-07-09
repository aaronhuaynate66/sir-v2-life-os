import { describe, it, expect } from 'vitest'

import { mapWithConcurrency } from './pool'

describe('mapWithConcurrency', () => {
  it('preserva el orden de resultados', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40])
  })

  it('nunca excede el límite de tareas en vuelo', async () => {
    let inFlight = 0
    let maxInFlight = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(maxInFlight).toBeGreaterThan(1) // sí corre en paralelo
  })

  it('llama onSettle una vez por item', async () => {
    const settled: number[] = []
    await mapWithConcurrency([1, 2, 3], 2, async (n) => n, (i) => settled.push(i))
    expect(settled.sort()).toEqual([0, 1, 2])
  })

  it('lista vacía → []', async () => {
    expect(await mapWithConcurrency([], 3, async (x) => x)).toEqual([])
  })

  it('clampa límite <1 a 1 (no cuelga)', async () => {
    const out = await mapWithConcurrency([1, 2], 0, async (n) => n)
    expect(out).toEqual([1, 2])
  })
})

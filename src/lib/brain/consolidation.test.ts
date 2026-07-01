import { describe, expect, it } from 'vitest'

import { applyNightDecay, NIGHT_DECAY_FACTOR, CLEANUP_THRESHOLD } from './consolidation'

describe('brain/consolidation · applyNightDecay', () => {
  it('multiplica el peso por el factor default', () => {
    const r = applyNightDecay(2)
    expect(r.shouldDelete).toBe(false)
    expect(r.weight).toBeCloseTo(2 * NIGHT_DECAY_FACTOR, 4)
  })

  it('preserva signo negativo (arista descartada sigue debilitandose)', () => {
    const r = applyNightDecay(-3)
    expect(r.weight).toBeLessThan(0)
    expect(r.weight).toBeGreaterThan(-3)
  })

  it('borra cuando el valor absoluto cae por debajo del threshold', () => {
    const r = applyNightDecay(0.04)
    expect(r.shouldDelete).toBe(true)
    expect(r.weight).toBeNull()
  })

  it('borra cuando el input es NaN o Infinity (defensivo)', () => {
    expect(applyNightDecay(Number.NaN).shouldDelete).toBe(true)
    expect(applyNightDecay(Number.POSITIVE_INFINITY).shouldDelete).toBe(true)
  })

  it('respeta factor y threshold personalizados', () => {
    // factor 0.5 sobre 1.0 = 0.5, sigue arriba del threshold custom 0.1
    const a = applyNightDecay(1, { factor: 0.5, threshold: 0.1 })
    expect(a.weight).toBe(0.5)
    expect(a.shouldDelete).toBe(false)
    // el mismo peso con threshold 0.6 → borra
    const b = applyNightDecay(1, { factor: 0.5, threshold: 0.6 })
    expect(b.shouldDelete).toBe(true)
  })

  it('redondea a 4 decimales para no acumular drift', () => {
    const r = applyNightDecay(1 / 3)
    // 1/3 * 0.98 = 0.32666... → redondeado a 0.3267
    expect(r.weight).toBe(0.3267)
  })

  it('un delta 3.0 sin refuerzo se acerca a 1.5 en ~35 dias', () => {
    let w = 3.0
    for (let day = 0; day < 35; day++) {
      const r = applyNightDecay(w)
      if (r.shouldDelete) { w = 0; break }
      w = r.weight as number
    }
    // Sanity: aproximadamente la mitad tras 35 iteraciones con factor 0.98.
    // 3 * 0.98^35 ≈ 1.485
    expect(w).toBeGreaterThan(1.3)
    expect(w).toBeLessThan(1.6)
  })

  it('exportar constantes matchea los defaults', () => {
    expect(NIGHT_DECAY_FACTOR).toBe(0.98)
    expect(CLEANUP_THRESHOLD).toBe(0.05)
  })
})

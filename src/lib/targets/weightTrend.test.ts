import { describe, it, expect } from 'vitest'
import { weightSlopePerMonth, assessWeightTrend, renderWeightTrendLine, type WeightReading, type WeightCategory } from './weightTrend'

const NOW = new Date('2026-07-25T12:00:00Z')
/** +80 kg: categoría ABIERTA (sin techo). */
const MAS_DE_80: WeightCategory = { minKg: 80, maxKg: null }

/** Serie sintética: arranca en `desde` kg y cambia `kgMes` por mes. */
function serie(desde: number, kgMes: number, dias = 60, cada = 3): WeightReading[] {
  const out: WeightReading[] = []
  for (let d = dias; d >= 0; d -= cada) {
    const at = new Date(NOW.getTime() - d * 86_400_000).toISOString().slice(0, 10)
    out.push({ at, kg: Math.round((desde + (kgMes / 30) * (dias - d)) * 100) / 100 })
  }
  return out
}

describe('weightSlopePerMonth', () => {
  it('detecta una bajada sostenida', () => {
    expect(weightSlopePerMonth(serie(83, -0.7), NOW)).toBeCloseTo(-0.7, 1)
  })

  it('detecta una subida', () => {
    expect(weightSlopePerMonth(serie(80, 1.2), NOW)).toBeCloseTo(1.2, 1)
  })

  it('peso estable → ~0', () => {
    expect(Math.abs(weightSlopePerMonth(serie(81.4, 0), NOW) ?? 99)).toBeLessThan(0.1)
  })

  it('no inventa tendencia con pocas lecturas', () => {
    expect(weightSlopePerMonth([{ at: '2026-07-20', kg: 82 }, { at: '2026-07-25', kg: 81 }], NOW)).toBeNull()
  })

  it('ignora lo viejo (solo la ventana reciente)', () => {
    const viejas: WeightReading[] = [
      { at: '2024-06-08', kg: 90 }, { at: '2024-06-12', kg: 89 },
      { at: '2024-06-22', kg: 88 }, { at: '2024-06-27', kg: 87 },
    ]
    expect(weightSlopePerMonth(viejas, NOW)).toBeNull()
  })

  it('la oscilación diaria no se confunde con tendencia', () => {
    // ±0.5 kg alternando, sin deriva real.
    const zigzag: WeightReading[] = []
    for (let d = 40; d >= 0; d -= 2) {
      zigzag.push({
        at: new Date(NOW.getTime() - d * 86_400_000).toISOString().slice(0, 10),
        kg: 81.4 + (d % 4 === 0 ? 0.5 : -0.5),
      })
    }
    expect(Math.abs(weightSlopePerMonth(zigzag, NOW) ?? 99)).toBeLessThan(0.3)
  })
})

describe('assessWeightTrend — el caso real de Aaron', () => {
  it('81.4 kg bajando 0.7/mes con piso en 80 → riesgo antes del Mundial', () => {
    const t = assessWeightTrend(serie(82.1, -0.7), MAS_DE_80, NOW, 105) // ~105 días al 7-nov
    expect(t.edge).toBe('piso')
    expect(t.marginKg).toBeGreaterThan(0)
    expect(t.marginKg).toBeLessThan(2)
    expect(t.daysToEdge).toBeGreaterThan(0)
    expect(t.daysToEdge).toBeLessThan(105)
    expect(['vigilar', 'alto']).toContain(t.risk)
  })

  it('si el cruce cae DESPUÉS del evento no hay problema', () => {
    const t = assessWeightTrend(serie(84, -0.2), MAS_DE_80, NOW, 30)
    expect(t.risk).toBe('ninguno')
  })

  it('ya por debajo del piso → alto', () => {
    const t = assessWeightTrend(serie(80.2, -1.5), MAS_DE_80, NOW, 100)
    expect(t.risk).toBe('alto')
  })

  it('subiendo con categoría ABIERTA no hay borde que cruzar', () => {
    const t = assessWeightTrend(serie(81, 1.5), MAS_DE_80, NOW, 100)
    expect(t.edge).toBeNull()
    expect(t.risk).toBe('ninguno')
  })

  it('subiendo con categoría CERRADA sí vigila el techo', () => {
    const t = assessWeightTrend(serie(85, 1.5), { minKg: 80, maxKg: 87 }, NOW, 100)
    expect(t.edge).toBe('techo')
    expect(['vigilar', 'alto']).toContain(t.risk)
  })

  it('peso estable → sin riesgo', () => {
    expect(assessWeightTrend(serie(81.4, 0), MAS_DE_80, NOW, 100).risk).toBe('ninguno')
  })

  it('sin serie suficiente no inventa nada', () => {
    const t = assessWeightTrend([{ at: '2026-07-25', kg: 81.4 }], MAS_DE_80, NOW, 100)
    expect(t.risk).toBe('ninguno')
    expect(t.kgPerMonth).toBeNull()
  })
})

describe('renderWeightTrendLine', () => {
  it('da el ritmo, el margen, la fecha y nombra la tensión real', () => {
    const t = assessWeightTrend(serie(82.1, -0.7), MAS_DE_80, NOW, 105)
    const line = renderWeightTrendLine(t, MAS_DE_80, 81.4)!
    expect(line).toContain('bajando')
    expect(line).toContain('80 kg')
    expect(line).toMatch(/septiembre|octubre|agosto/)
    expect(line).toContain('antes del Mundial')
    expect(line).not.toContain('de el')
  })

  it('la categoría del goal NO se pone en duda: avisa, no propone cambiarse', () => {
    const t = assessWeightTrend(serie(82.1, -0.7), MAS_DE_80, NOW, 105)
    const line = renderWeightTrendLine(t, MAS_DE_80, 81.4)!
    expect(line).toContain('Frena la bajada')
    expect(line).toContain('recomponiendo')
    // Nada de sugerirle que compita en otra división.
    expect(line).not.toContain('categoría de al lado')
    expect(line.toLowerCase()).not.toContain('decide cuál')
  })

  it('si ya cruzó habla de RECUPERAR el peso, no de mudarse de categoría', () => {
    const t = assessWeightTrend(serie(80.1, -1.5), MAS_DE_80, NOW, 100)
    const line = renderWeightTrendLine(t, MAS_DE_80, 79.5)!
    expect(line).toContain('no das el peso de tu categoría')
    expect(line).toContain('recuperarlo')
  })

  it('concuerda con otros nombres de evento', () => {
    const t = assessWeightTrend(serie(82.1, -0.7), MAS_DE_80, NOW, 105)
    expect(renderWeightTrendLine(t, MAS_DE_80, 81.4, 'el Panamericano')).toContain('antes del Panamericano')
    expect(renderWeightTrendLine(t, MAS_DE_80, 81.4, 'Rotterdam')).toContain('antes de Rotterdam')
  })

  it('si ya cruzó, lo dice directo', () => {
    const t = assessWeightTrend(serie(80.1, -1.5), MAS_DE_80, NOW, 100)
    const line = renderWeightTrendLine(t, MAS_DE_80, 79.5)
    expect(line).toBeTruthy()
  })

  it('sin riesgo no dice nada', () => {
    const t = assessWeightTrend(serie(81.4, 0), MAS_DE_80, NOW, 100)
    expect(renderWeightTrendLine(t, MAS_DE_80, 81.4)).toBeNull()
  })
})

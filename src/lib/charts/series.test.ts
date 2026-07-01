// SIR V2 — Tests de la preparación de series temporales (Feature 3).
//
// buildLineSeries es geometría pura → determinística. Cubrimos los casos
// borde pedidos: data vacía, un solo punto, valores iguales (línea plana),
// orden cronológico, descarte de inválidos, y la escala de coordenadas.

import { describe, it, expect } from 'vitest'

import { buildLineSeries, aggregateByDay, rangeAxisEdges, rangeBounds } from './series'

const OPTS = { width: 100, height: 50, padding: 0 }

describe('buildLineSeries — casos borde', () => {
  it('serie vacía → geometría vacía', () => {
    const g = buildLineSeries([], OPTS)
    expect(g.points).toEqual([])
    expect(g.linePath).toBe('')
    expect(g.areaPath).toBe('')
    expect(g.delta).toBeNull()
    expect(g.first).toBeNull()
    expect(g.last).toBeNull()
  })

  it('un solo punto → x a la derecha, sin área, delta null', () => {
    const g = buildLineSeries([{ date: '2026-05-01', value: 7 }], OPTS)
    expect(g.points).toHaveLength(1)
    expect(g.points[0].x).toBe(100) // padding + innerW = 0 + 100
    expect(g.areaPath).toBe('')
    expect(g.linePath.startsWith('M')).toBe(true)
    expect(g.delta).toBeNull()
    expect(g.min).toBe(7)
    expect(g.max).toBe(7)
  })

  it('valores iguales → línea plana en el centro vertical', () => {
    const g = buildLineSeries(
      [
        { date: '2026-05-01', value: 5 },
        { date: '2026-05-02', value: 5 },
      ],
      OPTS,
    )
    // sin rango → norm 0.5 → y = floorY - 0.5*innerH = 50 - 25 = 25
    expect(g.points.every((p) => p.y === 25)).toBe(true)
    expect(g.delta).toBe(0)
  })
})

describe('buildLineSeries — escala y orden', () => {
  it('ordena cronológicamente aunque lleguen desordenados', () => {
    const g = buildLineSeries(
      [
        { date: '2026-05-03', value: 3 },
        { date: '2026-05-01', value: 1 },
        { date: '2026-05-02', value: 2 },
      ],
      OPTS,
    )
    expect(g.points.map((p) => p.value)).toEqual([1, 2, 3])
    expect(g.first!.value).toBe(1)
    expect(g.last!.value).toBe(3)
    expect(g.delta).toBe(1) // último vs anterior (3-2), no vs el primero
  })

  it('mapea min→piso y max→techo', () => {
    const g = buildLineSeries(
      [
        { date: '2026-05-01', value: 0 }, // min → y = floorY = 50
        { date: '2026-05-02', value: 10 }, // max → y = padding = 0
      ],
      OPTS,
    )
    expect(g.points[0].y).toBe(50)
    expect(g.points[1].y).toBe(0)
    // x: primero a la izquierda (0), último a la derecha (100)
    expect(g.points[0].x).toBe(0)
    expect(g.points[1].x).toBe(100)
  })

  it('descarta fechas inválidas y valores NaN', () => {
    const g = buildLineSeries(
      [
        { date: 'no-fecha', value: 5 },
        { date: '2026-13-99', value: 5 }, // mes/día inválidos
        { date: '2026-05-01', value: Number.NaN },
        { date: '2026-05-02', value: 4 },
        { date: '2026-05-03', value: 6 },
      ],
      OPTS,
    )
    expect(g.points).toHaveLength(2)
    expect(g.points.map((p) => p.value)).toEqual([4, 6])
  })

  it('área se cierra contra el piso cuando hay >=2 puntos', () => {
    const g = buildLineSeries(
      [
        { date: '2026-05-01', value: 2 },
        { date: '2026-05-02', value: 8 },
      ],
      OPTS,
    )
    expect(g.areaPath.startsWith('M')).toBe(true)
    expect(g.areaPath.endsWith('Z')).toBe(true)
  })
})

describe('aggregateByDay', () => {
  it('avg promedia lecturas del mismo día', () => {
    const out = aggregateByDay(
      [
        { date: '2026-05-01T08:00:00Z', value: 4 },
        { date: '2026-05-01T20:00:00Z', value: 6 },
        { date: '2026-05-02T10:00:00Z', value: 3 },
      ],
      'avg',
    )
    const d1 = out.find((p) => p.date === '2026-05-01')!
    expect(d1.value).toBe(5)
    expect(out.find((p) => p.date === '2026-05-02')!.value).toBe(3)
  })

  it('sum suma; last toma la última', () => {
    const pts = [
      { date: '2026-05-01T08:00:00Z', value: 10 },
      { date: '2026-05-01T20:00:00Z', value: 5 },
    ]
    expect(aggregateByDay(pts, 'sum')[0].value).toBe(15)
    expect(aggregateByDay(pts, 'last')[0].value).toBe(5)
  })

  it('ignora valores no finitos', () => {
    const out = aggregateByDay(
      [
        { date: '2026-05-01', value: Number.NaN },
        { date: '2026-05-01', value: 4 },
      ],
      'avg',
    )
    expect(out[0].value).toBe(4)
  })
})

describe('buildLineSeries — xDomain (ventana calendario)', () => {
  // Ventana lun-mié: 3 días de largo (0h a 48h del inicio). Con 2 puntos
  // en mar y mié, deben caer al 50% y ~100% del canvas — NO extremos.
  const lo = new Date(2026, 5, 29).getTime() // lun 29 jun
  const hi = new Date(2026, 6, 5, 23, 59, 59).getTime() // dom 5 jul (fin del día)
  const OPTS_XD = { width: 100, height: 50, padding: 0, xDomain: { lo, hi } }

  it('x se calcula por TIEMPO real dentro del xDomain, no por índice', () => {
    // Solo 2 puntos (mar 30 jun, mié 1 jul) en una semana lun 29 - dom 5.
    // Sin xDomain iban a x=0 y x=100 (extremos). Con xDomain caen al ~14% y ~29%.
    const g = buildLineSeries(
      [
        { date: '2026-06-30', value: 8.1 },
        { date: '2026-07-01', value: 6.2 },
      ],
      OPTS_XD,
    )
    expect(g.points).toHaveLength(2)
    // Semana de 6 días completos + 23:59:59 → cada día ≈ 100/6.999 ≈ 14.29%.
    // 30 jun = día 1 → x ≈ 14; 1 jul = día 2 → x ≈ 29.
    expect(g.points[0].x).toBeGreaterThan(10)
    expect(g.points[0].x).toBeLessThan(20)
    expect(g.points[1].x).toBeGreaterThan(25)
    expect(g.points[1].x).toBeLessThan(35)
    // NO llegan a los extremos: el resto de la semana queda visualmente vacío.
    expect(g.points[1].x).toBeLessThan(50)
  })

  it('sin xDomain sigue distribuyendo por índice (retrocompat)', () => {
    const g = buildLineSeries(
      [
        { date: '2026-06-30', value: 8.1 },
        { date: '2026-07-01', value: 6.2 },
      ],
      { width: 100, height: 50, padding: 0 },
    )
    // Comportamiento previo: 2 puntos → x=0 y x=100.
    expect(g.points[0].x).toBe(0)
    expect(g.points[1].x).toBe(100)
  })

  it('clampa fuera del dominio a [0, 100%]', () => {
    // Punto fuera del xDomain no debería explotar el rango.
    const g = buildLineSeries(
      [
        { date: '2026-06-15', value: 5 }, // MUY anterior a la semana
        { date: '2026-07-02', value: 6 },
      ],
      OPTS_XD,
    )
    // El primer punto se clampea a x=0; el segundo cae dentro.
    expect(g.points[0].x).toBe(0)
    expect(g.points[1].x).toBeGreaterThan(35)
  })
})

describe('rangeAxisEdges — bordes de la ventana calendario', () => {
  it('semana da lunes → domingo', () => {
    // Mié 1 jul 2026 → semana lun 29 jun - dom 5 jul
    const now = new Date(2026, 6, 1)
    const edges = rangeAxisEdges('semana', 0, now)
    expect(edges.leftDate).toBe('2026-06-29')
    expect(edges.rightDate).toBe('2026-07-05')
  })

  it('mes da día 1 → último día del mes', () => {
    const now = new Date(2026, 6, 1) // jul 2026
    const edges = rangeAxisEdges('mes', 0, now)
    expect(edges.leftDate).toBe('2026-07-01')
    expect(edges.rightDate).toBe('2026-07-31')
  })
})

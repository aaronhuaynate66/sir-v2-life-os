// SIR V2 — Tests de la preparación de series temporales (Feature 3).
//
// buildLineSeries es geometría pura → determinística. Cubrimos los casos
// borde pedidos: data vacía, un solo punto, valores iguales (línea plana),
// orden cronológico, descarte de inválidos, y la escala de coordenadas.

import { describe, it, expect } from 'vitest'

import { buildLineSeries, aggregateByDay } from './series'

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

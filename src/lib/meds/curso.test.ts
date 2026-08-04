import { describe, expect, it } from 'vitest'

import {
  dedupeRafagas, diaDelCurso, progresoDeItem, tomasDeHoy, tomasPorDia, VENTANA_RAFAGA_MS,
  type ItemCurso,
} from './curso'

const item = (o: Partial<ItemCurso> = {}): ItemCurso => ({
  id: 'it1', medName: 'Etoricoxib', dose: '120 mg',
  timesPerDay: null, everyHours: 24, durationDays: 7, indication: 'Tomar 01 cada 24 horas por 7 días.',
  ...o,
})

describe('tomasPorDia', () => {
  it('every_hours manda: 24h → 1, 8h → 3', () => {
    expect(tomasPorDia({ everyHours: 24, timesPerDay: null })).toBe(1)
    expect(tomasPorDia({ everyHours: 8, timesPerDay: null })).toBe(3)
    expect(tomasPorDia({ everyHours: 12, timesPerDay: null })).toBe(2)
  })
  it('cae a times_per_day si no hay horas', () => {
    expect(tomasPorDia({ everyHours: null, timesPerDay: 3 })).toBe(3)
  })
  it('sin pauta → null (no se inventa 1)', () => {
    expect(tomasPorDia({ everyHours: null, timesPerDay: null })).toBeNull()
  })
  it('every_hours gana sobre times_per_day si discrepan', () => {
    expect(tomasPorDia({ everyHours: 8, timesPerDay: 1 })).toBe(3)
  })
})

describe('diaDelCurso', () => {
  it('el primer día es 1, no 0', () => {
    expect(diaDelCurso('2026-08-03', '2026-08-03')).toBe(1)
    expect(diaDelCurso('2026-08-03', '2026-08-09')).toBe(7)
  })
  it('antes de empezar → null', () => {
    expect(diaDelCurso('2026-08-10', '2026-08-03')).toBeNull()
  })
  it('fecha basura → null', () => {
    expect(diaDelCurso('ayer', '2026-08-03')).toBeNull()
  })
})

describe('progresoDeItem — la receta REAL del 3-ago (etoricoxib 1 c/24h × 7 días)', () => {
  it('día 1 sin tomar: esperada 1, atrasada 1', () => {
    const p = progresoDeItem(item(), '2026-08-03', 0, '2026-08-03')
    expect(p.esperadas).toBe(7)
    expect(p.esperadasHoy).toBe(1)
    expect(p.tomadas).toBe(0)
    expect(p.atrasadas).toBe(1)
    expect(p.diaActual).toBe(1)
    expect(p.terminado).toBe(false)
  })

  it('día 5 con 5 tomadas: al día', () => {
    const p = progresoDeItem(item(), '2026-08-03', 5, '2026-08-07')
    expect(p.esperadasHoy).toBe(5)
    expect(p.atrasadas).toBe(0)
  })

  it('pasado el curso NO sigue acumulando deuda', () => {
    // Día 20 de un curso de 7: lo esperado se topea en 7, no en 20.
    const p = progresoDeItem(item(), '2026-08-03', 7, '2026-08-22')
    expect(p.esperadasHoy).toBe(7)
    expect(p.atrasadas).toBe(0)
    expect(p.terminado).toBe(true)
  })

  it('tomar de más no da negativo', () => {
    const p = progresoDeItem(item(), '2026-08-03', 9, '2026-08-04')
    expect(p.atrasadas).toBe(0)
  })

  it('crónico sin duración: esperadas null, pero el atraso del día SÍ se calcula', () => {
    // Topiramato 100 mg, 1 cada 24 h, indefinido.
    const p = progresoDeItem(
      item({ medName: 'Topiramato', dose: '100 mg', durationDays: null }),
      '2026-07-10', 20, '2026-08-03',
    )
    expect(p.esperadas).toBeNull()
    expect(p.diaActual).toBe(25)
    expect(p.esperadasHoy).toBe(25)
    expect(p.atrasadas).toBe(5)
    expect(p.terminado).toBe(false)
  })

  it('sin pauta no inventa nada', () => {
    const p = progresoDeItem(item({ everyHours: null, timesPerDay: null }), '2026-08-03', 2, '2026-08-05')
    expect(p.esperadas).toBeNull()
    expect(p.esperadasHoy).toBeNull()
    expect(p.atrasadas).toBeNull()
  })
})

describe('tomasDeHoy — día de Lima, no UTC', () => {
  it('las 22:00 de Lima son del MISMO día aunque en UTC ya sea el siguiente', () => {
    // 2026-08-04T03:00Z = 22:00 del 3-ago en Lima.
    expect(tomasDeHoy(['2026-08-04T03:00:00Z'], '2026-08-03')).toBe(1)
  })
  it('las 00:30 de Lima no cuentan para el día anterior', () => {
    // 2026-08-04T05:30Z = 00:30 del 4-ago en Lima.
    expect(tomasDeHoy(['2026-08-04T05:30:00Z'], '2026-08-03')).toBe(0)
  })
  it('ignora basura', () => {
    expect(tomasDeHoy(['no es fecha', ''], '2026-08-03')).toBe(0)
  })
})

// El dato real: 35 filas en med_intakes eran ~15 tomas. Ráfagas de doble tap.
describe('dedupeRafagas', () => {
  it('colapsa la ráfaga real del 12-jul (4 registros en 4 segundos)', () => {
    const r = dedupeRafagas([
      { name: 'Ergonex', takenAt: '2026-07-12T19:50:49Z' },
      { name: 'Ergonex', takenAt: '2026-07-12T19:50:51Z' },
      { name: 'Ergonex', takenAt: '2026-07-12T19:50:52Z' },
      { name: 'Ergonex', takenAt: '2026-07-12T19:50:53Z' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].takenAt).toBe('2026-07-12T19:50:49Z')
  })

  it('dos tomas legítimas separadas por horas NO se colapsan', () => {
    const r = dedupeRafagas([
      { name: 'Ergonex', takenAt: '2026-07-12T08:00:00Z' },
      { name: 'Ergonex', takenAt: '2026-07-12T20:00:00Z' },
    ])
    expect(r).toHaveLength(2)
  })

  it('medicamentos DISTINTOS en el mismo segundo son dos tomas, no una', () => {
    // La receta del 3-ago: los dos se toman juntos.
    const r = dedupeRafagas([
      { name: 'Orfenadrina', takenAt: '2026-08-03T23:00:00Z' },
      { name: 'Etoricoxib', takenAt: '2026-08-03T23:00:01Z' },
    ])
    expect(r).toHaveLength(2)
  })

  it('el borde de la ventana: a 59 s colapsa, a 61 s no', () => {
    const base = Date.parse('2026-08-03T12:00:00Z')
    const iso = (ms: number) => new Date(ms).toISOString()
    expect(dedupeRafagas([
      { name: 'X', takenAt: iso(base) },
      { name: 'X', takenAt: iso(base + 59_000) },
    ])).toHaveLength(1)
    expect(dedupeRafagas([
      { name: 'X', takenAt: iso(base) },
      { name: 'X', takenAt: iso(base + 61_000) },
    ])).toHaveLength(2)
  })

  it('ordena por tiempo aunque entren desordenadas, y descarta basura', () => {
    const r = dedupeRafagas([
      { name: 'X', takenAt: '2026-08-03T20:00:00Z' },
      { name: 'X', takenAt: '2026-08-03T08:00:00Z' },
      { name: '', takenAt: '2026-08-03T09:00:00Z' },
      { name: 'X', takenAt: 'basura' },
    ])
    expect(r.map((x) => x.takenAt)).toEqual(['2026-08-03T08:00:00Z', '2026-08-03T20:00:00Z'])
  })

  it('la ventana está declarada en 60 s', () => {
    expect(VENTANA_RAFAGA_MS).toBe(60_000)
  })
})

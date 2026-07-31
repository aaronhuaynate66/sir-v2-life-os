// SIR V2 — Tests de cumpleaños desde las dos fuentes.
//
// Aaron, 31-jul-2026: "hoy es cumpleaños de Alex y SIR brilló por su ausencia, pero
// POR QUÉ???". Porque estaba en `special_dates` y el brief mira `birth_date`, y el
// otro camino descartaba las etiquetas con "cumple" creyendo que este las tomaba.
// Medido: 129 personas, 3 con birth_date, 21 cumpleaños invisibles.
import { describe, it, expect } from 'vitest'
import {
  cumpleanosProximos, diasHastaProximoAniversario, esEtiquetaDeCumple,
  esHitoDeAnticipacion, type PersonaConFechas,
} from './cumpleanos'

const HOY = '2026-07-31'
const VENTANA = 14

function p(name: string, o: Partial<PersonaConFechas> = {}): PersonaConFechas {
  return { name, birth_date: o.birth_date ?? null, fechas: o.fechas ?? [], importance: o.importance ?? 5 }
}
const cumple = (date: string) => ({ date, label: 'Cumpleaños', recurring: true })

describe('cumpleanosProximos — el caso REAL del 31-jul', () => {
  it('ve el cumple que vive SOLO en special_dates (Alex Heilbrunn, hoy)', () => {
    const r = cumpleanosProximos([p('Alex Heilbrunn', { fechas: [cumple('2000-07-31')], importance: 9 })], HOY, VENTANA)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ name: 'Alex Heilbrunn', days: 0, fuente: 'special_dates' })
  })

  it('con DOS cumpleaños el mismo día, primero el de más importancia', () => {
    // Pasó de verdad: Alex (9) y Walter (7) Heilbrunn, los dos el 31-jul.
    const r = cumpleanosProximos([
      p('Walter Heilbrunn', { fechas: [cumple('2000-07-31')], importance: 7 }),
      p('Alex Heilbrunn', { fechas: [cumple('2000-07-31')], importance: 9 }),
    ], HOY, VENTANA)
    expect(r.map((x) => x.name)).toEqual(['Alex Heilbrunn', 'Walter Heilbrunn'])
  })

  it('sigue viendo los de birth_date (no rompe lo que ya funcionaba)', () => {
    const r = cumpleanosProximos([p('Diana', { birth_date: '1998-08-05' })], HOY, VENTANA)
    expect(r[0]).toMatchObject({ name: 'Diana', days: 5, fuente: 'birth_date' })
  })

  it('ignora el AÑO: un cumple de 2000 cuenta para 2026', () => {
    expect(diasHastaProximoAniversario('2000-07-31', HOY)).toBe(0)
    expect(diasHastaProximoAniversario('1993-08-02', HOY)).toBe(2)
  })

  it('si ya pasó este año, cuenta para el que viene (no lo pierde)', () => {
    // 14-jun ya pasó → faltan ~318 días, fuera de ventana pero NO null.
    expect(diasHastaProximoAniversario('1998-06-14', HOY)).toBeGreaterThan(300)
  })
})

describe('cumpleanosProximos — dedupe y bordes', () => {
  it('una persona con el cumple en LAS DOS fuentes sale UNA vez, y gana birth_date', () => {
    const r = cumpleanosProximos([
      p('Alex', { birth_date: '2000-07-31', fechas: [cumple('2000-07-31')] }),
    ], HOY, VENTANA)
    expect(r).toHaveLength(1)
    expect(r[0].fuente).toBe('birth_date')
  })

  it('varias filas de cumple en special_dates (pasa de verdad) colapsan a una', () => {
    // Analia Cabrera y Adrian Prochazka tienen 2-3 filas cada uno en su data real.
    const r = cumpleanosProximos([
      p('Analia Cabrera', { fechas: [cumple('2021-08-04'), cumple('2021-08-04')] }),
    ], HOY, VENTANA)
    expect(r).toHaveLength(1)
  })

  it('fuera de la ventana no entra', () => {
    expect(cumpleanosProximos([p('X', { fechas: [cumple('2000-09-30')] })], HOY, VENTANA)).toHaveLength(0)
  })

  it('ignora fechas especiales que NO son cumpleaños', () => {
    const r = cumpleanosProximos([
      p('Laura', { fechas: [{ date: '2020-08-01', label: 'Extracción muela de juicio' }] }),
    ], HOY, VENTANA)
    expect(r).toHaveLength(0)
  })

  it('reconoce las etiquetas reales, y solo esas', () => {
    expect(esEtiquetaDeCumple('Cumpleaños')).toBe(true)
    expect(esEtiquetaDeCumple('Cumpleaños de Victor Rodriguez')).toBe(true)
    expect(esEtiquetaDeCumple('natalicio')).toBe(true)
    expect(esEtiquetaDeCumple('Aniversario Aaron y Diana')).toBe(false)
    expect(esEtiquetaDeCumple(null)).toBe(false)
  })

  it('29-feb en año no bisiesto cae al 1-mar en vez de perderse', () => {
    expect(diasHastaProximoAniversario('2000-02-29', '2026-03-01')).toBe(0)
  })

  it('no revienta con basura', () => {
    expect(cumpleanosProximos([], HOY, VENTANA)).toEqual([])
    expect(cumpleanosProximos(null as unknown as PersonaConFechas[], HOY, VENTANA)).toEqual([])
    expect(diasHastaProximoAniversario('no-es-fecha', HOY)).toBeNull()
    expect(diasHastaProximoAniversario(null, HOY)).toBeNull()
  })
})

describe('esHitoDeAnticipacion — anticipar sin volverse ruido', () => {
  it('avisa con 10 días: es el que permite planear algo', () => {
    // La ventana era de 2 días. Su aniversario del 13-ago se avisaba el 11.
    expect(esHitoDeAnticipacion(10)).toBe(true)
  })
  it('avisa a la semana, a 3 días, y después todos los días', () => {
    for (const d of [7, 3, 2, 1, 0]) expect(esHitoDeAnticipacion(d)).toBe(true)
  })
  it('NO avisa los días intermedios: 4 avisos espaciados, no 10 seguidos', () => {
    for (const d of [9, 8, 6, 5, 4]) expect(esHitoDeAnticipacion(d)).toBe(false)
  })
  it('fuera del rango tampoco', () => {
    expect(esHitoDeAnticipacion(11)).toBe(false)
    expect(esHitoDeAnticipacion(30)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  parseExerciseLine, parseExercises, exerciseVolume, sessionVolume,
  topSet, progressionFor, normalizeExerciseName,
} from './ejercicios'

describe('parseExerciseLine — cómo se dicta de verdad', () => {
  it('"banca 3x12 con 80"', () => {
    const r = parseExerciseLine('banca 3x12 con 80')!
    expect(r.name).toBe('banca')
    expect(r.sets).toEqual([{ reps: 12, kg: 80 }, { reps: 12, kg: 80 }, { reps: 12, kg: 80 }])
  })

  it('"press banca 3x12x80" (todo pegado)', () => {
    const r = parseExerciseLine('press banca 3x12x80')!
    expect(r.nameKey).toBe('press banca')
    expect(r.sets).toHaveLength(3)
    expect(r.sets[0].reps).toBe(12)
  })

  it('"sentadilla 4x8 100kg"', () => {
    const r = parseExerciseLine('sentadilla 4x8 100kg')!
    expect(r.sets).toEqual(Array.from({ length: 4 }, () => ({ reps: 8, kg: 100 })))
  })

  it('"peso muerto 5x5 @120"', () => {
    const r = parseExerciseLine('peso muerto 5x5 @120')!
    expect(r.nameKey).toBe('peso muerto')
    expect(topSet(r)).toEqual({ reps: 5, kg: 120 })
  })

  it('"curl 3 series de 10 con 20"', () => {
    const r = parseExerciseLine('curl 3 series de 10 con 20')!
    expect(r.sets).toHaveLength(3)
    expect(r.sets[0]).toEqual({ reps: 10, kg: 20 })
  })

  it('lista de reps que bajan: "remo 12,10,8 con 60"', () => {
    const r = parseExerciseLine('remo 12,10,8 con 60')!
    expect(r.sets.map((s) => s.reps)).toEqual([12, 10, 8])
    expect(r.sets.every((s) => s.kg === 60)).toBe(true)
  })

  it('convierte libras a kg', () => {
    const r = parseExerciseLine('banca 3x10 con 100 lb')!
    expect(r.unit).toBe('lb')
    expect(r.sets[0].kg).toBeCloseTo(45.4, 1)
  })

  it('peso corporal: dominadas sin carga', () => {
    const r = parseExerciseLine('dominadas 4x8')!
    expect(r.bodyweight).toBe(true)
    expect(r.sets[0].kg).toBeNull()
  })

  it('null cuando no hay series (no inventa una fila)', () => {
    for (const t of ['fui al gym', 'entrené fuerte', '', 'banca pesada']) {
      expect(parseExerciseLine(t), t).toBeNull()
    }
  })

  it('descarta una carga absurda antes que guardarla', () => {
    // 900 kg en banca es un número mal leído, no un dato.
    const r = parseExerciseLine('banca 3x10 con 900')!
    expect(r.sets.every((s) => s.kg === null)).toBe(true)
  })

  it('descarta series/reps fuera de rango', () => {
    expect(parseExerciseLine('banca 99x999 con 80')).toBeNull()
  })
})

describe('parseExercises — varios en un mensaje', () => {
  it('corta por saltos de línea', () => {
    const r = parseExercises('banca 3x12 con 80\nsentadilla 4x8 con 100\ndominadas 3x10')
    expect(r.map((e) => e.nameKey)).toEqual(['banca', 'sentadilla', 'dominadas'])
  })

  it('corta por " y " y por coma ENTRE ejercicios', () => {
    const r = parseExercises('banca 3x12 con 80 y sentadilla 4x8 con 100')
    expect(r).toHaveLength(2)
  })

  it('NO corta la coma de una lista de reps', () => {
    // "12,10,8" es un solo ejercicio, no tres.
    const r = parseExercises('remo 12,10,8 con 60')
    expect(r).toHaveLength(1)
    expect(r[0].sets).toHaveLength(3)
  })

  it('ignora la prosa que no es un ejercicio', () => {
    const r = parseExercises('hoy entrené fuerte en el gym\nbanca 3x12 con 80\nme sentí bien')
    expect(r).toHaveLength(1)
    expect(r[0].nameKey).toBe('banca')
  })

  it('dedup por ejercicio', () => {
    expect(parseExercises('banca 3x12 con 80\nbanca 3x10 con 85')).toHaveLength(1)
  })

  it('mensaje sin ejercicios → []', () => {
    expect(parseExercises('fui al gym una hora')).toEqual([])
  })
})

describe('volumen', () => {
  it('suma reps × kg', () => {
    expect(exerciseVolume({ sets: [{ reps: 10, kg: 80 }, { reps: 8, kg: 80 }] })).toBe(1440)
  })
  it('peso corporal no tiene volumen en kg', () => {
    expect(exerciseVolume({ sets: [{ reps: 10, kg: null }] })).toBeNull()
  })
  it('la sesión suma solo lo que tiene carga', () => {
    expect(sessionVolume([
      { sets: [{ reps: 10, kg: 80 }] },
      { sets: [{ reps: 10, kg: null }] },
    ])).toBe(800)
  })
})

describe('topSet', () => {
  it('el set más pesado; a igual peso, el de más reps', () => {
    expect(topSet({ sets: [{ reps: 5, kg: 100 }, { reps: 8, kg: 100 }, { reps: 12, kg: 80 }] }))
      .toEqual({ reps: 8, kg: 100 })
  })
  it('null si todo es peso corporal', () => {
    expect(topSet({ sets: [{ reps: 10, kg: null }] })).toBeNull()
  })
})

describe('progressionFor', () => {
  const p = (date: string, kg: number) => ({ date, sets: [{ reps: 8, kg }] })

  it('con menos de 3 sesiones DICE que no sabe (no adivina tendencia)', () => {
    const r = progressionFor('banca', [p('2026-07-01', 80), p('2026-07-08', 90)])
    expect(r.trend).toBe('sin_datos')
    expect(r.message).toMatch(/necesito al menos 3/)
  })

  it('detecta que sube', () => {
    const r = progressionFor('banca', [p('2026-07-01', 80), p('2026-07-08', 82.5), p('2026-07-15', 87.5), p('2026-07-22', 90)])
    expect(r.trend).toBe('subiendo')
    expect(r.message).toMatch(/el músculo que la categoría te pide/)
  })

  it('detecta estancamiento — y lo conecta con recomponer', () => {
    const r = progressionFor('banca', [p('2026-07-01', 80), p('2026-07-08', 80), p('2026-07-15', 81)])
    expect(r.trend).toBe('estancado')
    expect(r.message).toMatch(/la carga tiene que subir/)
  })

  it('detecta que baja, y por qué importa con el peso al piso', () => {
    const r = progressionFor('banca', [p('2026-07-01', 95), p('2026-07-08', 92), p('2026-07-15', 85), p('2026-07-22', 82)])
    expect(r.trend).toBe('bajando')
    expect(r.message).toMatch(/perder fuerza/)
  })

  it('media chapa de diferencia NO es tendencia', () => {
    // 2 kg < el disco más chico (2.5 por lado): ruido de barra.
    const r = progressionFor('banca', [p('2026-07-01', 80), p('2026-07-08', 80), p('2026-07-15', 82)])
    expect(r.trend).toBe('estancado')
  })

  it('ignora las sesiones a peso corporal', () => {
    const r = progressionFor('dominadas', [
      { date: '2026-07-01', sets: [{ reps: 8, kg: null }] },
      { date: '2026-07-08', sets: [{ reps: 9, kg: null }] },
      { date: '2026-07-15', sets: [{ reps: 10, kg: null }] },
    ])
    expect(r.trend).toBe('sin_datos')
  })
})

describe('normalizeExerciseName', () => {
  it('agrupa el mismo ejercicio escrito distinto', () => {
    expect(normalizeExerciseName('Press Banca')).toBe(normalizeExerciseName('press banca'))
    expect(normalizeExerciseName('Sentadilla')).toBe('sentadilla')
    expect(normalizeExerciseName('  Peso   Muerto  ')).toBe('peso muerto')
  })
})

// REGRESIÓN: "3 series DE 10" usa "de" para las REPS. Leerlo como carga hacía que
// "curl 3 series de 10 con 20" guardara 10 kg en vez de 20 — un dato falso que
// después envenena la progresión sin que nadie se entere.
describe('la carga se lee por prioridad, no por el primer número', () => {
  it('"con N" gana sobre el "de N" de las series', () => {
    expect(parseExerciseLine('curl 3 series de 10 con 20')!.sets[0]).toEqual({ reps: 10, kg: 20 })
    expect(parseExerciseLine('press 4 series de 8 con 60')!.sets[0]).toEqual({ reps: 8, kg: 60 })
  })
  it('la unidad explícita también gana', () => {
    expect(parseExerciseLine('curl 3 series de 12 20kg')!.sets[0].kg).toBe(20)
  })
  it('sin marcador de carga, no inventa peso', () => {
    expect(parseExerciseLine('curl 3 series de 12')!.sets[0].kg).toBeNull()
  })
  it('"de N" solo se usa cuando NO hay "series"', () => {
    expect(parseExerciseLine('banca 3x10 de 85')!.sets[0].kg).toBe(85)
  })
})

// REGRESIÓN de dos bugs que solo aparecieron probando con frases reales.
describe('frases dictadas de verdad', () => {
  it('corta por coma aunque antes venga un NÚMERO', () => {
    // "…con 90, sentadilla…" fusionaba los dos ejercicios en uno y PERDÍA los
    // 120 kg del segundo, porque el corte exigía una letra antes de la coma.
    const r = parseExercises('press banca 4x8 con 90, sentadilla 5x5 con 120 y dominadas 4x10')
    expect(r.map((e) => e.nameKey)).toEqual(['press banca', 'sentadilla', 'dominadas'])
    expect(topSet(r[1])).toEqual({ reps: 5, kg: 120 })
    expect(r[2].bodyweight).toBe(true)
  })

  it('la prosa de arranque no queda como nombre del ejercicio', () => {
    // Antes: "hoy pesas: banca". Ahora corta en ':' y limpia el ruido.
    const r = parseExercises('hoy hice pesas: banca 3x10 con 85\nremo 12,10,8 con 60\npeso muerto 5x5 @130')
    expect(r.map((e) => e.nameKey)).toEqual(['banca', 'remo', 'peso muerto'])
    expect(sessionVolume(r)).toBe(7600)
  })

  it('la lista de reps sigue sin cortarse (la coma va seguida de dígito)', () => {
    expect(parseExercises('remo 12,10,8 con 60')[0].sets).toHaveLength(3)
  })

  it('el nombre no arrastra puntuación', () => {
    expect(parseExercises('banca, 3x10 con 85')[0].name).toBe('banca')
  })
})

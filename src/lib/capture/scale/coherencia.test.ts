// SIR V2 — Tests de coherencia física de la captura de báscula.
//
// Los números son los REALES de la base de Aaron: peso ~81.6 kg, masa libre de
// grasa ~61 kg, músculo esquelético ~33 kg. 46 filas venían invertidas con
// `confidence: "high"`, y `askSir` reportaba su masa magra como 33 o 61 kg según
// el día que se preguntara.
import { describe, it, expect } from 'vitest'
import { corregirMusculos, corregirConPeso, RANGO_TOTAL, RANGO_ESQUELETICO, type Musculos } from './coherencia'

describe('el caso real: venían invertidos', () => {
  it('corrige 33/61 → 61/33', () => {
    const r = corregirMusculos({ muscle_mass_kg: 33.1, skeletal_muscle_mass_kg: 61.6 })
    expect(r.metrics.muscle_mass_kg).toBe(61.6)
    expect(r.metrics.skeletal_muscle_mass_kg).toBe(33.1)
    expect(r.correcciones).toHaveLength(1)
    expect(r.correcciones[0]).toContain('invertidos')
  })

  it('lo que ya está bien no se toca', () => {
    const ok = { muscle_mass_kg: 61.0, skeletal_muscle_mass_kg: 33.4 }
    const r = corregirMusculos(ok)
    expect(r.metrics).toEqual(ok)
    expect(r.correcciones).toEqual([])
  })

  it('no muta la entrada', () => {
    const entrada = { muscle_mass_kg: 33.1, skeletal_muscle_mass_kg: 61.6 }
    corregirMusculos(entrada)
    expect(entrada.muscle_mass_kg).toBe(33.1)
  })
})

describe('por qué la invariante es segura', () => {
  it('iguales no es inversión: no se toca', () => {
    // Solo actúa si el esquelético es MAYOR. Iguales es raro pero no imposible
    // (una báscula que reporta lo mismo en los dos campos), y moverlos no ayuda.
    const r = corregirMusculos({ muscle_mass_kg: 50, skeletal_muscle_mass_kg: 50 })
    expect(r.correcciones).toEqual([])
  })

  it('con un solo valor no se puede decidir sin el peso', () => {
    expect(corregirMusculos({ muscle_mass_kg: 33.1 }).correcciones).toEqual([])
    expect(corregirMusculos({ skeletal_muscle_mass_kg: 61.6 }).correcciones).toEqual([])
  })
})

describe('el peso como árbitro, para valores sueltos', () => {
  const PESO = 81.6

  it('33 kg sobre 81.6 es esquelético, aunque venga como total', () => {
    const r = corregirConPeso<Musculos>({ muscle_mass_kg: 33.1 }, PESO)
    expect(r.metrics.skeletal_muscle_mass_kg).toBe(33.1)
    expect(r.metrics.muscle_mass_kg).toBeNull()
    expect(r.correcciones[0]).toContain('esquelético, no total')
  })

  it('61 kg sobre 81.6 es total, aunque venga como esquelético', () => {
    const r = corregirConPeso<Musculos>({ skeletal_muscle_mass_kg: 61.0 }, PESO)
    expect(r.metrics.muscle_mass_kg).toBe(61.0)
    expect(r.metrics.skeletal_muscle_mass_kg).toBeNull()
    expect(r.correcciones[0]).toContain('total, no esquelético')
  })

  it('los rangos NO se solapan: por eso la decisión es limpia', () => {
    expect(RANGO_ESQUELETICO[1]).toBeLessThan(RANGO_TOTAL[0])
  })

  it('un valor que no cae claro en ninguno se DEJA como vino', () => {
    // 47 kg sobre 81.6 = 0.58: fuera del esquelético (≤0.55) y fuera del total
    // (≥0.60). Preferimos un dato dudoso a uno movido por adivinanza.
    const r = corregirConPeso({ muscle_mass_kg: 47 }, PESO)
    expect(r.metrics.muscle_mass_kg).toBe(47)
    expect(r.correcciones).toEqual([])
  })

  it('sin peso se cae al chequeo de inversión, que igual funciona', () => {
    const r = corregirConPeso({ muscle_mass_kg: 33.1, skeletal_muscle_mass_kg: 61.6 }, null)
    expect(r.metrics.muscle_mass_kg).toBe(61.6)
  })

  it('los dos presentes y correctos: no toca nada aunque haya peso', () => {
    const r = corregirConPeso({ muscle_mass_kg: 61.0, skeletal_muscle_mass_kg: 33.4 }, PESO)
    expect(r.correcciones).toEqual([])
  })
})

describe('no revienta', () => {
  it('con nulls, strings y basura', () => {
    expect(corregirMusculos({}).correcciones).toEqual([])
    expect(corregirMusculos({ muscle_mass_kg: null, skeletal_muscle_mass_kg: null }).correcciones).toEqual([])
    expect(corregirMusculos(null as unknown as Record<string, never>).correcciones).toEqual([])
    // Un 0 o un negativo no son medidas: se ignoran.
    expect(corregirMusculos({ muscle_mass_kg: 0, skeletal_muscle_mass_kg: 33 }).correcciones).toEqual([])
    expect(corregirConPeso({ muscle_mass_kg: 33.1 }, 0).correcciones).toEqual([])
  })
})

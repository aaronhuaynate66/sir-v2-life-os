// SIR V2 — Tests de la unidad canónica.
//
// Medido en la base el 1-ago-2026: `heart_rate` tenía la misma cantidad escrita de
// tres formas (`lpm` 33 filas, `bpm` 6, `ppm` 10) porque cada importador declaraba
// su propia unidad. Y `respiratory_rate` tenía una fila en `ppm`, copiada del pulso.
import { describe, it, expect } from 'vitest'
import { UNIDAD_CANONICA, unidadDe, unidadDivergente } from './unidades'

describe('el caso que lo motivó', () => {
  it('las tres formas del pulso colapsan en una', () => {
    expect(unidadDe('heart_rate', 'lpm')).toBe('ppm')
    expect(unidadDe('heart_rate', 'bpm')).toBe('ppm')
    expect(unidadDe('heart_rate', 'ppm')).toBe('ppm')
  })

  it('la canónica GANA sobre lo que manda el importador', () => {
    // El punto entero del módulo: el caller no puede sobreescribirla.
    expect(unidadDe('bmi', '')).toBe('kg/m2')
    expect(unidadDe('metabolic_rate_kcal', 'kcal')).toBe('kcal/d')
    expect(unidadDe('body_score', 'pts')).toBe('puntos')
  })

  it('detecta la divergencia para poder loguearla', () => {
    expect(unidadDivergente('heart_rate', 'lpm')).toBe(true)
    expect(unidadDivergente('heart_rate', 'ppm')).toBe(false)
    // Vacío no es divergencia: es que el importador no la manda.
    expect(unidadDivergente('heart_rate', '')).toBe(false)
    expect(unidadDivergente('heart_rate', null)).toBe(false)
  })
})

describe('en castellano, que es lo que Aaron lee', () => {
  it('el pulso va en ppm, no en bpm', () => {
    for (const t of ['heart_rate', 'heart_rate_min', 'heart_rate_max', 'sleeping_heart_rate']) {
      expect(UNIDAD_CANONICA[t]).toBe('ppm')
    }
  })

  it('nada de unidades en inglés en el mapa', () => {
    const inglesas = ['bpm', 'lbs', 'pts', 'steps', 'times']
    for (const u of Object.values(UNIDAD_CANONICA)) {
      expect(inglesas, `unidad en inglés: ${u}`).not.toContain(u)
    }
  })
})

describe('una métrica nueva no se queda sin unidad', () => {
  it('lo desconocido pasa tal cual en vez de inventarse', () => {
    expect(unidadDe('metrica_que_no_existe', 'furlongs')).toBe('furlongs')
    expect(unidadDe('metrica_que_no_existe')).toBe('')
  })

  it('y no se reporta como divergente: no hay con qué comparar', () => {
    expect(unidadDivergente('metrica_que_no_existe', 'furlongs')).toBe(false)
  })
})

describe('coherencia interna del mapa', () => {
  it('ninguna unidad vacía: si está en el mapa, tiene unidad', () => {
    for (const [t, u] of Object.entries(UNIDAD_CANONICA)) {
      expect(u.trim(), `${t} sin unidad`).not.toBe('')
    }
  })

  it('las métricas que terminan en _kg van en kg y las _percent en %', () => {
    for (const [t, u] of Object.entries(UNIDAD_CANONICA)) {
      if (t.endsWith('_kg')) expect(u, t).toBe('kg')
      if (t.endsWith('_percent')) expect(u, t).toBe('%')
    }
  })

  it('no revienta con basura', () => {
    expect(unidadDe('', null)).toBe('')
    expect(unidadDe(null as unknown as string, 'x')).toBe('x')
  })
})

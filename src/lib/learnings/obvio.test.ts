// SIR V2 — Tests del filtro de obviedades.
//
// Los casos POSITIVOS son literalmente las 5 filas que había en producción el
// 6-ago-2026; los NEGATIVOS son la sexta (la que sí enseña algo) más lecciones
// reales del dominio de Aaron. El test que más importa es el segundo bloque: un
// filtro que se come una lección de verdad es peor que dejar pasar una obviedad,
// porque la lección perdida no deja rastro.
import { describe, expect, it } from 'vitest'

import { esAprendizajeObvio, motivoDeObviedad } from './obvio'

describe('descarta lo que el sistema ya afirma solo', () => {
  // Las 5 obviedades reales que estaban ocupando lugar en cada prompt.
  const medidas = [
    'Aaron es peruano, no argentino',
    'Aaron prefiere comunicarse en español peruano',
    'Aaron tiene una pareja llamada Diana',
  ]
  for (const t of medidas) {
    it(`descarta: "${t}"`, () => {
      expect(esAprendizajeObvio(t)).toBe(true)
      expect(motivoDeObviedad(t)).toBeTruthy()
    })
  }

  it('el motivo dice DE DÓNDE sale la afirmación, para poder auditarlo', () => {
    expect(motivoDeObviedad('Aaron es peruano, no argentino')).toContain('prompt')
    expect(motivoDeObviedad('Aaron tiene una pareja llamada Diana')).toContain('people')
  })

  it('no le importan las tildes ni las mayúsculas', () => {
    expect(esAprendizajeObvio('AARON ES PERUANO, NO ARGENTINO')).toBe(true)
    expect(esAprendizajeObvio('Aaron prefiere comunicarse en espanol peruano')).toBe(true)
  })

  it('descarta el texto vacío o en blanco', () => {
    expect(esAprendizajeObvio('')).toBe(true)
    expect(esAprendizajeObvio('   ')).toBe(true)
  })
})

describe('NO se come las lecciones de verdad', () => {
  // La sexta fila real + lecciones que sí cambiarían una respuesta.
  const reales = [
    'Chequeo preventivo anual (Sanna/Pacífico, 03/07/2026): resultado general NORMAL',
    'Entrena taekwondo y apunta al Mundial de Bomberos en Al Khobar',
    'Prefiere que le propongan la acción en vez de que se la ejecuten sin avisar',
    'Posterga las tareas administrativas hasta que tienen fecha',
    'Le molesta que le muestren problemas sin una salida concreta',
    'Toma la medicación de la noche, no de la mañana',
    'Su hemoglobina viene bajando tres exámenes seguidos',
    'Trabaja en Marlab y en K2 / Grupo HNG',
    'Diana y Aaron cumplen aniversario el 13 de cada mes',
    'Cuando pide ordenar, quiere orden y no análisis de producto',
  ]
  for (const t of reales) {
    it(`deja pasar: "${t.slice(0, 52)}…"`, () => {
      expect(esAprendizajeObvio(t)).toBe(false)
      expect(motivoDeObviedad(t)).toBeNull()
    })
  }

  it('nombrar a Diana no basta para descartar: lo que se descarta es DECLARAR el vínculo', () => {
    // El vínculo ya está en `people`; una lección sobre ella que aporte, pasa.
    expect(esAprendizajeObvio('Aaron tiene una pareja llamada Diana')).toBe(true)
    expect(esAprendizajeObvio('Con Diana los conflictos se destraban hablando el mismo día')).toBe(false)
  })

  it('hablar de un idioma que NO es el suyo no es una obviedad', () => {
    expect(esAprendizajeObvio('Practica inglés técnico para las licitaciones mineras')).toBe(false)
  })
})

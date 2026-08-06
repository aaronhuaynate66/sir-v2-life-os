import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { SECCIONES, ordenDeMontaje, sinUbicar } from './secciones'

describe('el orden de /salud', () => {
  it('lo médico va PRIMERO — el examen del IPD y tres recetas activas mandan', () => {
    expect(SECCIONES[0].clave).toBe('medico')
    expect(SECCIONES[0].abiertaPorDefecto).toBe(true)
  })

  it('las ocho de sueño quedan en UNA sección, que era el muro', () => {
    const s = SECCIONES.find((x) => x.clave === 'suenoEnergia')!
    expect(s.componentes).toHaveLength(8)
    expect(s.abiertaPorDefecto).toBe(false)
  })

  it('lo exploratorio no compite por el primer scroll, pero no se borra', () => {
    const s = SECCIONES.find((x) => x.clave === 'exploratorio')!
    expect(s.abiertaPorDefecto).toBe(false)
    expect(s.componentes.length).toBeGreaterThan(0) // él pidió agrupar, no borrar
  })

  it('ninguna tarjeta aparece en dos secciones', () => {
    const todos = ordenDeMontaje()
    expect(new Set(todos).size).toBe(todos.length)
  })

  it('cada sección dice qué responde — un acordeón sin subtítulo es una caja ciega', () => {
    for (const s of SECCIONES) expect(s.subtitulo.length, s.clave).toBeGreaterThan(15)
  })
})

describe('sinUbicar — el detector que evita volver a las 20 sueltas', () => {
  it('marca una tarjeta nueva que nadie ubicó', () => {
    expect(sinUbicar(['MissingDataCard', 'TarjetaNueva'])).toEqual(['TarjetaNueva'])
  })

  it('no marca las que sí tienen lugar', () => {
    expect(sinUbicar(ordenDeMontaje())).toEqual([])
  })

  it('TODOS los componentes de salud del repo tienen un lugar asignado', () => {
    // Anti-silencio: se lee el import real de la página, así que si mañana alguien
    // agrega un componente y no lo ubica, este test lo dice — en vez de que aterrice
    // al final de la página, que es exactamente cómo se llegó a veinte tarjetas.
    const page = readFileSync('src/app/salud/page.tsx', 'utf8')
    const montados = [...new Set(
      [...page.matchAll(/<([A-Z][A-Za-z]+)/g)].map((m) => m[1]),
    // `Card`/`CardContent` son los primitivos de UI, no tarjetas de salud.
    )].filter((c) => /Card$|Panel$|Trend$|MisCapturas/.test(c) && !['Card', 'CardContent'].includes(c))
    expect(montados.length, 'no se detectó ningún componente — el barrido no probó nada').toBeGreaterThan(10)
    expect(sinUbicar(montados)).toEqual([])
  })
})

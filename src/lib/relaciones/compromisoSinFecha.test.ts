// SIR V2 — Tests del detector de compromisos sin fecha.
//
// Los dos POSITIVOS son los dos únicos casos reales que hay en la data de Aaron
// (medido el 6-ago-2026 sobre `people.notes`, `people.relational_notes` y
// `person_logs`). El bloque de negativos es el que importa más: con 2 casos reales
// en todo el corpus, un falso positivo cuesta más de lo que rinde un detectado extra.
import { describe, expect, it } from 'vitest'

import { detectarCompromisoSinFecha } from './compromisoSinFecha'

describe('los dos casos REALES de su data', () => {
  it('Diana, 1-ago: "hablamos bien y quedamos en vernos"', () => {
    const nota =
      'Conversacion de fondo del 31-jul 19:15 (ella lo recogio en el Polo, cancelo su voley). ' +
      'Aaron: "fue un 4, hablamos bien y quedamos en vernos". ' +
      'Es la conversacion que venian postergando desde el cumpleaños de ella y que el 30-jul habia terminado en pelea.'
    const r = detectarCompromisoSinFecha(nota)
    expect(r).not.toBeNull()
    expect(r!.senal).toBe('quedamos en vernos')
    // Cita el fragmento del compromiso, no el párrafo entero.
    expect(r!.frase).toContain('quedamos en vernos')
    expect(r!.frase).not.toContain('31-jul')
  })

  it('Shian Navarro: "lo vemos apenas tengamos definido esto"', () => {
    const r = detectarCompromisoSinFecha('mesa) lo vemos apenas tengamos definido esto')
    expect(r).not.toBeNull()
    expect(r!.senal).toBe('lo vemos')
  })
})

describe('NO inventa reuniones — los negativos son lo que más importa', () => {
  it('el cobro por Plin, que una búsqueda floja SÍ marcó por error', () => {
    const nota = 'Le cobre por Plin los S/793.90 pendientes (no pago el 25): pedidos mayo 70.90, 5-jun 50+40'
    expect(detectarCompromisoSinFecha(nota)).toBeNull()
  })

  it('si ya se vieron, no hay nada que agendar', () => {
    expect(detectarCompromisoSinFecha('Quedamos en vernos y nos vimos el finde')).toBeNull()
    expect(detectarCompromisoSinFecha('Nos juntamos ayer a tomar cafe')).toBeNull()
    expect(detectarCompromisoSinFecha('Anoche nos vimos, todo bien')).toBeNull()
  })

  it('si YA tiene fecha, no es asunto de este detector', () => {
    expect(detectarCompromisoSinFecha('Quedamos en vernos el jueves')).toBeNull()
    expect(detectarCompromisoSinFecha('Quedamos en vernos mañana')).toBeNull()
    expect(detectarCompromisoSinFecha('Quedamos en vernos a las 8 pm')).toBeNull()
    expect(detectarCompromisoSinFecha('Quedamos en vernos el 12/08')).toBeNull()
    expect(detectarCompromisoSinFecha('Nos vemos los martes en el gym')).toBeNull()
    expect(detectarCompromisoSinFecha('Hay que juntarnos este fin de semana')).toBeNull()
  })

  it('contacto NO es encuentro: no propone agenda para un mensaje', () => {
    expect(detectarCompromisoSinFecha('Tengo que llamarla')).toBeNull()
    expect(detectarCompromisoSinFecha('Pendiente escribirle a Miluska')).toBeNull()
    expect(detectarCompromisoSinFecha('Quedamos en hablar del tema')).toBeNull()
    expect(detectarCompromisoSinFecha('Hay que conversar sobre el presupuesto')).toBeNull()
  })

  it('no revienta con basura', () => {
    expect(detectarCompromisoSinFecha('')).toBeNull()
    expect(detectarCompromisoSinFecha('   ')).toBeNull()
    expect(detectarCompromisoSinFecha(null as unknown as string)).toBeNull()
    expect(detectarCompromisoSinFecha('...')).toBeNull()
  })
})

describe('la fecha de OTRO fragmento no descalifica al compromiso', () => {
  it('la nota puede tener una fecha en otra oración y detectar igual', () => {
    const r = detectarCompromisoSinFecha('Hablamos el 31-jul. Quedamos en vernos.')
    expect(r).not.toBeNull()
    expect(r!.frase).toBe('Quedamos en vernos')
  })

  it('pero la fecha del MISMO fragmento sí lo descalifica', () => {
    expect(detectarCompromisoSinFecha('Hablamos el 31-jul y quedamos en vernos el sabado')).toBeNull()
  })
})

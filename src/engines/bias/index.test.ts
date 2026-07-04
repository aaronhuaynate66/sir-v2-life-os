// SIR V2 — Tests del detector de sesgos (14·M1).

import { describe, it, expect } from 'vitest'
import { detectBiases, type Bias } from './index'

function biases(text: string): Bias[] {
  return detectBiases(text).hits.map((h) => h.bias)
}

describe('detectBiases — cada sesgo', () => {
  it('costo hundido', () => {
    expect(biases('Ya invertí demasiado, después de todo este tiempo no puedo dejar esto.')).toContain('sunk_cost')
  })
  it('sesgo del presente', () => {
    expect(biases('Tiene que ser ahora, no puedo esperar.')).toContain('present_bias')
  })
  it('aversión a la pérdida', () => {
    expect(biases('No quiero perder lo que logré.')).toContain('loss_aversion')
  })
  it('wishful thinking', () => {
    expect(biases('Seguro que sí, va a salir bien, obvio que me dice que sí.')).toContain('wishful_thinking')
  })
  it('sesgo de confirmación', () => {
    expect(biases('Obviamente es la mejor opción, no hay otra forma.')).toContain('confirmation')
  })
  it('falacia de planificación', () => {
    expect(biases('Es fácil, va a ser rápido, en dos días está.')).toContain('planning_fallacy')
  })
  it('todo o nada', () => {
    expect(biases('Es o todo o nada, no hay punto medio.')).toContain('all_or_nothing')
  })
})

describe('detectBiases — comportamiento', () => {
  it('cada hit trae su pregunta socrática', () => {
    const h = detectBiases('Ya invertí mucho.').hits.find((x) => x.bias === 'sunk_cost')
    expect(h?.question).toMatch(/\?$/)
    expect(h?.question.toLowerCase()).toContain('pasado')
  })
  it('la evidencia sale del texto original (conserva mayúsculas)', () => {
    const h = detectBiases('YA INVERTÍ un montón.').hits.find((x) => x.bias === 'sunk_cost')
    expect(h?.evidence[0]?.toUpperCase()).toContain('YA INVERT')
  })
  it('texto neutro → sin hits', () => {
    expect(detectBiases('Estoy viendo si aceptar el proyecto; hay pros y contras de los dos lados.').hits).toHaveLength(0)
  })
  it('texto vacío → sin hits, sin romper', () => {
    expect(detectBiases('').hits).toHaveLength(0)
  })
  it('no duplica evidencia repetida', () => {
    const h = detectBiases('obviamente obviamente obviamente').hits.find((x) => x.bias === 'confirmation')
    expect(h?.evidence).toHaveLength(1)
  })
  it('detecta varios sesgos a la vez', () => {
    const b = biases('Ya invertí mucho y tiene que ser ahora, obviamente va a salir bien.')
    expect(b).toEqual(expect.arrayContaining(['sunk_cost', 'present_bias']))
    expect(b.length).toBeGreaterThanOrEqual(3)
  })
})

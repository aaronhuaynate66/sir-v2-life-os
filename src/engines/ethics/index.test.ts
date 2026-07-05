// SIR V2 — Tests 16·M5: chequeo ético (guardrail transversal).

import { describe, it, expect } from 'vitest'
import { checkEthics } from './index'

describe('checkEthics — bloqueo (líneas duras)', () => {
  it('engaño → blocked', () => {
    const r = checkEthics('Quiero hacerme pasar por un cliente interesado para que me atienda')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'deception')).toBe(true)
    expect(r.message).toMatch(/línea que SIR no ayuda/)
    expect(r.litmus).toMatch(/te sentirías cómodo/i)
  })

  it('presión fabricada → blocked', () => {
    const r = checkEthics('Meterle presión con una urgencia falsa para que firme hoy')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'fabricated_pressure')).toBe(true)
  })

  it('explotar una debilidad → blocked', () => {
    const r = checkEthics('Aprovechar su miedo a quedarse sola para que acepte')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'exploit_vulnerability')).toBe(true)
  })

  it('el argumento pragmático aparece en el bloqueo', () => {
    const r = checkEthics('convencerla con una mentira')
    expect(r.message).toMatch(/gana la conversación y pierde la relación/)
  })
})

describe('checkEthics — cautela (zona gris afectiva)', () => {
  it('instrumentalizar afectivo con ámbito personal → caution', () => {
    const r = checkEthics('Cómo la manejo para que acepte venir a vivir conmigo', { ambito: 'personal' })
    expect(r.verdict).toBe('caution')
    expect(r.flags.some((f) => f.category === 'instrumentalize_affective')).toBe(true)
    expect(r.message).toMatch(/cuidado, no desde la estrategia/)
  })

  it('la MISMA frase en ámbito profesional NO marca instrumentalización afectiva', () => {
    const r = checkEthics('Cómo lo manejo para que acepte la propuesta', { ambito: 'lead' })
    expect(r.flags.some((f) => f.category === 'instrumentalize_affective')).toBe(false)
  })
})

describe('checkEthics — ok', () => {
  it('objetivo legítimo → ok, sin mensaje', () => {
    const r = checkEthics('Pedirle a Alex un aumento mostrando el valor que aporté este año')
    expect(r.verdict).toBe('ok')
    expect(r.message).toBe('')
    expect(r.litmus).toBe('')
  })

  it('reconciliación afectiva honesta → ok', () => {
    const r = checkEthics('Reparar la pelea con Diana y pedirle disculpas de verdad', { ambito: 'personal' })
    expect(r.verdict).toBe('ok')
  })

  it('texto vacío → ok', () => {
    expect(checkEthics('').verdict).toBe('ok')
  })
})

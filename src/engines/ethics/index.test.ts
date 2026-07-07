// SIR V2 - Tests 16.M5: Termometro de Jugada.

import { describe, it, expect } from 'vitest'
import { checkEthics } from './index'

describe('checkEthics - lineas rojas', () => {
  it('engano -> blocked con linea truth', () => {
    const r = checkEthics('Quiero hacerme pasar por un cliente interesado para que me atienda')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'deception')).toBe(true)
    expect(r.lines).toContain('truth')
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.message).toMatch(/linea roja/i)
    expect(r.litmus).toMatch(/Prueba de legitimidad/i)
  })

  it('presion fabricada -> blocked', () => {
    const r = checkEthics('Meterle presion con una urgencia falsa para que firme hoy')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'fabricated_pressure')).toBe(true)
    expect(r.safeAggressiveReframe).toMatch(/urgencia falsa/i)
  })

  it('coercion -> blocked', () => {
    const r = checkEthics('Chantajearlo para obligarlo a aceptar')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'coercion')).toBe(true)
  })

  it('explotar una debilidad -> blocked', () => {
    const r = checkEthics('Aprovechar su miedo a quedarse sola para que acepte')
    expect(r.verdict).toBe('blocked')
    expect(r.flags.some((f) => f.category === 'exploit_vulnerability')).toBe(true)
    expect(r.safeAggressiveReframe).toMatch(/incentivo legitimo/i)
  })
})

describe('checkEthics - riesgo alto y zona gris', () => {
  it('control afectivo con ambito personal -> high_risk', () => {
    const r = checkEthics('Como la manejo para que acepte venir a vivir conmigo', { ambito: 'personal' })
    expect(r.verdict).toBe('high_risk')
    expect(r.flags.some((f) => f.category === 'affective_control')).toBe(true)
    expect(r.message).toMatch(/reformular/i)
  })

  it('presionar en profesional -> caution, no blocked', () => {
    const r = checkEthics('Quiero presionar para que me respondan y negociar duro', { ambito: 'lead' })
    expect(r.verdict).toBe('caution')
    expect(r.flags.some((f) => f.category === 'strategic_pressure')).toBe(true)
    expect(r.message).toMatch(/Zona gris util/i)
  })

  it('decision critica -> high_risk', () => {
    const r = checkEthics('Invertir todo mi dinero sin consultar a nadie')
    expect(r.verdict).toBe('high_risk')
    expect(r.lines).toContain('critical')
  })
})

describe('checkEthics - ok', () => {
  it('objetivo legitimo -> ok, sin mensaje', () => {
    const r = checkEthics('Pedirle a Alex un aumento mostrando el valor que aporte este año')
    expect(r.verdict).toBe('ok')
    expect(r.message).toBe('')
    expect(r.litmus).toBe('')
    expect(r.score).toBe(10)
  })

  it('reconciliacion afectiva honesta -> ok', () => {
    const r = checkEthics('Reparar la pelea con Diana y pedirle disculpas de verdad', { ambito: 'personal' })
    expect(r.verdict).toBe('ok')
  })

  it('texto vacio -> ok', () => {
    expect(checkEthics('').verdict).toBe('ok')
  })
})

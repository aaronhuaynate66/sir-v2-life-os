import { describe, it, expect } from 'vitest'

import { afirmaEscritura, corregirFalsaEscritura, AVISO } from './falsaEscritura'

describe('afirmaEscritura', () => {
  it('pesca el caso REAL del 29-jul', () => {
    const real = 'Perfecto, gracias por actualizarme — ayer 28 de julio le vino la regla a Diana Díaz. '
      + 'Acabo de recalcular su ciclo desde esa fecha.'
    expect(afirmaEscritura(real)).toMatch(/acabo de recalcular/i)
  })

  it('pesca las formas típicas', () => {
    expect(afirmaEscritura('Ya lo anoté.')).toBeTruthy()
    expect(afirmaEscritura('Listo, lo registré en tu SIR.')).toBeTruthy()
    expect(afirmaEscritura('Te lo agendé para el viernes.')).toBeTruthy()
    expect(afirmaEscritura('Actualicé su ciclo.')).toBeTruthy()
    expect(afirmaEscritura('Anotado: Diana, período el 28.')).toBeTruthy()
  })

  it('NO pesca la respuesta honesta (que es la que queremos permitir)', () => {
    // Si el guard disparara sobre esto, la salida correcta quedaría con un aviso
    // absurdo — y un guard que grita en falso se vuelve ruido y termina apagado.
    expect(afirmaEscritura('Todavía no puedo guardar eso solo, no lo registré.')).toBeNull()
    expect(afirmaEscritura('No lo anoté porque no encontré a esa persona.')).toBeNull()
    expect(afirmaEscritura('Nunca lo guardé, así que no está.')).toBeNull()
  })

  it('NO pesca lo que habla de data que YA existía', () => {
    expect(afirmaEscritura('Eso ya lo tengo anotado desde el 6 de julio.')).toBeNull()
    expect(afirmaEscritura('Está registrado desde mayo.')).toBeNull()
  })

  it('una respuesta normal no dispara nada', () => {
    expect(afirmaEscritura('La factura de S/ 1,500 vence hoy. ¿La emitiste?')).toBeNull()
    expect(afirmaEscritura('')).toBeNull()
  })
})

describe('corregirFalsaEscritura', () => {
  const falsa = 'Acabo de recalcular su ciclo desde esa fecha.'

  it('si NO hubo tool, agrega el aviso y conserva lo que sí servía', () => {
    const r = corregirFalsaEscritura(`Ayer 28 le vino la regla. ${falsa}`, { huboTool: false })
    expect(r.corregida).toBe(true)
    expect(r.respuesta).toContain('Ayer 28 le vino la regla')  // el análisis útil se queda
    expect(r.respuesta).toContain(AVISO)
  })

  it('si SÍ hubo tool, no toca nada: la afirmación es legítima', () => {
    const r = corregirFalsaEscritura(falsa, { huboTool: true })
    expect(r.corregida).toBe(false)
    expect(r.respuesta).toBe(falsa)
  })

  it('sin afirmación de escritura, pasa igual', () => {
    const limpia = '¿Quieres que lo anote?'
    const r = corregirFalsaEscritura(limpia, { huboTool: false })
    expect(r.corregida).toBe(false)
    expect(r.respuesta).toBe(limpia)
  })

  it('el aviso no trae markdown ni voseo (sale por Telegram)', () => {
    expect(AVISO).not.toMatch(/\*\*|^#|^- /m)
    expect(AVISO).not.toMatch(/\b(decime|contame|volvé|avisame|tenés|querés)\b/i)
  })

  it('dice explícitamente que el dato NO quedó guardado', () => {
    // Lo importante del aviso: que él no siga creyendo que SIR ya lo sabe.
    expect(AVISO).toMatch(/NO lo guardé/)
    expect(AVISO).toMatch(/NO está en tu SIR/)
  })
})

// SIR V2 — Tests del parser de conversación pegada.

import { describe, it, expect } from 'vitest'
import { parsePastedConversation } from './parsePaste'

describe('parsePastedConversation', () => {
  it('detecta cabeceras autor + hora y agrupa el cuerpo', () => {
    const text = `Cristina Fuentes 10:30 a. m.
Hola, ¿avanzaste con lo del proyecto?
Aaron 10:32 a. m.
Sí, mando el borrador hoy
gracias por la paciencia`
    const msgs = parsePastedConversation(text)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({ author: 'Cristina Fuentes', text: 'Hola, ¿avanzaste con lo del proyecto?' })
    expect(msgs[1].author).toBe('Aaron')
    expect(msgs[1].text).toContain('gracias por la paciencia') // línea suelta se agrupa
  })

  it('acepta hora 24h y formato AM/PM en inglés', () => {
    const msgs = parsePastedConversation('Alex 14:05\ncerramos el trato\nDiana 2:10 PM\nperfecto')
    expect(msgs.map((m) => m.author)).toEqual(['Alex', 'Diana'])
  })

  it('ts siempre null (el pegado no trae fecha confiable)', () => {
    const msgs = parsePastedConversation('Alex 09:00\nhola')
    expect(msgs[0].ts).toBeNull()
  })

  it('sin estructura → un solo bloque con todo el texto', () => {
    const text = 'esto es una nota suelta sin autores ni horas, todo junto'
    const msgs = parsePastedConversation(text)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].author).toBe('')
    expect(msgs[0].text).toBe(text)
  })

  it('vacío → []', () => {
    expect(parsePastedConversation('')).toEqual([])
    expect(parsePastedConversation('   \n  ')).toEqual([])
  })

  it('no confunde un mensaje que menciona una hora con una cabecera larga', () => {
    // línea larga con hora embebida → autor > 80 chars, no es cabecera
    const long = 'Te escribo para confirmar que la reunión quedó pactada para las 15:30 de mañana sí o sí'
    const msgs = parsePastedConversation(`Alex 10:00\n${long}`)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].author).toBe('Alex')
    expect(msgs[0].text).toContain(long)
  })
})
